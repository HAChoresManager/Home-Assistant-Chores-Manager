"""Subtask-related database operations."""
import logging
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from .base import get_connection

_LOGGER = logging.getLogger(__name__)


def add_subtask(database_path: str, chore_id: str, name: str, position: int = 0) -> dict:
    """Add a subtask to a chore."""
    if not name or not name.strip():
        raise ValueError("Subtask name cannot be empty")
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Verify chore exists
        cursor.execute("SELECT id FROM chores WHERE id = ?", (chore_id,))
        if not cursor.fetchone():
            raise ValueError(f"Chore with ID {chore_id} not found")
        
        # Add subtask
        cursor.execute(
            "INSERT INTO subtasks (chore_id, name, position) VALUES (?, ?, ?)",
            (chore_id, name.strip(), position)
        )
        
        # Enable subtasks on the chore
        cursor.execute(
            "UPDATE chores SET has_subtasks = 1 WHERE id = ?",
            (chore_id,)
        )
        
        subtask_id = cursor.lastrowid
        conn.commit()
        
        _LOGGER.info("Added subtask %d to chore %s", subtask_id, chore_id)
        return {
            "success": True,
            "subtask_id": subtask_id,
            "chore_id": chore_id,
            "name": name.strip()
        }


def delete_subtask(database_path: str, subtask_id: int) -> dict:
    """Delete a subtask."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get subtask details
        subtask = _get_subtask(cursor, subtask_id)
        if not subtask:
            raise ValueError(f"Subtask with ID {subtask_id} not found")
        
        chore_id = subtask['chore_id']
        subtask_name = subtask['name']
        
        # Delete the subtask (completions cascade delete)
        cursor.execute("DELETE FROM subtasks WHERE id = ?", (subtask_id,))
        
        # Check if any subtasks remain
        cursor.execute(
            "SELECT COUNT(*) as count FROM subtasks WHERE chore_id = ?",
            (chore_id,)
        )
        remaining_count = cursor.fetchone()['count']
        
        # Disable has_subtasks if no subtasks remain
        if remaining_count == 0:
            cursor.execute(
                "UPDATE chores SET has_subtasks = 0 WHERE id = ?",
                (chore_id,)
            )
        
        conn.commit()
        _LOGGER.info("Deleted subtask %d from chore %s", subtask_id, chore_id)
        
        return {
            "success": True,
            "subtask_id": subtask_id,
            "chore_id": chore_id,
            "name": subtask_name
        }


def complete_subtask(database_path: str, subtask_id: int, person: str) -> dict:
    """Mark a subtask as completed."""
    if not person:
        raise ValueError("Person is required for subtask completion")
    
    now = datetime.now().isoformat()
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get subtask details
        subtask = _get_subtask(cursor, subtask_id)
        if not subtask:
            raise ValueError(f"Subtask with ID {subtask_id} not found")
        
        chore_id = subtask['chore_id']
        
        # Record completion
        cursor.execute(
            "INSERT INTO subtask_completions (subtask_id, done_by, done_at) VALUES (?, ?, ?)",
            (subtask_id, person, now)
        )
        
        # Get chore completion rules
        cursor.execute(
            "SELECT subtasks_completion_type, subtasks_period FROM chores WHERE id = ?",
            (chore_id,)
        )
        chore_rules = cursor.fetchone()
        
        conn.commit()
        
        # Check if main chore should be updated
        update_chore_completion_status(database_path, chore_id)
        
        _LOGGER.info("Subtask %d completed by %s", subtask_id, person)
        return {
            "success": True,
            "subtask_id": subtask_id,
            "chore_id": chore_id,
            "done_at": now,
            "done_by": person
        }


def get_subtasks_for_chore(database_path: str, chore_id: str) -> List[Dict[str, Any]]:
    """Get all subtasks for a chore with their completion status."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get period start for completion checking
        period_start = _get_period_start(cursor, chore_id)
        
        # Get subtasks with completion status
        cursor.execute("""
            SELECT 
                s.id,
                s.name,
                s.position,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM subtask_completions sc
                        WHERE sc.subtask_id = s.id
                        AND sc.done_at >= ?
                    ) THEN 1
                    ELSE 0
                END as completed
            FROM subtasks s
            WHERE s.chore_id = ?
            ORDER BY s.position
        """, (period_start, chore_id))
        
        return [dict(row) for row in cursor.fetchall()]


