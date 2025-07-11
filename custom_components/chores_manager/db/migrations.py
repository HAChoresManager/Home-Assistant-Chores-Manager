"""Database migration utilities."""
import logging
import sqlite3
from typing import Dict, Any, List

from .base import get_connection

_LOGGER = logging.getLogger(__name__)


def run_migrations(database_path: str) -> Dict[str, Any]:
    """Run all pending database migrations."""
    migrations = [
        add_missing_columns,
        create_missing_indexes,
        migrate_theme_settings,
        cleanup_orphaned_records
    ]
    
    results = {
        'migrations_run': [],
        'errors': []
    }
    
    for migration in migrations:
        try:
            _LOGGER.info("Running migration: %s", migration.__name__)
            migration(database_path)
            results['migrations_run'].append(migration.__name__)
        except Exception as e:
            error_msg = f"Migration {migration.__name__} failed: {str(e)}"
            _LOGGER.error(error_msg)
            results['errors'].append(error_msg)
    
    return results


def add_missing_columns(database_path: str) -> None:
    """Add any missing columns to existing tables."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get existing columns for chores table
        cursor.execute("PRAGMA table_info(chores)")
        existing_columns = {row[1] for row in cursor.fetchall()}
        
        # Define columns that might be missing
        missing_columns = [
            ("active_days", "TEXT DEFAULT NULL"),
            ("active_monthdays", "TEXT DEFAULT NULL"),
            ("has_subtasks", "BOOLEAN DEFAULT 0"),
            ("subtasks_completion_type", "TEXT DEFAULT 'all'"),
            ("subtasks_streak_type", "TEXT DEFAULT 'period'"),
            ("subtasks_period", "TEXT DEFAULT 'week'"),
            ("notify_when_due", "BOOLEAN DEFAULT 0")
        ]
        
        for column_name, column_def in missing_columns:
            if column_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE chores ADD COLUMN {column_name} {column_def}")
                    _LOGGER.info("Added column %s to chores table", column_name)
                except sqlite3.OperationalError:
                    # Column might already exist
                    pass
        
        conn.commit()


def create_missing_indexes(database_path: str) -> None:
    """Create any missing indexes."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Get existing indexes
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
        existing_indexes = {row[0] for row in cursor.fetchall()}
        
        # Define indexes
        indexes = [
            ("idx_chore_history_chore_id", "chore_history(chore_id)"),
            ("idx_chore_history_done_at", "chore_history(done_at)"),
            ("idx_subtasks_chore_id", "subtasks(chore_id)"),
            ("idx_subtask_completions_subtask_id", "subtask_completions(subtask_id)"),
            ("idx_subtask_completions_done_at", "subtask_completions(done_at)"),
            ("idx_notification_log_chore_id", "notification_log(chore_id)"),
            ("idx_notification_log_sent_at", "notification_log(sent_at)"),
            ("idx_assignees_active", "assignees(active)"),
            ("idx_chores_assigned_to", "chores(assigned_to)")
        ]
        
        for index_name, index_def in indexes:
            if index_name not in existing_indexes:
                try:
                    cursor.execute(f"CREATE INDEX {index_name} ON {index_def}")
                    _LOGGER.info("Created index %s", index_name)
                except sqlite3.OperationalError:
                    pass
        
        conn.commit()


def migrate_theme_settings(database_path: str) -> None:
    """Migrate theme settings if needed."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Check if theme_settings table exists
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='theme_settings'
        """)
        
        if not cursor.fetchone():
            cursor.execute("""
                CREATE TABLE theme_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    value TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            _LOGGER.info("Created theme_settings table")
        
        conn.commit()


def cleanup_orphaned_records(database_path: str) -> None:
    """Clean up any orphaned records."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        # Remove history for non-existent chores
        cursor.execute("""
            DELETE FROM chore_history
            WHERE chore_id NOT IN (SELECT id FROM chores)
        """)
        orphaned_history = cursor.rowcount
        
        # Remove subtasks for non-existent chores
        cursor.execute("""
            DELETE FROM subtasks
            WHERE chore_id NOT IN (SELECT id FROM chores)
        """)
        orphaned_subtasks = cursor.rowcount
        
        # Remove completions for non-existent subtasks
        cursor.execute("""
            DELETE FROM subtask_completions
            WHERE subtask_id NOT IN (SELECT id FROM subtasks)
        """)
        orphaned_completions = cursor.rowcount
        
        # Remove notifications for non-existent chores
        cursor.execute("""
            DELETE FROM notification_log
            WHERE chore_id NOT IN (SELECT id FROM chores)
        """)
        orphaned_notifications = cursor.rowcount
        
        conn.commit()
        
        total_cleaned = (orphaned_history + orphaned_subtasks + 
                        orphaned_completions + orphaned_notifications)
        
        if total_cleaned > 0:
            _LOGGER.info(
                "Cleaned up %d orphaned records (history: %d, subtasks: %d, "
                "completions: %d, notifications: %d)",
                total_cleaned, orphaned_history, orphaned_subtasks,
                orphaned_completions, orphaned_notifications
            )


def check_database_integrity(database_path: str) -> Dict[str, Any]:
    """Check database integrity and return a report."""
    with get_connection(database_path) as conn:
        cursor = conn.cursor()
        
        report = {
            'is_healthy': True,
            'issues': [],
            'statistics': {}
        }
        
        # Run integrity check
        cursor.execute("PRAGMA integrity_check")
        result = cursor.fetchone()[0]
        if result != "ok":
            report['is_healthy'] = False
            report['issues'].append(f"Integrity check failed: {result}")
        
        # Check for common issues
        
        # 1. Chores without valid assignees
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM chores
            WHERE assigned_to NOT IN (SELECT name FROM assignees)
        """)
        invalid_assignees = cursor.fetchone()['count']
        if invalid_assignees > 0:
            report['issues'].append(f"{invalid_assignees} chores with invalid assignees")
        
        # 2. Future dates in history
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM chore_history
            WHERE done_at > datetime('now')
        """)
        future_completions = cursor.fetchone()['count']
        if future_completions > 0:
            report['issues'].append(f"{future_completions} completions with future dates")
        
        # 3. Duplicate chore IDs (shouldn't happen but check anyway)
        cursor.execute("""
            SELECT id, COUNT(*) as count
            FROM chores
            GROUP BY id
            HAVING count > 1
        """)
        duplicates = cursor.fetchall()
        if duplicates:
            report['is_healthy'] = False
            report['issues'].append(f"Found {len(duplicates)} duplicate chore IDs")
        
        # Add statistics
        cursor.execute("SELECT COUNT(*) FROM chores")
        report['statistics']['total_chores'] = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM assignees WHERE active = 1")
        report['statistics']['active_users'] = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM chore_history")
        report['statistics']['total_completions'] = cursor.fetchone()[0]
        
        return report
