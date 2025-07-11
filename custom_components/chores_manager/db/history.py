"""History tracking and statistics database operations."""
import logging
from datetime import datetime, timedelta, date
from typing import Dict, Any, List, Optional, Tuple

from .base import get_connection
from .chores import get_chore_by_id

_LOGGER = logging.getLogger(__name__)


def mark_chore_done(database_path: str, chore_id: str, person: str) -> dict:
    """Mark a chore as done and handle alternating assignments."""
    now = datetime.now().isoformat()
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get chore details
        cursor.execute(
            """SELECT use_alternating, assigned_to, alternate_with 
               FROM chores WHERE id = ?""",
            (chore_id,)
        )
        result = cursor.fetchone()
        
        if not result:
            raise ValueError(f"Chore {chore_id} not found")
        
        # Handle alternating assignments
        if result['use_alternating'] and result['alternate_with']:
            cursor.execute(
                """UPDATE chores 
                   SET assigned_to = ?, alternate_with = ? 
                   WHERE id = ?""",
                (result['alternate_with'], result['assigned_to'], chore_id)
            )
            _LOGGER.info("Alternated assignees for chore %s", chore_id)
        
        # Update last done information
        cursor.execute(
            """UPDATE chores 
               SET last_done = ?, last_done_by = ? 
               WHERE id = ?""",
            (now, person, chore_id)
        )
        
        # Record in history
        cursor.execute(
            """INSERT INTO chore_history (chore_id, done_by, done_at) 
               VALUES (?, ?, ?)""",
            (chore_id, person, now)
        )
        
        conn.commit()
        _LOGGER.info("Marked chore %s as done by %s", chore_id, person)
        
        return {
            "success": True,
            "chore_id": chore_id,
            "done_at": now,
            "done_by": person
        }


def get_completion_history(
    database_path: str, 
    chore_id: Optional[str] = None,
    person: Optional[str] = None,
    days: int = 30
) -> List[Dict[str, Any]]:
    """Get completion history with optional filters."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Build query with filters
        query = """
            SELECT 
                h.id,
                h.chore_id,
                h.done_by,
                h.done_at,
                c.name as chore_name,
                c.duration,
                c.priority
            FROM chore_history h
            JOIN chores c ON h.chore_id = c.id
            WHERE h.done_at >= datetime('now', '-{} days')
        """.format(days)
        
        params = []
        
        if chore_id:
            query += " AND h.chore_id = ?"
            params.append(chore_id)
        
        if person:
            query += " AND h.done_by = ?"
            params.append(person)
        
        query += " ORDER BY h.done_at DESC"
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def get_chore_stats(database_path: str, period: str = "today") -> Dict[str, Any]:
    """Get chore statistics for a specific period."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Determine date range
        start_date = _get_period_start_date(period)
        
        # Get completion counts by person
        cursor.execute("""
            SELECT 
                done_by,
                COUNT(*) as tasks_completed,
                SUM(c.duration) as time_completed
            FROM chore_history h
            JOIN chores c ON h.chore_id = c.id
            WHERE h.done_at >= ?
            GROUP BY done_by
        """, (start_date,))
        
        stats_by_person = {}
        for row in cursor.fetchall():
            stats_by_person[row['done_by']] = {
                'tasks_completed': row['tasks_completed'],
                'time_completed': row['time_completed'] or 0
            }
        
        # Get total tasks due for each person
        cursor.execute("""
            SELECT 
                assigned_to,
                COUNT(*) as total_tasks,
                SUM(duration) as total_time
            FROM chores
            WHERE (
                last_done IS NULL OR
                datetime(last_done) < datetime('now', 'start of day')
            )
            GROUP BY assigned_to
        """)
        
        for row in cursor.fetchall():
            person = row['assigned_to']
            if person not in stats_by_person:
                stats_by_person[person] = {
                    'tasks_completed': 0,
                    'time_completed': 0
                }
            stats_by_person[person]['total_tasks'] = row['total_tasks']
            stats_by_person[person]['total_time'] = row['total_time'] or 0
        
        # Add streaks
        for person in stats_by_person:
            stats_by_person[person]['streak'] = _calculate_streak(cursor, person)
        
        # Get monthly stats
        _add_monthly_stats(cursor, stats_by_person)
        
        return stats_by_person


