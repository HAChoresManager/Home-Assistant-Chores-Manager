"""User/Assignee management database operations."""
import logging
from typing import Dict, Any, Optional, List

from .base import get_connection

_LOGGER = logging.getLogger(__name__)

# Default users that cannot be deleted
DEFAULT_USERS = ["Laura", "Martijn", "Samen"]


def add_user(database_path: str, user_data: dict) -> dict:
    """Add or update a user in the database."""
    # Validate required fields
    user_id = user_data.get("id")
    name = user_data.get("name")
    
    if not user_id or not name:
        raise ValueError("User must have both id and name")
    
    # Process user data
    color = user_data.get("color", "#CCCCCC")
    active = 1 if user_data.get("active", True) else 0
    ha_user_id = user_data.get("ha_user_id")
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Check if user exists
        existing_user = _get_user_by_id(cursor, user_id)
        
        if existing_user:
            cursor.execute(
                """UPDATE assignees 
                   SET name = ?, color = ?, active = ?, ha_user_id = ? 
                   WHERE id = ?""",
                (name, color, active, ha_user_id, user_id)
            )
            _LOGGER.info("Updated user: %s", user_id)
        else:
            cursor.execute(
                """INSERT INTO assignees (id, name, color, active, ha_user_id) 
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, name, color, active, ha_user_id)
            )
            _LOGGER.info("Created new user: %s", user_id)
        
        conn.commit()
        return {"success": True, "user_id": user_id}


def delete_user(database_path: str, user_id: str) -> dict:
    """Delete a user from the database."""
    if not user_id:
        raise ValueError("User ID is required")
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get user details
        user = _get_user_by_id(cursor, user_id)
        if not user:
            return {"success": False, "error": "User not found"}
        
        # Check if it's a default user
        if user['name'] in DEFAULT_USERS:
            return {"success": False, "error": f"Cannot delete default user: {user['name']}"}
        
        # Update any tasks assigned to this user
        _reassign_user_tasks(cursor, user['name'])
        
        # Delete the user
        cursor.execute("DELETE FROM assignees WHERE id = ?", (user_id,))
        
        conn.commit()
        _LOGGER.info("Deleted user: %s", user_id)
        return {"success": True, "user_id": user_id}


def get_ha_user_id_for_assignee(database_path: str, assignee_name: str) -> Optional[str]:
    """Get the Home Assistant user ID for an assignee."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT ha_user_id FROM assignees WHERE name = ? AND active = 1",
            (assignee_name,)
        )
        result = cursor.fetchone()
        return result['ha_user_id'] if result else None


def get_all_assignees(database_path: str, active_only: bool = True) -> List[Dict[str, Any]]:
    """Get all assignees from the database."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        if active_only:
            cursor.execute("SELECT * FROM assignees WHERE active = 1 ORDER BY name")
        else:
            cursor.execute("SELECT * FROM assignees ORDER BY name")
        
        return [dict(row) for row in cursor.fetchall()]


def get_assignee_by_name(database_path: str, name: str) -> Optional[Dict[str, Any]]:
    """Get an assignee by name."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM assignees WHERE name = ?", (name,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_assignee_by_id(database_path: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Get an assignee by ID."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        return _get_user_by_id(cursor, user_id)


def update_assignee_color(database_path: str, user_id: str, color: str) -> dict:
    """Update just the color for an assignee."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute(
            "UPDATE assignees SET color = ? WHERE id = ?",
            (color, user_id)
        )
        
        if cursor.rowcount == 0:
            return {"success": False, "error": "User not found"}
        
        conn.commit()
        return {"success": True, "user_id": user_id}


def link_ha_user(database_path: str, assignee_id: str, ha_user_id: str) -> dict:
    """Link an assignee to a Home Assistant user."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute(
            "UPDATE assignees SET ha_user_id = ? WHERE id = ?",
            (ha_user_id, assignee_id)
        )
        
        if cursor.rowcount == 0:
            return {"success": False, "error": "Assignee not found"}
        
        conn.commit()
        _LOGGER.info("Linked assignee %s to HA user %s", assignee_id, ha_user_id)
        return {"success": True, "assignee_id": assignee_id}


def get_default_assignees() -> List[Dict[str, Any]]:
    """Get the default assignee configuration."""
    return [
        {
            'id': 'laura',
            'name': 'Laura',
            'color': '#F5B7B1',
            'active': True,
            'ha_user_id': None
        },
        {
            'id': 'martijn',
            'name': 'Martijn',
            'color': '#F9E79F',
            'active': True,
            'ha_user_id': None
        },
        {
            'id': 'wie_kan',
            'name': 'Wie kan',
            'color': '#A9DFBF',
            'active': True,
            'ha_user_id': None
        }
    ]


# Private helper functions

def _get_user_by_id(cursor: sqlite3.Cursor, user_id: str) -> Optional[Dict[str, Any]]:
    """Get a user by ID."""
    cursor.execute("SELECT * FROM assignees WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def _reassign_user_tasks(cursor: sqlite3.Cursor, user_name: str) -> None:
    """Reassign tasks from a deleted user to 'Wie kan'."""
    # Update tasks assigned to this user
    cursor.execute(
        "UPDATE chores SET assigned_to = 'Wie kan' WHERE assigned_to = ?",
        (user_name,)
    )
    
    # Update tasks that alternate with this user
    cursor.execute(
        "UPDATE chores SET alternate_with = 'Wie kan' WHERE alternate_with = ?",
        (user_name,)
    )
    
    _LOGGER.info("Reassigned tasks from %s to 'Wie kan'", user_name)
