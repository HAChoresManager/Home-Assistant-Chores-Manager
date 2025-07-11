"""Chore-related database operations."""
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

from .base import get_connection

_LOGGER = logging.getLogger(__name__)


def add_chore_to_db(database_path: str, chore_data: dict) -> dict:
    """Add or update a chore in the database."""
    # Extract and handle subtasks separately
    subtasks = chore_data.pop("subtasks", None)
    
    # Validate required fields
    chore_id = chore_data.get("chore_id")
    if not chore_id:
        raise ValueError("Missing required chore_id")
    
    # Process chore data
    processed_data = _process_chore_data(chore_data)
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        try:
            # Check if chore exists
            existing_chore = _get_chore(cursor, chore_id)
            
            if existing_chore:
                _update_chore(cursor, chore_id, processed_data)
            else:
                _insert_chore(cursor, chore_id, processed_data)
            
            # Handle subtasks if provided
            if subtasks is not None:
                _update_chore_subtasks(cursor, chore_id, subtasks)
            
            conn.commit()
            return {"success": True, "chore_id": chore_id}
            
        except Exception as e:
            conn.rollback()
            _LOGGER.error("Error in add_chore_to_db: %s", e)
            raise


def delete_chore(database_path: str, chore_id: str) -> dict:
    """Delete a chore from the database."""
    if not chore_id:
        raise ValueError("Chore ID is required")
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get chore name before deleting
        chore = _get_chore(cursor, chore_id)
        if not chore:
            return {"success": False, "error": "Chore not found"}
        
        chore_name = chore['name']
        
        # Delete all related data (cascading deletes handle subtasks)
        cursor.execute("DELETE FROM chore_history WHERE chore_id = ?", (chore_id,))
        cursor.execute("DELETE FROM notification_log WHERE chore_id = ?", (chore_id,))
        cursor.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
        
        conn.commit()
        return {"success": True, "chore_id": chore_id, "name": chore_name}


def update_chore_description(database_path: str, chore_id: str, description: str) -> dict:
    """Update a chore's description."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute(
            "UPDATE chores SET description = ? WHERE id = ?",
            (description, chore_id)
        )
        
        if cursor.rowcount == 0:
            return {"success": False, "error": "Chore not found"}
        
        conn.commit()
        return {"success": True, "chore_id": chore_id}


def reset_chore(database_path: str, chore_id: str) -> dict:
    """Reset a chore's completion status completely."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Check if chore exists and has subtasks
        chore = _get_chore(cursor, chore_id)
        if not chore:
            return {"success": False, "error": "Chore not found"}
        
        # Remove today's history entries
        cursor.execute('''
            DELETE FROM chore_history
            WHERE chore_id = ? AND date(done_at) = date('now')
        ''', (chore_id,))
        
        # Clear last_done fields
        cursor.execute('''
            UPDATE chores
            SET last_done = NULL, last_done_by = NULL
            WHERE id = ?
        ''', (chore_id,))
        
        # Handle subtask completions if chore has subtasks
        if chore['has_subtasks']:
            _reset_subtask_completions_today(cursor, chore_id)
        
        conn.commit()
        return {"success": True, "chore_id": chore_id}


def force_chore_due(database_path: str, chore_id: str) -> dict:
    """Force a task to be due today."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get chore details
        chore = _get_chore(cursor, chore_id)
        if not chore:
            return {"success": False, "error": f"Chore {chore_id} not found"}
        
        # Calculate when to set last_done to make it due today
        shift_days = _calculate_frequency_days(chore)
        due_date = (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) -
                   timedelta(days=shift_days + 1)).isoformat()
        
        # Update the last_done field
        cursor.execute(
            "UPDATE chores SET last_done = ? WHERE id = ?",
            (due_date, chore_id)
        )
        
        # Log notification if enabled
        if chore['notify_when_due']:
            cursor.execute(
                "INSERT INTO notification_log (chore_id, sent_at) VALUES (?, ?)",
                (chore_id, datetime.now().isoformat())
            )
        
        conn.commit()
        return {
            "success": True,
            "chore_id": chore_id,
            "chore_name": chore['name'],
            "assigned_to": chore['assigned_to'],
            "has_auto_notify": bool(chore['notify_when_due'])
        }


def get_chore_by_id(database_path: str, chore_id: str) -> Optional[Dict[str, Any]]:
    """Get a single chore by ID."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        return _get_chore(cursor, chore_id)


