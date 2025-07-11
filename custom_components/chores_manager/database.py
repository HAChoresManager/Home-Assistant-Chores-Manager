"""
Database operations for Chores Manager.

This file acts as a compatibility layer, importing functions from the new
modular structure while maintaining the existing API for backwards compatibility.
"""
import logging
from typing import Dict, Any, List, Optional, Tuple

# Import from new modular structure
from .db import (
    # Base operations
    init_database,
    verify_database,
    # Chore operations
    add_chore_to_db,
    delete_chore,
    update_chore_description,
    reset_chore,
    force_chore_due,
    get_chore_by_id,
    # User operations
    add_user,
    delete_user,
    get_ha_user_id_for_assignee,
    get_all_assignees,
    get_default_assignees,
    # Subtask operations
    add_subtask,
    delete_subtask,
    complete_subtask,
    get_subtasks_for_chore,
    update_chore_completion_status,
    # History operations
    mark_chore_done,
    get_completion_history,
    get_chore_stats,
    get_streaks,
    # Notification operations
    log_notification_sent,
    get_pending_notifications,
    cleanup_old_notifications
)

# Import additional functions that need to be exposed
from .db.chores import get_all_chores
from .db.users import (
    get_assignee_by_name,
    get_assignee_by_id,
    update_assignee_color,
    link_ha_user
)
from .db.subtasks import reset_subtask_completions
from .db.history import (
    get_today_completions,
    get_overdue_tasks_count,
    get_task_completion_rate,
    cleanup_old_history
)
from .db.notifications import (
    get_notification_history,
    mark_notifications_sent,
    get_notification_summary
)

_LOGGER = logging.getLogger(__name__)

# Re-export all functions for backwards compatibility
__all__ = [
    # Base
    'init_database',
    'verify_database',
    # Chores
    'add_chore_to_db',
    'delete_chore',
    'update_chore_description',
    'reset_chore',
    'force_chore_due',
    'get_chore_by_id',
    'get_all_chores',
    # Users
    'add_user',
    'delete_user',
    'get_ha_user_id_for_assignee',
    'get_all_assignees',
    'get_default_assignees',
    'get_assignee_by_name',
    'get_assignee_by_id',
    'update_assignee_color',
    'link_ha_user',
    # Subtasks
    'add_subtask',
    'delete_subtask',
    'complete_subtask',
    'get_subtasks_for_chore',
    'update_chore_completion_status',
    'reset_subtask_completions',
    # History
    'mark_chore_done',
    'get_completion_history',
    'get_chore_stats',
    'get_streaks',
    'get_today_completions',
    'get_overdue_tasks_count',
    'get_task_completion_rate',
    'cleanup_old_history',
    # Notifications
    'log_notification_sent',
    'get_pending_notifications',
    'cleanup_old_notifications',
    'get_notification_history',
    'mark_notifications_sent',
    'get_notification_summary',
    # Legacy compatibility functions
    'get_chores_from_db',
    'get_users_from_db',
    'get_assignees_from_db'
]


# Legacy compatibility functions
def get_chores_from_db(database_path: str) -> List[Dict[str, Any]]:
    """
    Get all chores from database.
    
    Legacy function for backwards compatibility.
    Use get_all_chores() instead.
    """
    return get_all_chores(database_path)


def get_users_from_db(database_path: str) -> List[Dict[str, Any]]:
    """
    Get all users from database.
    
    Legacy function for backwards compatibility.
    Use get_all_assignees() instead.
    """
    return get_all_assignees(database_path, active_only=False)


def get_assignees_from_db(database_path: str) -> List[Dict[str, Any]]:
    """
    Get active assignees from database.
    
    Legacy function for backwards compatibility.
    Use get_all_assignees() instead.
    """
    return get_all_assignees(database_path, active_only=True)


