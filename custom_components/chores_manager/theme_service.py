"""Theme settings service for Chores Manager."""
import logging
import json
import sqlite3
from typing import Dict, Any

_LOGGER = logging.getLogger(__name__)


def save_theme_settings(database_path: str, theme_settings: Dict[str, Any]) -> Dict[str, Any]:
    """Save theme settings to the database."""
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
        # Check if theme_settings table exists, create if not
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS theme_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Convert settings to JSON string
        theme_json = json.dumps(theme_settings)

        # Check if we already have theme settings
        cursor.execute("SELECT id FROM theme_settings WHERE name = 'dashboard_theme'")
        existing = cursor.fetchone()

        if existing:
            # Update existing settings
            cursor.execute('''
                UPDATE theme_settings
                SET value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE name = 'dashboard_theme'
            ''', (theme_json,))
        else:
            # Insert new settings
            cursor.execute('''
                INSERT INTO theme_settings (name, value)
                VALUES ('dashboard_theme', ?)
            ''', (theme_json,))

        conn.commit()
        return {"success": True, "message": "Theme settings saved successfully"}

    except Exception as e:
        conn.rollback()
        _LOGGER.error(f"Error saving theme settings: {str(e)}")
        return {"success": False, "error": str(e)}

    finally:
        conn.close()


def get_theme_settings(database_path: str) -> Dict[str, Any]:
    """Get theme settings from the database."""
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    try:
        # Check if the table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='theme_settings'")
        if not cursor.fetchone():
            # Table doesn't exist, return default settings
            return {
                "backgroundColor": "#ffffff",
                "cardColor": "#f8f8f8",
                "primaryTextColor": "#000000",
                "secondaryTextColor": "#333333"
            }

        # Get the theme settings
        cursor.execute("SELECT value FROM theme_settings WHERE name = 'dashboard_theme'")
        result = cursor.fetchone()

        if result:
            # Return the settings as a dict
            return json.loads(result[0])
        else:
            # No settings found, return defaults
            return {
                "backgroundColor": "#ffffff",
                "cardColor": "#f8f8f8",
                "primaryTextColor": "#000000",
                "secondaryTextColor": "#333333"
            }

    except Exception as e:
        _LOGGER.error(f"Error getting theme settings: {str(e)}")
        # Return default settings on error
        return {
            "backgroundColor": "#ffffff",
            "cardColor": "#f8f8f8",
            "primaryTextColor": "#000000",
            "secondaryTextColor": "#333333"
        }

    finally:
        conn.close()
