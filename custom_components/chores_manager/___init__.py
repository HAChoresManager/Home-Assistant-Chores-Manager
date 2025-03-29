"""Initialize the Chores Manager integration."""
import logging
import sqlite3
import os
import shutil
from pathlib import Path
import voluptuous as vol
from datetime import datetime, timedelta

from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers.typing import ConfigType
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.const import Platform
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.event import async_track_time_change

_LOGGER = logging.getLogger(__name__)

DOMAIN = "chores_manager"
PLATFORMS = [Platform.SENSOR]

FREQ_TYPES = ["Dagelijks", "Wekelijks", "Meerdere keren per week", "Maandelijks", "Meerdere keren per maand", "Per kwartaal", "Halfjaarlijks", "Jaarlijks"]
PRIORITY_TYPES = ["Hoog", "Middel", "Laag"]
ASSIGNEE_TYPES = ["Martijn", "Laura", "Samen", "Wie kan"]

ATTR_CHORE_ID = "chore_id"
ATTR_NAME = "name"
ATTR_FREQUENCY_TYPE = "frequency_type"
ATTR_FREQUENCY_DAYS = "frequency_days"
ATTR_FREQUENCY_TIMES = "frequency_times"
ATTR_ASSIGNED_TO = "assigned_to"
ATTR_PRIORITY = "priority"
ATTR_DURATION = "duration"
ATTR_PERSON = "person"
ATTR_ICON = "icon"
ATTR_DESCRIPTION = "description"
ATTR_ALTERNATE_WITH = "alternate_with"
ATTR_USE_ALTERNATING = "use_alternating"
ATTR_START_MONTH = "startMonth"
ATTR_START_DAY = "startDay"
ATTR_WEEKDAY = "weekday"
ATTR_MONTHDAY = "monthday"
ATTR_USER_ID = "user_id"
ATTR_COLOR = "color"
ATTR_ACTIVE = "active"

CONFIG_SCHEMA = vol.Schema({
    DOMAIN: vol.Schema({
        vol.Optional("database", default="chores_manager.db"): cv.string,
        vol.Optional("notification_time", default="08:00"): cv.time,
    })
}, extra=vol.ALLOW_EXTRA)

# Schema that accepts ANY field as optional, only ID is required
ADD_CHORE_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Optional(ATTR_NAME): cv.string,
    vol.Optional(ATTR_FREQUENCY_TYPE): str,  # Accept any string to be more permissive
    vol.Optional(ATTR_FREQUENCY_DAYS): vol.Coerce(int),  # Coerce to int
    vol.Optional(ATTR_FREQUENCY_TIMES): vol.Coerce(int),  # Coerce to int
    vol.Optional(ATTR_ASSIGNED_TO): str,  # Accept any string
    vol.Optional(ATTR_PRIORITY): str,  # Accept any string
    vol.Optional(ATTR_DURATION): vol.Coerce(int),  # Coerce to int
    vol.Optional(ATTR_ICON): cv.string,
    vol.Optional(ATTR_DESCRIPTION): cv.string,
    vol.Optional(ATTR_ALTERNATE_WITH): cv.string,
    vol.Optional(ATTR_USE_ALTERNATING): vol.Any(bool, vol.Coerce(bool)),  # Handle boolean or string
    vol.Optional(ATTR_START_MONTH): vol.Coerce(int),  # For quarterly and semi-annual tasks
    vol.Optional(ATTR_START_DAY): vol.Coerce(int),    # For quarterly and semi-annual tasks
    vol.Optional(ATTR_WEEKDAY): vol.Coerce(int),      # For weekly tasks (0=Monday, 6=Sunday)
    vol.Optional(ATTR_MONTHDAY): vol.Coerce(int),     # For monthly tasks (1-31)
    vol.Optional("notify_when_due"): vol.Any(bool, vol.Coerce(bool)),  # Notification option
}, extra=vol.ALLOW_EXTRA)  # Allow any extra fields to pass through

