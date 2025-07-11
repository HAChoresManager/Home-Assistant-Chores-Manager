"""Base database operations for Chores Manager."""
import sqlite3
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import contextmanager

_LOGGER = logging.getLogger(__name__)


@contextmanager
def get_connection(database_path: str):
    """Get a database connection with automatic cleanup."""
    conn = None
    try:
        conn = sqlite3.connect(database_path)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        yield conn
    except Exception as e:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def init_database(database_path: str) -> None:
    """Initialize the database with required tables."""
    _LOGGER.info("Initializing database at %s", database_path)

    # Ensure directory exists
    os.makedirs(os.path.dirname(os.path.abspath(database_path)), exist_ok=True)

    with get_connection(database_path) as conn:
        cursor = conn.cursor()

        # Create tables
        _create_chores_table(cursor)
        _create_history_table(cursor)
        _create_assignees_table(cursor)
        _create_notification_table(cursor)
        _create_subtasks_tables(cursor)
        _create_theme_table(cursor)
        
        # Create indexes
        _create_indexes(cursor)
        
        # Initialize default data
        _initialize_default_assignees(cursor)
        
        conn.commit()
    
    _LOGGER.info("Database initialized successfully")


def verify_database(database_path: str) -> bool:
    """Verify database is accessible and properly structured."""
    try:
        init_database(database_path)
        
        with get_connection(database_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM chores")
            count = cursor.fetchone()[0]
            _LOGGER.info("Database verified: %d tasks found", count)
            return True
    except Exception as e:
        _LOGGER.error("Database verification failed: %s", e)
        return False


def _create_chores_table(cursor: sqlite3.Cursor) -> None:
    """Create the chores table."""
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
            notify_when_due BOOLEAN DEFAULT 0,
            active_days TEXT DEFAULT NULL,
            active_monthdays TEXT DEFAULT NULL,
            has_subtasks BOOLEAN DEFAULT 0,
            subtasks_completion_type TEXT DEFAULT 'all',
            subtasks_streak_type TEXT DEFAULT 'period',
            subtasks_period TEXT DEFAULT 'week'
        )
    ''')


def _create_history_table(cursor: sqlite3.Cursor) -> None:
    """Create the chore history table."""
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chore_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chore_id TEXT NOT NULL,
            done_by TEXT NOT NULL,
            done_at TIMESTAMP NOT NULL,
            FOREIGN KEY (chore_id) REFERENCES chores(id)
        )
    ''')


def _create_assignees_table(cursor: sqlite3.Cursor) -> None:
    """Create the assignees table."""
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assignees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#CCCCCC',
            active BOOLEAN DEFAULT 1,
            ha_user_id TEXT
        )
    ''')


def _create_notification_table(cursor: sqlite3.Cursor) -> None:
    """Create the notification log table."""
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notification_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chore_id TEXT NOT NULL,
            sent_at TIMESTAMP NOT NULL
        )
    ''')


def _create_subtasks_tables(cursor: sqlite3.Cursor) -> None:
    """Create subtask-related tables."""
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chore_id TEXT NOT NULL,
            name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subtask_completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subtask_id INTEGER NOT NULL,
            done_by TEXT NOT NULL,
            done_at TIMESTAMP NOT NULL,
            FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE
        )
    ''')


def _create_theme_table(cursor: sqlite3.Cursor) -> None:
    """Create the theme settings table."""
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS theme_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')


def _create_indexes(cursor: sqlite3.Cursor) -> None:
    """Create database indexes for better performance."""
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_chore_history_chore_id ON chore_history(chore_id)",
        "CREATE INDEX IF NOT EXISTS idx_chore_history_done_at ON chore_history(done_at)",
        "CREATE INDEX IF NOT EXISTS idx_subtasks_chore_id ON subtasks(chore_id)",
        "CREATE INDEX IF NOT EXISTS idx_subtask_completions_subtask_id ON subtask_completions(subtask_id)",
        "CREATE INDEX IF NOT EXISTS idx_subtask_completions_done_at ON subtask_completions(done_at)",
        "CREATE INDEX IF NOT EXISTS idx_notification_log_chore_id ON notification_log(chore_id)",
        "CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at)"
    ]
    
    for index_sql in indexes:
        cursor.execute(index_sql)


def _initialize_default_assignees(cursor: sqlite3.Cursor) -> None:
    """Initialize default assignees if none exist."""
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
        _LOGGER.info("Initialized default assignees")