def get_streaks(database_path: str) -> Dict[str, int]:
    """Get current streaks for all users."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get all active assignees
        cursor.execute(
            "SELECT DISTINCT name FROM assignees WHERE active = 1"
        )
        
        streaks = {}
        for row in cursor.fetchall():
            person = row['name']
            streaks[person] = _calculate_streak(cursor, person)
        
        return streaks


def get_today_completions(database_path: str) -> Tuple[int, List[Dict[str, Any]]]:
    """Get all tasks completed today."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                h.id,
                h.chore_id,
                h.done_by,
                h.done_at,
                c.name,
                c.duration,
                c.assigned_to,
                c.use_alternating,
                c.alternate_with
            FROM chore_history h
            JOIN chores c ON h.chore_id = c.id
            WHERE date(h.done_at) = date('now')
            ORDER BY h.done_at DESC
        """)
        
        completions = [dict(row) for row in cursor.fetchall()]
        return len(completions), completions


def get_overdue_tasks_count(database_path: str) -> int:
    """Get count of overdue tasks."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # This is a simplified count - the actual calculation happens in sensor.py
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM chores
            WHERE last_done IS NULL
            OR datetime(last_done) < datetime('now', '-1 day')
        """)
        
        return cursor.fetchone()['count']


def get_task_completion_rate(
    database_path: str, 
    person: Optional[str] = None,
    days: int = 30
) -> float:
    """Calculate task completion rate for a person or overall."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get completed tasks
        if person:
            cursor.execute("""
                SELECT COUNT(*) as completed
                FROM chore_history
                WHERE done_by = ?
                AND done_at >= datetime('now', '-{} days')
            """.format(days), (person,))
        else:
            cursor.execute("""
                SELECT COUNT(*) as completed
                FROM chore_history
                WHERE done_at >= datetime('now', '-{} days')
            """.format(days))
        
        completed = cursor.fetchone()['completed']
        
        # Get total expected tasks (rough estimate)
        if person:
            cursor.execute("""
                SELECT SUM(30.0 / frequency_days) as expected
                FROM chores
                WHERE assigned_to = ?
            """, (person,))
        else:
            cursor.execute("""
                SELECT SUM(30.0 / frequency_days) as expected
                FROM chores
            """)
        
        expected = cursor.fetchone()['expected'] or 1  # Avoid division by zero
        
        return min(100.0, (completed / expected) * 100)


def cleanup_old_history(database_path: str, days_to_keep: int = 365) -> int:
    """Clean up old history entries."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM chore_history
            WHERE done_at < datetime('now', '-{} days')
        """.format(days_to_keep))
        
        deleted_count = cursor.rowcount
        conn.commit()
        
        _LOGGER.info("Cleaned up %d old history entries", deleted_count)
        return deleted_count


# Private helper functions

def _get_period_start_date(period: str) -> str:
    """Get the start date for a given period."""
    now = datetime.now()
    
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        # Start of week (Monday)
        days_since_monday = now.weekday()
        start = now - timedelta(days=days_since_monday)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        # Default to today
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    return start.isoformat()


def _calculate_streak(cursor: sqlite3.Cursor, person: str) -> int:
    """Calculate the current streak for a person."""
    # Get last 30 days of completions
    cursor.execute("""
        SELECT DISTINCT date(done_at) as completion_date
        FROM chore_history
        WHERE done_by = ?
        AND done_at >= datetime('now', '-30 days')
        ORDER BY completion_date DESC
    """, (person,))
    
    dates = [row['completion_date'] for row in cursor.fetchall()]
    
    if not dates:
        return 0
    
    # Check if completed today
    today = date.today().isoformat()
    if dates[0] != today:
        return 0
    
    # Count consecutive days
    streak = 1
    current_date = date.today()
    
    for i in range(1, min(len(dates), 30)):
        prev_date = current_date - timedelta(days=1)
        
        if prev_date.isoformat() in dates:
            streak += 1
            current_date = prev_date
        else:
            # Check if person had any tasks on that day
            cursor.execute("""
                SELECT COUNT(*) as task_count
                FROM chores
                WHERE assigned_to = ?
                AND (
                    last_done IS NULL OR
                    date(last_done) <= ?
                )
            """, (person, prev_date.isoformat()))
            
            if cursor.fetchone()['task_count'] == 0:
                # No tasks on that day, continue streak
                streak += 1
                current_date = prev_date
            else:
                # Had tasks but didn't complete, break streak
                break
    
    return streak


def _add_monthly_stats(cursor: sqlite3.Cursor, stats_by_person: Dict[str, Dict]) -> None:
    """Add monthly statistics to the stats dictionary."""
    # Get completions for current month
    cursor.execute("""
        SELECT 
            done_by,
            COUNT(*) as monthly_completed
        FROM chore_history
        WHERE done_at >= datetime('now', 'start of month')
        GROUP BY done_by
    """)
    
    monthly_totals = {}
    total_monthly = 0
    
    for row in cursor.fetchall():
        monthly_totals[row['done_by']] = row['monthly_completed']
        total_monthly += row['monthly_completed']
    
    # Add to stats
    for person in stats_by_person:
        completed = monthly_totals.get(person, 0)
        percentage = round(completed / total_monthly * 100, 1) if total_monthly > 0 else 0
        
        stats_by_person[person]['monthly_completed'] = completed
        stats_by_person[person]['monthly_percentage'] = percentage