# Additional helper functions that were in the original file
def export_database_to_dict(database_path: str) -> Dict[str, Any]:
    """Export the entire database to a dictionary for backup purposes."""
    data = {
        'chores': get_all_chores(database_path),
        'assignees': get_all_assignees(database_path, active_only=False),
        'history': get_completion_history(database_path, days=365),
        'subtasks': [],
        'notifications': get_notification_history(database_path, days=30)
    }
    
    # Get subtasks for all chores
    for chore in data['chores']:
        subtasks = get_subtasks_for_chore(database_path, chore['id'])
        if subtasks:
            data['subtasks'].extend([
                {
                    'chore_id': chore['id'],
                    'subtask': subtask
                }
                for subtask in subtasks
            ])
    
    return data


def import_database_from_dict(database_path: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Import database from a dictionary backup."""
    results = {
        'chores_imported': 0,
        'users_imported': 0,
        'errors': []
    }
    
    try:
        # Import users first
        if 'assignees' in data:
            for user in data['assignees']:
                try:
                    add_user(database_path, user)
                    results['users_imported'] += 1
                except Exception as e:
                    results['errors'].append(f"User {user.get('id')}: {str(e)}")
        
        # Import chores
        if 'chores' in data:
            for chore in data['chores']:
                try:
                    # Extract chore_id and prepare data
                    chore_data = chore.copy()
                    chore_data['chore_id'] = chore_data.pop('id', None)
                    
                    add_chore_to_db(database_path, chore_data)
                    results['chores_imported'] += 1
                except Exception as e:
                    results['errors'].append(f"Chore {chore.get('id')}: {str(e)}")
        
        # Import subtasks
        if 'subtasks' in data:
            for item in data['subtasks']:
                try:
                    chore_id = item['chore_id']
                    subtask = item['subtask']
                    add_subtask(
                        database_path,
                        chore_id,
                        subtask['name'],
                        subtask.get('position', 0)
                    )
                except Exception as e:
                    results['errors'].append(f"Subtask error: {str(e)}")
    
    except Exception as e:
        results['errors'].append(f"Import failed: {str(e)}")
    
    return results


def get_database_stats(database_path: str) -> Dict[str, Any]:
    """Get overall database statistics."""
    from .db.base import get_connection
    
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        stats = {}
        
        # Count chores
        cursor.execute("SELECT COUNT(*) as count FROM chores")
        stats['total_chores'] = cursor.fetchone()['count']
        
        # Count active users
        cursor.execute("SELECT COUNT(*) as count FROM assignees WHERE active = 1")
        stats['active_users'] = cursor.fetchone()['count']
        
        # Count completions
        cursor.execute("SELECT COUNT(*) as count FROM chore_history")
        stats['total_completions'] = cursor.fetchone()['count']
        
        # Count subtasks
        cursor.execute("SELECT COUNT(*) as count FROM subtasks")
        stats['total_subtasks'] = cursor.fetchone()['count']
        
        # Database size
        cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
        stats['database_size_bytes'] = cursor.fetchone()['size']
        
        # Get table sizes
        tables = ['chores', 'chore_history', 'assignees', 'subtasks', 
                  'subtask_completions', 'notification_log']
        stats['table_counts'] = {}
        
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
            stats['table_counts'][table] = cursor.fetchone()['count']
        
        return stats


def vacuum_database(database_path: str) -> Dict[str, Any]:
    """Vacuum the database to reclaim space and optimize performance."""
    from .db.base import get_connection
    
    try:
        # Get size before
        stats_before = get_database_stats(database_path)
        
        with get_connection(database_path) as conn:
            conn.execute("VACUUM")
        
        # Get size after
        stats_after = get_database_stats(database_path)
        
        return {
            'success': True,
            'size_before': stats_before['database_size_bytes'],
            'size_after': stats_after['database_size_bytes'],
            'space_saved': stats_before['database_size_bytes'] - stats_after['database_size_bytes']
        }
    except Exception as e:
        _LOGGER.error("Failed to vacuum database: %s", e)
        return {
            'success': False,
            'error': str(e)
        }
