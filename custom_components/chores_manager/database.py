"""Database operations for Chores Manager."""
import sqlite3
import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional

_LOGGER = logging.getLogger(__name__)


def init_database(database_path: str) -> None:
    """Initialize the database with required tables."""
    _LOGGER.info("Initializing database at %s", database_path)

    # Ensure directory exists
    os.makedirs(os.path.dirname(os.path.abspath(database_path)), exist_ok=True)

    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    # Create tables if they don't exist
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

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notification_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chore_id TEXT NOT NULL,
            sent_at TIMESTAMP NOT NULL
        )
    ''')

    # Set up default assignees if none exist
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

    conn.commit()
    conn.close()
    _LOGGER.info("Database initialized successfully")


def verify_database(database_path: str) -> bool:
    """Verify database is accessible."""
    try:
        init_database(database_path)
        conn = sqlite3.connect(database_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM chores")
        count = cursor.fetchone()[0]
        conn.close()
        _LOGGER.info("Database verified: %d tasks found", count)
        return True
    except Exception as e:
        _LOGGER.error("Database verification failed: %s", e)
        return False


def add_chore_to_db(database_path: str, chore_data: Dict[str, Any]) -> Dict[str, Any]:
    """Add or update a chore in the database."""
    chore_id = chore_data.get("chore_id")
    if not chore_id:
        raise ValueError("Missing required chore_id")

    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    # Build field lists for dynamic query
    fields = [key for key in chore_data.keys() if key != "chore_id"]
    values = [chore_data[key] for key in fields]

    try:
        # Convert boolean values for SQLite
        for i, value in enumerate(values):
            if isinstance(value, bool):
                values[i] = 1 if value else 0

        # Check if this is an update or a new entry
        cursor.execute("SELECT * FROM chores WHERE id = ?", (chore_id,))
        existing_chore = cursor.fetchone()

        if existing_chore:
            # Build update query
            updates = [f"{field} = ?" for field in fields]
            query = f"UPDATE chores SET {', '.join(updates)} WHERE id = ?"
            cursor.execute(query, values + [chore_id])
        else:
            # Set default values
            defaults = {
                'name': chore_id,
                'frequency_type': 'Wekelijks',
                'frequency_days': 7,
                'frequency_times': 1,
                'assigned_to': 'Wie kan',
                'priority': 'Middel',
                'duration': 15,
                'icon': '📋'
            }

            # Fill in missing fields with defaults
            for key, value in defaults.items():
                if key not in fields:
                    fields.append(key)
                    values.append(value)

            # Build insert query
            query = f"INSERT INTO chores (id, {', '.join(fields)}) VALUES (?, {', '.join(['?'] * len(fields))})"
            cursor.execute(query, [chore_id] + values)

        conn.commit()
        return {"success": True, "chore_id": chore_id}
    except Exception as e:
        _LOGGER.error("Error in add_chore_to_db: %s", e)
        raise
    finally:
        conn.close()


def mark_chore_done(database_path: str, chore_id: str, person: str) -> Dict[str, Any]:
    """Mark a chore as done in the database."""
    now = datetime.now().isoformat()
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
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
        return {"success": True, "chore_id": chore_id, "done_at": now, "done_by": person}
    except Exception as e:
        _LOGGER.error("Error in mark_chore_done: %s", e)
        raise
    finally:
        conn.close()


def update_chore_description(database_path: str, chore_id: str, description: str) -> Dict[str, Any]:
    """Update a chore's description in the database."""
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "UPDATE chores SET description = ? WHERE id = ?",
            (description, chore_id)
        )
        conn.commit()
        return {"success": True, "chore_id": chore_id}
    except Exception as e:
        _LOGGER.error("Error in update_chore_description: %s", e)
        raise
    finally:
        conn.close()


def reset_chore(database_path: str, chore_id: str) -> Dict[str, Any]:
    """Reset a chore's completion status completely."""
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
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
        return {"success": True, "chore_id": chore_id}
    except Exception as e:
        _LOGGER.error("Error in reset_chore: %s", e)
        raise
    finally:
        conn.close()


def add_user(database_path: str, user_data: Dict[str, Any]) -> Dict[str, Any]:
    """Add or update a user in the database."""
    user_id = user_data.get("id")
    name = user_data.get("name")
    color = user_data.get("color", "#CCCCCC")
    active = 1 if user_data.get("active", True) else 0
    ha_user_id = user_data.get("ha_user_id")

    if not user_id or not name:
        raise ValueError("User must have both id and name")

    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
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
        return {"success": True, "user_id": user_id}
    except Exception as e:
        _LOGGER.error("Error in add_user: %s", e)
        raise
    finally:
        conn.close()


def delete_user(database_path: str, user_id: str) -> Dict[str, Any]:
    """Delete a user from the database."""
    if not user_id:
        raise ValueError("User ID is required")

    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
        # Get user name before deleting
        cursor.execute("SELECT name FROM assignees WHERE id = ?", (user_id,))
        user = cursor.fetchone()

        if not user:
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
        return {"success": True, "user_id": user_id}
    except Exception as e:
        _LOGGER.error("Error in delete_user: %s", e)
        raise
    finally:
        conn.close()


def get_ha_user_id_for_assignee(database_path: str, assignee_name: str) -> Optional[str]:
    """Get the Home Assistant user ID for an assignee."""
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT ha_user_id FROM assignees WHERE name = ?",
            (assignee_name,)
        )
        result = cursor.fetchone()
        return result[0] if result else None
    except Exception as e:
        _LOGGER.error("Error in get_ha_user_id_for_assignee: %s", e)
        return None
    finally:
        conn.close()


def force_chore_due(database_path: str, chore_id: str) -> Dict[str, Any]:
    """Force a task to be due today."""
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
        # Get chore details
        cursor.execute(
            "SELECT name, assigned_to, frequency_type, frequency_days, notify_when_due FROM chores WHERE id = ?",
            (chore_id,)
        )
        chore_result = cursor.fetchone()

        if not chore_result:
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
        from datetime import timedelta
        due_date = (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) -
                   timedelta(days=shift_days + 1)).isoformat()

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
        return {
            "success": True,
            "chore_id": chore_id,
            "chore_name": chore_name,
            "assigned_to": assigned_to,
            "has_auto_notify": bool(notify_when_due)
        }
    except Exception as e:
        _LOGGER.error("Error in force_chore_due: %s", e)
        raise
    finally:
        conn.close()