def get_all_chores(database_path: str) -> List[Dict[str, Any]]:
    """Get all chores from the database."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM chores")
        return [dict(row) for row in cursor.fetchall()]


# Private helper functions

def _get_chore(cursor: sqlite3.Cursor, chore_id: str) -> Optional[Dict[str, Any]]:
    """Get a chore by ID."""
    cursor.execute("SELECT * FROM chores WHERE id = ?", (chore_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def _process_chore_data(chore_data: dict) -> dict:
    """Process and validate chore data for database storage."""
    processed = {}
    
    # Define field mappings and defaults
    field_defaults = {
        'name': lambda d: d.get('name', d.get('chore_id', 'Unnamed')),
        'frequency_type': lambda d: d.get('frequency_type', 'Wekelijks'),
        'frequency_days': lambda d: int(d.get('frequency_days', 7)),
        'frequency_times': lambda d: int(d.get('frequency_times', 1)),
        'assigned_to': lambda d: d.get('assigned_to', 'Wie kan'),
        'priority': lambda d: d.get('priority', 'Middel'),
        'duration': lambda d: int(d.get('duration', 15)),
        'icon': lambda d: d.get('icon', '📋'),
        'description': lambda d: d.get('description', ''),
        'alternate_with': lambda d: d.get('alternate_with', ''),
        'use_alternating': lambda d: 1 if d.get('use_alternating') else 0,
        'notify_when_due': lambda d: 1 if d.get('notify_when_due') else 0,
        'weekday': lambda d: int(d.get('weekday', -1)),
        'monthday': lambda d: int(d.get('monthday', -1)),
        'startMonth': lambda d: int(d.get('startMonth', 0)),
        'startDay': lambda d: int(d.get('startDay', 1)),
        'has_subtasks': lambda d: 1 if d.get('has_subtasks') else 0,
        'subtasks_completion_type': lambda d: d.get('subtasks_completion_type', 'all'),
        'subtasks_streak_type': lambda d: d.get('subtasks_streak_type', 'period'),
        'subtasks_period': lambda d: d.get('subtasks_period', 'week')
    }
    
    # Process each field
    for field, processor in field_defaults.items():
        if field in chore_data or field not in processed:
            try:
                processed[field] = processor(chore_data)
            except (ValueError, TypeError) as e:
                _LOGGER.warning("Error processing field %s: %s", field, e)
                processed[field] = processor({})  # Use default
    
    # Handle JSON fields
    if 'active_days' in chore_data:
        value = chore_data['active_days']
        processed['active_days'] = json.dumps(value) if isinstance(value, dict) else value
    
    if 'active_monthdays' in chore_data:
        value = chore_data['active_monthdays']
        processed['active_monthdays'] = json.dumps(value) if isinstance(value, dict) else value
    
    return processed


def _update_chore(cursor: sqlite3.Cursor, chore_id: str, data: dict) -> None:
    """Update an existing chore."""
    # Build update query
    fields = [f"{key} = ?" for key in data.keys()]
    values = list(data.values()) + [chore_id]
    
    query = f"UPDATE chores SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, values)


def _insert_chore(cursor: sqlite3.Cursor, chore_id: str, data: dict) -> None:
    """Insert a new chore."""
    # Ensure we have all required fields
    required_fields = {
        'name', 'frequency_type', 'frequency_days', 'frequency_times',
        'assigned_to', 'priority', 'duration'
    }
    
    for field in required_fields:
        if field not in data:
            raise ValueError(f"Missing required field: {field}")
    
    # Build insert query
    fields = ['id'] + list(data.keys())
    placeholders = ['?'] * len(fields)
    values = [chore_id] + list(data.values())
    
    query = f"INSERT INTO chores ({', '.join(fields)}) VALUES ({', '.join(placeholders)})"
    cursor.execute(query, values)


def _update_chore_subtasks(cursor: sqlite3.Cursor, chore_id: str, subtasks: List[dict]) -> None:
    """Update subtasks for a chore."""
    # First delete existing subtasks
    cursor.execute("DELETE FROM subtasks WHERE chore_id = ?", (chore_id,))
    
    # Then add the new ones
    for i, subtask in enumerate(subtasks):
        if not subtask.get("name"):
            continue  # Skip empty subtasks
        
        cursor.execute(
            "INSERT INTO subtasks (chore_id, name, position) VALUES (?, ?, ?)",
            (chore_id, subtask["name"], i)
        )


def _reset_subtask_completions_today(cursor: sqlite3.Cursor, chore_id: str) -> None:
    """Reset subtask completions for today."""
    cursor.execute("""
        DELETE FROM subtask_completions
        WHERE subtask_id IN (
            SELECT id FROM subtasks WHERE chore_id = ?
        ) AND date(done_at) = date('now')
    """, (chore_id,))


def _calculate_frequency_days(chore: dict) -> int:
    """Calculate the number of days for a chore's frequency."""
    frequency_type = chore['frequency_type']
    
    frequency_map = {
        'Dagelijks': 1,
        'Wekelijks': 7,
        'Meerdere keren per week': 3,  # Conservative estimate
        'Maandelijks': 30,
        'Flexibel': 1,  # Minimum for flexible tasks
        'Per kwartaal': 90,
        'Halfjaarlijks': 180,
        'Jaarlijks': 365
    }
    
    return frequency_map.get(frequency_type, chore.get('frequency_days', 7))
