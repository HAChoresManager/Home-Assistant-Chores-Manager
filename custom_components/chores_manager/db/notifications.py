"""Notification log database operations."""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from .base import get_connection

_LOGGER = logging.getLogger(__name__)


def log_notification_sent(database_path: str, chore_id: str) -> dict:
    """Log that a notification was sent for a chore."""
    now = datetime.now().isoformat()
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Check if already notified today
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM notification_log
            WHERE chore_id = ?
            AND date(sent_at) = date('now')
        """, (chore_id,))
        
        if cursor.fetchone()['count'] > 0:
            return {
                "success": False,
                "error": "Notification already sent today"
            }
        
        # Log the notification
        cursor.execute(
            "INSERT INTO notification_log (chore_id, sent_at) VALUES (?, ?)",
            (chore_id, now)
        )
        
        conn.commit()
        _LOGGER.info("Logged notification for chore %s", chore_id)
        
        return {
            "success": True,
            "chore_id": chore_id,
            "sent_at": now
        }


def get_pending_notifications(database_path: str) -> List[Dict[str, Any]]:
    """Get tasks that need notifications sent."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get tasks with notifications enabled that are due today
        # and haven't been notified yet
        cursor.execute("""
            SELECT 
                c.id,
                c.name,
                c.assigned_to,
                c.priority,
                a.ha_user_id,
                c.frequency_type,
                c.frequency_days,
                c.last_done
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
                    -- New task or due based on frequency
                    c.last_done IS NULL OR
                    date(c.last_done) != date('now')
                )
            ORDER BY c.priority ASC
        """)
        
        tasks = []
        for row in cursor.fetchall():
            # Simplified due check - actual calculation happens elsewhere
            task = dict(row)
            task['is_due'] = _is_task_due_today(task)
            if task['is_due']:
                tasks.append(task)
        
        return tasks


def get_notification_history(
    database_path: str,
    chore_id: Optional[str] = None,
    days: int = 7
) -> List[Dict[str, Any]]:
    """Get notification history."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        query = """
            SELECT 
                nl.id,
                nl.chore_id,
                nl.sent_at,
                c.name as chore_name,
                c.assigned_to
            FROM notification_log nl
            JOIN chores c ON nl.chore_id = c.id
            WHERE nl.sent_at >= datetime('now', '-{} days')
        """.format(days)
        
        params = []
        if chore_id:
            query += " AND nl.chore_id = ?"
            params.append(chore_id)
        
        query += " ORDER BY nl.sent_at DESC"
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def cleanup_old_notifications(database_path: str, days_to_keep: int = 30) -> int:
    """Clean up old notification log entries."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM notification_log
            WHERE sent_at < datetime('now', '-{} days')
        """.format(days_to_keep))
        
        deleted_count = cursor.rowcount
        conn.commit()
        
        _LOGGER.info("Cleaned up %d old notification entries", deleted_count)
        return deleted_count


def mark_notifications_sent(database_path: str, chore_ids: List[str]) -> dict:
    """Mark multiple notifications as sent."""
    if not chore_ids:
        return {"success": True, "count": 0}
    
    now = datetime.now().isoformat()
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Insert notifications for all chore IDs
        values = [(chore_id, now) for chore_id in chore_ids]
        cursor.executemany(
            "INSERT INTO notification_log (chore_id, sent_at) VALUES (?, ?)",
            values
        )
        
        conn.commit()
        _LOGGER.info("Marked %d notifications as sent", len(chore_ids))
        
        return {
            "success": True,
            "count": len(chore_ids)
        }


def get_notification_summary(database_path: str) -> Dict[str, Any]:
    """Get a summary of notification statistics."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Total notifications sent today
        cursor.execute("""
            SELECT COUNT(*) as today_count
            FROM notification_log
            WHERE date(sent_at) = date('now')
        """)
        today_count = cursor.fetchone()['today_count']
        
        # Total notifications this week
        cursor.execute("""
            SELECT COUNT(*) as week_count
            FROM notification_log
            WHERE sent_at >= datetime('now', '-7 days')
        """)
        week_count = cursor.fetchone()['week_count']
        
        # Most notified tasks
        cursor.execute("""
            SELECT 
                c.name,
                COUNT(*) as notification_count
            FROM notification_log nl
            JOIN chores c ON nl.chore_id = c.id
            WHERE nl.sent_at >= datetime('now', '-30 days')
            GROUP BY nl.chore_id
            ORDER BY notification_count DESC
            LIMIT 5
        """)
        
        most_notified = [
            {"name": row['name'], "count": row['notification_count']}
            for row in cursor.fetchall()
        ]
        
        return {
            "today_count": today_count,
            "week_count": week_count,
            "most_notified": most_notified
        }


# Private helper functions

def _is_task_due_today(task: Dict[str, Any]) -> bool:
    """Simple check if task is due today."""
    if not task['last_done']:
        return True
    
    # Parse last done date
    try:
        last_done = datetime.fromisoformat(task['last_done'].replace('Z', '+00:00'))
    except:
        return True
    
    # Simple frequency check
    days_since = (datetime.now() - last_done).days
    
    frequency_map = {
        'Dagelijks': 1,
        'Wekelijks': 7,
        'Maandelijks': 30,
        'Per kwartaal': 90,
        'Halfjaarlijks': 180,
        'Jaarlijks': 365
    }
    
    required_days = frequency_map.get(
        task['frequency_type'], 
        task['frequency_days']
    )
    
    return days_since >= required_days