MARK_DONE_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Required(ATTR_PERSON): cv.string,
})

UPDATE_DESCRIPTION_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Required(ATTR_DESCRIPTION): cv.string,
})

ADD_USER_SCHEMA = vol.Schema({
    vol.Required("id"): cv.string,
    vol.Required("name"): cv.string,
    vol.Optional("color", default="#CCCCCC"): cv.string,
    vol.Optional("active", default=True): vol.Any(bool, vol.Coerce(bool)),
    vol.Optional("ha_user_id"): cv.string,  # Home Assistant user ID
})

DELETE_USER_SCHEMA = vol.Schema({
    vol.Required("user_id"): cv.string,
})

FORCE_DUE_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Optional("notify", default=False): vol.Any(bool, vol.Coerce(bool)),
    vol.Optional("message"): cv.string,
})

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the chores manager component."""
    if DOMAIN not in config:
        return True

    # Handle database path - allow relative or absolute
    database_name = config[DOMAIN].get("database", "chores_manager.db")
    if not os.path.isabs(database_name):
        database_path = Path(hass.config.path(database_name))
    else:
        database_path = Path(database_name)

    _LOGGER.info("Setting up chores_manager with database at: %s", database_path)

    def init_database():
        """Initialize SQLite database."""
        _LOGGER.debug("Initializing database at %s", database_path)
        conn = sqlite3.connect(str(database_path))
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chores (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                frequency_type TEXT NOT NULL,
                frequency_days INTEGER NOT NULL,
                frequency_times INTEGER NOT NULL,
                assigned_to TEXT NOT NULL,
                priority TEXT NOT NULL,
                duration INTEGER NOT NULL,
                last_done TIMESTAMP,
                last_done_by TEXT,
                icon TEXT,
                description TEXT,
                alternate_with TEXT,
                use_alternating BOOLEAN DEFAULT 0,
                startMonth INTEGER DEFAULT 0,
                startDay INTEGER DEFAULT 1,
                weekday INTEGER DEFAULT -1,
                monthday INTEGER DEFAULT -1,
                notify_when_due BOOLEAN DEFAULT 0
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chore_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chore_id TEXT NOT NULL,
                done_by TEXT NOT NULL,
                done_at TIMESTAMP NOT NULL,
                FOREIGN KEY (chore_id) REFERENCES chores(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS assignees (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#CCCCCC',
                active BOOLEAN DEFAULT 1,
                ha_user_id TEXT
            )
        ''')

        # Create notification log table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notification_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chore_id TEXT NOT NULL,
                sent_at TIMESTAMP NOT NULL,
                FOREIGN KEY (chore_id) REFERENCES chores(id)
            )
        ''')

        # Check if columns exist and add them if not
        try:
            cursor.execute("SELECT icon FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN icon TEXT")

        try:
            cursor.execute("SELECT description FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN description TEXT")

        try:
            cursor.execute("SELECT alternate_with FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN alternate_with TEXT")

        try:
            cursor.execute("SELECT use_alternating FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN use_alternating BOOLEAN DEFAULT 0")

        try:
            cursor.execute("SELECT startMonth FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN startMonth INTEGER DEFAULT 0")

        try:
            cursor.execute("SELECT startDay FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN startDay INTEGER DEFAULT 1")

        try:
            cursor.execute("SELECT weekday FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN weekday INTEGER DEFAULT -1")

        try:
            cursor.execute("SELECT monthday FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN monthday INTEGER DEFAULT -1")

        try:
            cursor.execute("SELECT notify_when_due FROM chores LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE chores ADD COLUMN notify_when_due BOOLEAN DEFAULT 0")

        try:
            cursor.execute("SELECT ha_user_id FROM assignees LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE assignees ADD COLUMN ha_user_id TEXT")

        # Initialize default assignees if needed
        cursor.execute("SELECT COUNT(*) FROM assignees")
        if cursor.fetchone()[0] == 0:
            default_assignees = [
                ('laura', 'Laura', '#F5B7B1', 1, None),
                ('martijn', 'Martijn', '#F9E79F', 1, None),
                ('wie_kan', 'Wie kan', '#A9DFBF', 1, None)
            ]
            cursor.executemany(
                "INSERT INTO assignees (id, name, color, active, ha_user_id) VALUES (?, ?, ?, ?, ?)",
                default_assignees
            )

        # Remove "Samen" for existing installations
        cursor.execute("DELETE FROM assignees WHERE id = 'samen'")

        conn.commit()
        conn.close()

        # Verify we can read data
        conn = sqlite3.connect(str(database_path))
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM chores")
        count = cursor.fetchone()[0]
        _LOGGER.debug("Found %d existing chores in database", count)
        conn.close()

    async def handle_add_chore(call: ServiceCall) -> None:
        """Handle the add_chore service call."""
        chore_data = dict(call.data)
        chore_id = chore_data[ATTR_CHORE_ID]
        _LOGGER.debug("Adding/updating chore: %s", chore_id)

        try:
            def add_to_db():
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()

                # Check if this is an update or a new entry
                cursor.execute("SELECT * FROM chores WHERE id = ?", (chore_id,))
                existing_chore = cursor.fetchone()

                if existing_chore:
                    _LOGGER.debug("Updating existing chore: %s", chore_id)

                    # IMPORTANT: Get current values first, including last_done fields
                    cursor.execute(
                        "SELECT * FROM chores WHERE id = ?", (chore_id,)
                    )
                    columns = [description[0] for description in cursor.description]
                    row_data = cursor.fetchone()
                    current_data = dict(zip(columns, row_data))

                    # Only update fields that were provided in the call
                    for key, value in chore_data.items():
                        if key != ATTR_CHORE_ID and key in columns:  # Skip ID and non-existent columns
                            # Convert boolean values for SQLite
                            if key in ['use_alternating', 'notify_when_due'] and isinstance(value, bool):
                                current_data[key] = 1 if value else 0
                            else:
                                current_data[key] = value

                    # Build update query
                    update_pairs = []
                    update_values = []
                    for key, value in current_data.items():
                        if key != 'id':  # Skip ID field
                            update_pairs.append(f"{key} = ?")
                            update_values.append(value)

                    # Add the ID for the WHERE clause
                    update_values.append(chore_id)

                    # Execute the update
                    update_sql = f"UPDATE chores SET {', '.join(update_pairs)} WHERE id = ?"
                    cursor.execute(update_sql, update_values)
                else:
                    _LOGGER.debug("Adding new chore: %s", chore_id)

                    # Set default values for required fields if not provided
                    defaults = {
                        'name': chore_id,
                        'frequency_type': 'Wekelijks',
                        'frequency_days': 7,
                        'frequency_times': 1,
                        'assigned_to': 'Wie kan',
                        'priority': 'Middel',
                        'duration': 15,
                        'icon': '📋',
                        'description': '',
                        'alternate_with': '',
                        'use_alternating': 0,
                        'startMonth': 0,
                        'startDay': 1,
                        'weekday': -1,
                        'monthday': -1,
                        'notify_when_due': 0
                    }

                    # Create complete data for insert
                    insert_data = {**defaults}
                    for key, value in chore_data.items():
                        if key != ATTR_CHORE_ID:
                            # Convert boolean values for SQLite
                            if key in ['use_alternating', 'notify_when_due'] and isinstance(value, bool):
                                insert_data[key] = 1 if value else 0
                            else:
                                insert_data[key] = value

                    # Handle special frequency values
                    if insert_data.get('frequency_type') == "Meerdere keren per week":
                        insert_data['frequency_days'] = 7
                        insert_data['frequency_times'] = min(max(1, insert_data.get('frequency_times', 2)), 7)
                    elif insert_data.get('frequency_type') == "Meerdere keren per maand":
                        insert_data['frequency_days'] = 30
                        insert_data['frequency_times'] = min(max(1, insert_data.get('frequency_times', 4)), 30)
                    elif insert_data.get('frequency_type') == "Per kwartaal":
                        insert_data['frequency_days'] = 90
                        insert_data['frequency_times'] = 1
                    elif insert_data.get('frequency_type') == "Halfjaarlijks":
                        insert_data['frequency_days'] = 180
                        insert_data['frequency_times'] = 1

                    # Build insert query
                    columns = ['id'] + list(insert_data.keys())
                    placeholders = ['?'] * len(columns)
                    values = [chore_id] + list(insert_data.values())

                    # Execute the insert
                    insert_sql = f"INSERT INTO chores ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
                    cursor.execute(insert_sql, values)

                conn.commit()
                conn.close()
                return {"success": True, "chore_id": chore_id}

            result = await hass.async_add_executor_job(add_to_db)
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error adding/updating chore: %s", err, exc_info=True)
            raise

    async def handle_mark_done(call: ServiceCall) -> None:
        """Handle the mark_done service call."""
        chore_id = call.data[ATTR_CHORE_ID]
        person = call.data[ATTR_PERSON]

        try:
            def update_db():
                now = datetime.now().isoformat()
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()

                # Check if this chore uses alternating assignees
                cursor.execute(
                    "SELECT use_alternating, assigned_to, alternate_with FROM chores WHERE id = ?",
                    (chore_id,)
                )
                result = cursor.fetchone()

                if result and result[0]:  # If use_alternating is True
                    uses_alternating, current_assignee, alternate_with = result

                    # Alternate the assignee
                    if alternate_with and len(alternate_with) > 0:
                        # Swap the assignees
                        cursor.execute(
                            "UPDATE chores SET assigned_to = ?, alternate_with = ? WHERE id = ?",
                            (alternate_with, current_assignee, chore_id)
                        )

                # Update last done information
                cursor.execute('''
                    UPDATE chores
                    SET last_done = ?, last_done_by = ?
                    WHERE id = ?
                ''', (now, person, chore_id))

                cursor.execute('''
                    INSERT INTO chore_history (chore_id, done_by, done_at)
                    VALUES (?, ?, ?)
                ''', (chore_id, person, now))

                conn.commit()
                conn.close()

                return {"success": True, "chore_id": chore_id, "done_at": now, "done_by": person}

            result = await hass.async_add_executor_job(update_db)
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error marking chore as done: %s", err)
            raise

    async def handle_update_description(call: ServiceCall) -> None:
        """Handle updating a chore description."""
        chore_id = call.data[ATTR_CHORE_ID]
        description = call.data[ATTR_DESCRIPTION]

        try:
            def update_db_description():
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE chores SET description = ? WHERE id = ?",
                    (description, chore_id)
                )
                conn.commit()
                conn.close()
                return {"success": True, "chore_id": chore_id}

            result = await hass.async_add_executor_job(update_db_description)
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error updating chore description: %s", err)
            raise

    async def handle_add_user(call: ServiceCall) -> None:
        """Handle adding or updating a user."""
        user_id = call.data.get("id")
        name = call.data.get("name")
        color = call.data.get("color", "#CCCCCC")
        active = 1 if call.data.get("active", True) else 0
        ha_user_id = call.data.get("ha_user_id")

        if not user_id or not name:
            raise ValueError("User must have both id and name")

        try:
            def update_db_user():
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()

                # Check if user exists
                cursor.execute("SELECT * FROM assignees WHERE id = ?", (user_id,))
                existing_user = cursor.fetchone()

                if existing_user:
                    cursor.execute(
                        "UPDATE assignees SET name = ?, color = ?, active = ?, ha_user_id = ? WHERE id = ?",
                        (name, color, active, ha_user_id, user_id)
                    )
                else:
                    cursor.execute(
                        "INSERT INTO assignees (id, name, color, active, ha_user_id) VALUES (?, ?, ?, ?, ?)",
                        (user_id, name, color, active, ha_user_id)
                    )

                conn.commit()
                conn.close()
                return {"success": True, "user_id": user_id}

            result = await hass.async_add_executor_job(update_db_user)
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error adding/updating user: %s", err)
            raise

    async def handle_reset_chore(call: ServiceCall) -> None:
        """Handle resetting a chore completely including history."""
        chore_id = call.data[ATTR_CHORE_ID]

        try:
            def reset_in_db():
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()

                # First get the completion info for stats reversion
                cursor.execute(
                    "SELECT last_done_by, duration FROM chores WHERE id = ?",
                    (chore_id,)
                )
                result = cursor.fetchone()

                # Remove from history table for today
                cursor.execute('''
                    DELETE FROM chore_history
                    WHERE chore_id = ? AND date(done_at) = date('now')
                ''', (chore_id,))

                # Clear the last_done and last_done_by fields
                cursor.execute('''
                    UPDATE chores
                    SET last_done = NULL, last_done_by = NULL
                    WHERE id = ?
                ''', (chore_id,))

                conn.commit()
                conn.close()

                return {"success": True, "chore_id": chore_id, "last_done_by": result[0] if result else None}

            result = await hass.async_add_executor_job(reset_in_db)
            # Force immediate update
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error resetting chore: %s", err)
            raise

    async def handle_delete_user(call: ServiceCall) -> None:
        """Handle deleting a user."""
        user_id = call.data.get("user_id")

        if not user_id:
            raise ValueError("User ID is required")

        # Don't allow deleting default users
        if user_id in ["laura", "martijn", "samen", "wie_kan"]:
            _LOGGER.warning("Cannot delete default user: %s", user_id)
            return {"success": False, "error": "Cannot delete default user"}

        try:
            def delete_db_user():
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()

                # Get user name before deleting
                cursor.execute("SELECT name FROM assignees WHERE id = ?", (user_id,))
                user = cursor.fetchone()

                if not user:
                    conn.close()
                    return {"success": False, "error": "User not found"}

                user_name = user[0]

                # Update any tasks assigned to this user
                cursor.execute(
                    "UPDATE chores SET assigned_to = 'Wie kan' WHERE assigned_to = ?",
                    (user_name,)
                )

                cursor.execute(
                    "UPDATE chores SET alternate_with = 'Wie kan' WHERE alternate_with = ?",
                    (user_name,)
                )

                # Delete the user
                cursor.execute("DELETE FROM assignees WHERE id = ?", (user_id,))

                conn.commit()
                conn.close()
                return {"success": True, "user_id": user_id}

            result = await hass.async_add_executor_job(delete_db_user)
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error deleting user: %s", err)
            raise

    async def handle_get_ha_users(call: ServiceCall) -> None:
        """Get list of available Home Assistant users."""
        try:
            # Get all users
            users = await hass.auth.async_get_users()

            # Filter out system users
            valid_users = [
                {
                    "id": user.id,
                    "name": user.name,
                    "is_active": user.is_active
                }
                for user in users
                if not user.system_generated and user.is_active
            ]

            return {"users": valid_users}
        except Exception as err:
            _LOGGER.error("Error getting HA users: %s", err)
            raise

    async def handle_force_due(call: ServiceCall) -> None:
        """Handle forcing a task to be due today."""
        chore_id = call.data[ATTR_CHORE_ID]
        should_notify = call.data.get("notify", False)
        custom_message = call.data.get("message")

        try:
            def update_db():
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()

                # Get chore details
                cursor.execute(
                    "SELECT name, assigned_to, frequency_type, frequency_days, notify_when_due FROM chores WHERE id = ?",
                    (chore_id,)
                )
                chore_result = cursor.fetchone()

                if not chore_result:
                    conn.close()
                    return {"success": False, "error": f"Chore {chore_id} not found"}

                chore_name, assigned_to, frequency_type, frequency_days, notify_when_due = chore_result

                # Calculate days to shift based on frequency type
                if frequency_type == 'Dagelijks':
                    shift_days = 1
                elif frequency_type == 'Wekelijks':
                    shift_days = 7
                elif frequency_type == 'Meerdere keren per week':
                    shift_days = 3  # Conservative estimate
                elif frequency_type == 'Maandelijks':
                    shift_days = 30
                else:
                    shift_days = frequency_days or 7

                # Set the last_done date to make it due today
                # We set it to (shift_days + 1 day) in the past
                due_date = (datetime.now() - timedelta(days=shift_days + 1)).isoformat()

                # Update the last_done field
                cursor.execute(
                    "UPDATE chores SET last_done = ? WHERE id = ?",
                    (due_date, chore_id)
                )

                # If notification is enabled, log to prevent duplicates
                if notify_when_due:
                    cursor.execute(
                        "INSERT INTO notification_log (chore_id, sent_at) VALUES (?, ?)",
                        (chore_id, datetime.now().isoformat())
                    )

                conn.commit()
                conn.close()

                return {
                    "success": True,
                    "chore_id": chore_id,
                    "chore_name": chore_name,
                    "assigned_to": assigned_to,
                    "has_auto_notify": bool(notify_when_due)
                }

            result = await hass.async_add_executor_job(update_db)

            # Notification handling:
            if should_notify and result.get("success"):
                # Two options:
                # 1. Custom message - send direct notification
                # 2. No custom message - check other tasks and send a summary

                if custom_message:
                    # If there's a custom message, send a direct notification
                    chore_name = result.get("chore_name", chore_id)
                    assigned_to = result.get("assigned_to")
                    ha_user_id = await get_ha_user_id_for_assignee(hass, assigned_to)

                    if ha_user_id:
                        await send_user_summary_notification(
                            hass,
                            ha_user_id,
                            "Taak toegevoegd",
                            custom_message
                        )
                else:
                    # No custom message - update tasks due notification
                    if result.get("has_auto_notify"):
                        # Run the standard notification check which will handle this
                        await async_check_due_notifications(hass)
                    else:
                        # Simple notification
                        chore_name = result.get("chore_name", chore_id)
                        assigned_to = result.get("assigned_to")
                        ha_user_id = await get_ha_user_id_for_assignee(hass, assigned_to)

                        if ha_user_id:
                            await send_user_summary_notification(
                                hass,
                                ha_user_id,
                                "Taak op planning",
                                f"Taak '{chore_name}' staat op de planning voor vandaag"
                            )

            # Force an immediate update
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error forcing chore due: %s", err)
            raise

    async def get_ha_user_id_for_assignee(hass, assignee_name):
        """Get the HA user ID for an assignee."""
        def query_db():
            conn = sqlite3.connect(str(database_path))
            cursor = conn.cursor()
            cursor.execute(
                "SELECT ha_user_id FROM assignees WHERE name = ?",
                (assignee_name,)
            )
            result = cursor.fetchone()
            conn.close()
            return result[0] if result else None

        return await hass.async_add_executor_job(query_db)

    async def async_check_due_notifications(hass):
        """Check for tasks due today and send summary notifications."""
        try:
            def get_due_tasks_needing_notification():
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()

                # Get all tasks with notifications enabled that are due today
                cursor.execute("""
                    SELECT
                        c.id,
                        c.name,
                        c.assigned_to,
                        a.ha_user_id,
                        c.priority
                    FROM chores c
                    LEFT JOIN assignees a ON c.assigned_to = a.name
                    LEFT JOIN notification_log nl ON
                        c.id = nl.chore_id AND
                        date(nl.sent_at) = date('now')
                    WHERE
                        c.notify_when_due = 1 AND
                        a.ha_user_id IS NOT NULL AND
                        nl.id IS NULL AND
                        (
                            -- New task (never completed)
                            c.last_done IS NULL OR

                            -- Based on frequency, it's due today
                            (
                                CASE
                                    WHEN c.frequency_type = 'Dagelijks' THEN
                                        julianday('now') - julianday(c.last_done) >= 1
                                    WHEN c.frequency_type = 'Wekelijks' THEN
                                        julianday('now') - julianday(c.last_done) >= 7
                                    WHEN c.frequency_type = 'Meerdere keren per week' THEN
                                        julianday('now') - julianday(c.last_done) >= (7.0 / c.frequency_times)
                                    WHEN c.frequency_type = 'Maandelijks' THEN
                                        julianday('now') - julianday(c.last_done) >= 30
                                    WHEN c.frequency_type = 'Meerdere keren per maand' THEN
                                        julianday('now') - julianday(c.last_done) >= (30.0 / c.frequency_times)
                                    WHEN c.frequency_type = 'Per kwartaal' THEN
                                        julianday('now') - julianday(c.last_done) >= 90
                                    WHEN c.frequency_type = 'Halfjaarlijks' THEN
                                        julianday('now') - julianday(c.last_done) >= 180
                                    WHEN c.frequency_type = 'Jaarlijks' THEN
                                        julianday('now') - julianday(c.last_done) >= 365
                                    ELSE
                                        julianday('now') - julianday(c.last_done) >= c.frequency_days
                                END
                            ) AND

                            -- Not already completed today
                            (date(c.last_done) != date('now'))
                        )
                    ORDER BY c.priority ASC
                """)

                due_tasks = cursor.fetchall()
                conn.close()
                return due_tasks

            due_tasks = await hass.async_add_executor_job(get_due_tasks_needing_notification)

            # Group tasks by user
            tasks_by_user = {}
            task_ids = []

            for task_id, task_name, assigned_to, ha_user_id, priority in due_tasks:
                if not ha_user_id:
                    continue

                if ha_user_id not in tasks_by_user:
                    tasks_by_user[ha_user_id] = []

                tasks_by_user[ha_user_id].append({
                    'id': task_id,
                    'name': task_name,
                    'assigned_to': assigned_to,
                    'priority': priority
                })

                task_ids.append(task_id)

            # Send summary notifications for each user
            for ha_user_id, user_tasks in tasks_by_user.items():
                if not user_tasks:
                    continue

                # Create summary message
                if len(user_tasks) == 1:
                    title = "Taak op planning voor vandaag"
                    message = f"Je hebt 1 taak op de planning voor vandaag: {user_tasks[0]['name']}"
                else:
                    title = f"{len(user_tasks)} taken op planning voor vandaag"
                    # Sort tasks by priority
                    priority_order = {'Hoog': 0, 'Middel': 1, 'Laag': 2}
                    sorted_tasks = sorted(user_tasks, key=lambda t: priority_order.get(t['priority'], 99))

                    task_list = "\n".join([f"• {task['name']}" for task in sorted_tasks])
                    message = f"Je hebt {len(user_tasks)} taken op de planning voor vandaag:\n{task_list}"

                # Send the notification
                await send_user_summary_notification(hass, ha_user_id, title, message)

                # Log all these tasks as notified
                def log_notifications():
                    conn = sqlite3.connect(str(database_path))
                    cursor = conn.cursor()
                    now = datetime.now().isoformat()

                    for task in user_tasks:
                        cursor.execute(
                            "INSERT INTO notification_log (chore_id, sent_at) VALUES (?, ?)",
                            (task['id'], now)
                        )

                    conn.commit()
                    conn.close()

                await hass.async_add_executor_job(log_notifications)

        except Exception as e:
            _LOGGER.error("Error sending due task notifications: %s", e)

    async def send_user_summary_notification(hass, ha_user_id, title, message):
        """Send a summary notification to a user's devices."""
        try:
            user = await hass.auth.async_get_user(ha_user_id)
            if not user:
                _LOGGER.warning(f"User with ID {ha_user_id} not found")
                return False

            # Get all user's devices
            sent = False
            user_devices = await hass.auth.async_get_user_devices(ha_user_id)
            for device in user_devices:
                if hasattr(device, 'push_token') and device.push_token:
                    try:
                        device_name = device.name if device.name else device.id
                        _LOGGER.debug(f"Sending notification to {user.name}'s device: {device_name}")

                        # Create rich notification
                        rich_content = {
                            "push": {
                                "sound": "default",
                                "badge": 1,
                                "interruption-level": "time-sensitive"
                            },
                            "tag": "chores_summary",
                            "group": "chores",
                            "color": "#f59e0b",
                            "actions": [
                                {
                                    "action": "VIEW_TASKS",
                                    "title": "Bekijk Taken",
                                    "uri": "/chores-dashboard/index.html"
                                },
                                {
                                    "action": "DISMISS",
                                    "title": "Later",
                                    "destructive": False
                                }
                            ]
                        }

                        # Send notification
                        await hass.services.async_call(
                            'notify',
                            f'mobile_app_{device.id}',
                            {
                                "title": title,
                                "message": message,
                                "data": rich_content
                            }
                        )
                        sent = True
                    except Exception as e:
                        _LOGGER.error(f"Failed to send notification to device {device.id}: {str(e)}")

            # If no mobile devices found, try persistent notification
            if not sent:
                await hass.services.async_call(
                    'persistent_notification',
                    'create',
                    {
                        "title": title,
                        "message": message
                    }
                )

            return sent
        except Exception as e:
            _LOGGER.error(f"Error sending summary notification: {str(e)}")
            return False

    # Initialize database
    await hass.async_add_executor_job(init_database)

    # Create symlink for web assets
    www_source = os.path.join(os.path.dirname(__file__), "www")
    www_target = os.path.join(hass.config.path("www"), "chores_manager")

    # Remove old symlink if it exists
    if os.path.islink(www_target):
        os.unlink(www_target)
    elif os.path.isdir(www_target):
        shutil.rmtree(www_target)

    # Create new symlink
    try:
        os.symlink(www_source, www_target)
        _LOGGER.info(f"Created symlink from {www_source} to {www_target}")
    except Exception as e:
        _LOGGER.error(f"Failed to create symlink: {e}")

    # Store the database path
    hass.data[DOMAIN] = {
        "database_path": database_path,
    }

    # Register services
    hass.services.async_register(
        DOMAIN,
        "add_chore",
        handle_add_chore,
        schema=ADD_CHORE_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "mark_done",
        handle_mark_done,
        schema=MARK_DONE_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "update_description",
        handle_update_description,
        schema=UPDATE_DESCRIPTION_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "add_user",
        handle_add_user,
        schema=ADD_USER_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "delete_user",
        handle_delete_user,
        schema=DELETE_USER_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "reset_chore",
        handle_reset_chore,
        schema=vol.Schema({
            vol.Required(ATTR_CHORE_ID): cv.string,
        })
    )

    hass.services.async_register(
        DOMAIN,
        "get_ha_users",
        handle_get_ha_users
    )

    hass.services.async_register(
        DOMAIN,
        "force_due",
        handle_force_due,
        schema=FORCE_DUE_SCHEMA
    )

    # Schedule daily notification check
    notification_time_str = config[DOMAIN].get("notification_time", "08:00")
    try:
        notification_time = datetime.strptime(notification_time_str, "%H:%M").time()
    except ValueError:
        _LOGGER.error(f"Invalid notification_time format: {notification_time_str}. Using default 08:00.")
        notification_time = datetime.strptime("08:00", "%H:%M").time()

    async def _async_daily_notification_check(now=None):
        """Run the daily notification check."""
        await async_check_due_notifications(hass)

    # Run once at startup and then at configured time every day
    await _async_daily_notification_check()
    async_track_time_change(
        hass,
        _async_daily_notification_check,
        hour=notification_time.hour,
        minute=notification_time.minute,
        second=0
    )

    # Set up sensor platform using discovery
    hass.async_create_task(
        hass.helpers.discovery.async_load_platform(
            Platform.SENSOR, DOMAIN, {"database_path": str(database_path)}, config
        )
    )

    return True
