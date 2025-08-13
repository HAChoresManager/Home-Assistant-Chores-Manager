"""
Database operations for Chores Manager.

This file acts as a compatibility layer, importing functions from the new
modular structure while maintaining the existing API for backwards compatibility.
"""
import logging
from typing import Dict, Any, List, Optional, Tuple
import sqlite3
from datetime import datetime

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
from .db.base import get_connection

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
    'get_assignees_from_db',
    # Database utilities
    'export_database_to_dict',
    'import_database_from_dict',
    'get_database_stats',
    'vacuum_database'
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


# Additional helper functions
def export_database_to_dict(database_path: str) -> Dict[str, Any]:
    """Export the entire database to a dictionary for backup purposes."""
    try:
        data = {
            'chores': get_all_chores(database_path),
            'assignees': get_all_assignees(database_path, active_only=False),
            'history': get_completion_history(database_path, days=365),
            'subtasks': [],
            'notifications': get_notification_history(database_path, days=30),
            'export_timestamp': datetime.now().isoformat(),
            'version': '1.0.0'
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
    except Exception as e:
        _LOGGER.error("Failed to export database: %s", e)
        raise


def import_database_from_dict(database_path: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Import database from a dictionary backup."""
    results = {
        'success': False,
        'chores_imported': 0,
        'users_imported': 0,
        'subtasks_imported': 0,
        'errors': [],
        'warnings': []
    }
    
    try:
        # Validate data structure
        if not isinstance(data, dict):
            raise ValueError("Invalid data format: expected dictionary")
        
        # Check version compatibility
        version = data.get('version', '0.0.0')
        if version != '1.0.0':
            results['warnings'].append(f"Version mismatch: expected 1.0.0, got {version}")
        
        # Import users first (dependencies)
        if 'assignees' in data:
            for user in data['assignees']:
                try:
                    result = add_user(database_path, user)
                    if result.get('success'):
                        results['users_imported'] += 1
                    else:
                        results['errors'].append(f"User {user.get('id')}: {result.get('error', 'Unknown error')}")
                except Exception as e:
                    results['errors'].append(f"User {user.get('id')}: {str(e)}")
        
        # Import chores
        if 'chores' in data:
            for chore in data['chores']:
                try:
                    # Extract chore_id and prepare data
                    chore_data = chore.copy()
                    chore_data['chore_id'] = chore_data.pop('id', None)
                    
                    if not chore_data['chore_id']:
                        results['errors'].append(f"Chore missing ID: {chore.get('name', 'Unknown')}")
                        continue
                    
                    result = add_chore_to_db(database_path, chore_data)
                    if result.get('success'):
                        results['chores_imported'] += 1
                    else:
                        results['errors'].append(f"Chore {chore_data['chore_id']}: {result.get('error', 'Unknown error')}")
                except Exception as e:
                    results['errors'].append(f"Chore {chore.get('id')}: {str(e)}")
        
        # Import subtasks
        if 'subtasks' in data:
            for item in data['subtasks']:
                try:
                    chore_id = item.get('chore_id')
                    subtask = item.get('subtask', {})
                    
                    if not chore_id or not subtask.get('name'):
                        results['errors'].append(f"Invalid subtask data: {item}")
                        continue
                    
                    result = add_subtask(
                        database_path,
                        chore_id,
                        subtask['name'],
                        subtask.get('position', 0)
                    )
                    if result.get('success'):
                        results['subtasks_imported'] += 1
                    else:
                        results['errors'].append(f"Subtask {subtask['name']}: {result.get('error', 'Unknown error')}")
                except Exception as e:
                    results['errors'].append(f"Subtask error: {str(e)}")
        
        # Mark as successful if at least some data was imported
        if results['chores_imported'] > 0 or results['users_imported'] > 0:
            results['success'] = True
            
    except Exception as e:
        results['errors'].append(f"Import failed: {str(e)}")
        _LOGGER.error("Database import failed: %s", e)
    
    return results


def get_database_stats(database_path: str) -> Dict[str, Any]:
    """Get overall database statistics."""
    stats = {
        'total_chores': 0,
        'active_chores': 0,
        'total_users': 0,
        'active_users': 0,
        'total_completions': 0,
        'completions_this_week': 0,
        'completions_this_month': 0,
        'database_size_kb': 0,
        'tables': {}
    }
    
    try:
        with get_connection(database_path) as conn:
            cursor = conn.cursor()
            
            # Get chore counts
            cursor.execute("SELECT COUNT(*) FROM chores")
            stats['total_chores'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM chores WHERE is_active = 1")
            stats['active_chores'] = cursor.fetchone()[0]
            
            # Get user counts
            cursor.execute("SELECT COUNT(*) FROM assignees")
            stats['total_users'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM assignees WHERE active = 1")
            stats['active_users'] = cursor.fetchone()[0]
            
            # Get completion counts
            cursor.execute("SELECT COUNT(*) FROM chore_history")
            stats['total_completions'] = cursor.fetchone()[0]
            
            # Completions this week
            cursor.execute("""
                SELECT COUNT(*) FROM chore_history 
                WHERE datetime(completed_at) >= datetime('now', '-7 days')
            """)
            stats['completions_this_week'] = cursor.fetchone()[0]
            
            # Completions this month
            cursor.execute("""
                SELECT COUNT(*) FROM chore_history 
                WHERE datetime(completed_at) >= datetime('now', 'start of month')
            """)
            stats['completions_this_month'] = cursor.fetchone()[0]
            
            # Get table row counts
            tables = ['chores', 'assignees', 'chore_history', 'subtasks', 'notification_log']
            for table in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    stats['tables'][table] = cursor.fetchone()[0]
                except sqlite3.OperationalError:
                    stats['tables'][table] = 0
            
            # Get database file size
            import os
            if os.path.exists(database_path):
                stats['database_size_kb'] = os.path.getsize(database_path) / 1024
                
    except Exception as e:
        _LOGGER.error("Failed to get database stats: %s", e)
        stats['error'] = str(e)
    
    return stats


def vacuum_database(database_path: str) -> Dict[str, Any]:
    """Vacuum the database to reclaim space and optimize performance."""
    result = {
        'success': False,
        'size_before_kb': 0,
        'size_after_kb': 0,
        'space_reclaimed_kb': 0
    }
    
    try:
        import os

        # Get size before vacuum
        if os.path.exists(database_path):
            result['size_before_kb'] = os.path.getsize(database_path) / 1024

        # Perform vacuum
        with get_connection(database_path) as conn:
            conn.execute("VACUUM")
            conn.execute("ANALYZE")  # Also update statistics
        
        # Get size after vacuum
        if os.path.exists(database_path):
            result['size_after_kb'] = os.path.getsize(database_path) / 1024
            result['space_reclaimed_kb'] = result['size_before_kb'] - result['size_after_kb']
        
        result['success'] = True
        _LOGGER.info("Database vacuum completed. Reclaimed %.2f KB", result['space_reclaimed_kb'])
        
    except Exception as e:
        result['error'] = str(e)
        _LOGGER.error("Failed to vacuum database: %s", e)
    
    return result