def update_chore_completion_status(database_path: str, chore_id: str) -> None:
    """Update the chore completion status based on subtask completions."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get chore details
        cursor.execute("""
            SELECT has_subtasks, subtasks_completion_type, subtasks_period
            FROM chores
            WHERE id = ?
        """, (chore_id,))
        
        chore = cursor.fetchone()
        if not chore or not chore['has_subtasks']:
            return  # No subtasks, nothing to update
        
        # Get subtask completion status
        subtasks = get_subtasks_for_chore(database_path, chore_id)
        if not subtasks:
            return
        
        total_subtasks = len(subtasks)
        completed_subtasks = sum(1 for s in subtasks if s['completed'])
        
        # Determine if chore should be marked complete
        completion_type = chore['subtasks_completion_type']
        should_complete = (
            (completion_type == 'all' and completed_subtasks == total_subtasks) or
            (completion_type == 'any' and completed_subtasks > 0)
        )
        
        if should_complete:
            # Get the latest completion info
            period_start = _get_period_start(cursor, chore_id)
            
            cursor.execute("""
                SELECT MAX(done_at) as latest_done_at, done_by
                FROM subtask_completions
                WHERE subtask_id IN (
                    SELECT id FROM subtasks WHERE chore_id = ?
                )
                AND done_at >= ?
            """, (chore_id, period_start))
            
            latest = cursor.fetchone()
            if latest and latest['latest_done_at']:
                # Update chore completion
                cursor.execute("""
                    UPDATE chores
                    SET last_done = ?, last_done_by = ?
                    WHERE id = ?
                """, (latest['latest_done_at'], latest['done_by'], chore_id))
                
                conn.commit()
                _LOGGER.info("Updated chore %s completion based on subtasks", chore_id)


def reset_subtask_completions(database_path: str, chore_id: str, period: Optional[str] = None) -> dict:
    """Reset subtask completions for a chore."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        if period == 'today':
            cursor.execute("""
                DELETE FROM subtask_completions
                WHERE subtask_id IN (
                    SELECT id FROM subtasks WHERE chore_id = ?
                )
                AND date(done_at) = date('now')
            """, (chore_id,))
        else:
            # Reset all completions
            cursor.execute("""
                DELETE FROM subtask_completions
                WHERE subtask_id IN (
                    SELECT id FROM subtasks WHERE chore_id = ?
                )
            """, (chore_id,))
        
        conn.commit()
        return {"success": True, "chore_id": chore_id}


# Private helper functions

def _get_subtask(cursor: sqlite3.Cursor, subtask_id: int) -> Optional[Dict[str, Any]]:
    """Get a subtask by ID."""
    cursor.execute("SELECT * FROM subtasks WHERE id = ?", (subtask_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def _get_period_start(cursor: sqlite3.Cursor, chore_id: str) -> str:
    """Get the start of the current period for a chore."""
    cursor.execute(
        "SELECT subtasks_period FROM chores WHERE id = ?",
        (chore_id,)
    )
    result = cursor.fetchone()
    period = result['subtasks_period'] if result else 'week'
    
    now = datetime.now()
    
    if period == 'day':
        period_start = datetime(now.year, now.month, now.day)
    elif period == 'week':
        # Start of week (Monday)
        days_since_monday = now.weekday()
        period_start = now - timedelta(days=days_since_monday)
        period_start = period_start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == 'month':
        period_start = datetime(now.year, now.month, 1)
    else:
        # Default to today
        period_start = datetime(now.year, now.month, now.day)
    
    return period_start.isoformat()


def _count_subtask_completions(cursor: sqlite3.Cursor, chore_id: str, period_start: str) -> tuple:
    """Count total and completed subtasks for a period."""
    # Get all subtask IDs
    cursor.execute(
        "SELECT id FROM subtasks WHERE chore_id = ?",
        (chore_id,)
    )
    subtask_ids = [row['id'] for row in cursor.fetchall()]
    
    if not subtask_ids:
        return 0, 0
    
    total_count = len(subtask_ids)
    
    # Count completed subtasks in this period
    placeholders = ','.join(['?'] * len(subtask_ids))
    cursor.execute(f"""
        SELECT COUNT(DISTINCT subtask_id) as completed_count
        FROM subtask_completions
        WHERE subtask_id IN ({placeholders})
        AND done_at >= ?
    """, subtask_ids + [period_start])
    
    completed_count = cursor.fetchone()['completed_count']
    
    return total_count, completed_count
