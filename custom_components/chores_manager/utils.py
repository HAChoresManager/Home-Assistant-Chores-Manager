"""Utility functions for the Chores Manager integration."""
import os
import shutil
import logging
import stat
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def setup_web_assets(hass: HomeAssistant) -> None:
    """Set up web assets by copying files to www directory."""
    try:
        www_source = os.path.join(os.path.dirname(__file__), "www", "chores-dashboard")
        www_target = os.path.join(hass.config.path("www"), "chores-dashboard")

        def copy_files():
            _LOGGER.info("Setting up web assets from %s to %s", www_source, www_target)
            if not os.path.exists(www_source):
                _LOGGER.error("Source directory %s does not exist", www_source)
                backup_source = os.path.join(hass.config.path("www"), "chores-dashboard-backup")
                if os.path.exists(backup_source):
                    _LOGGER.info("Using backup source: %s", backup_source)
                    www_source_actual = backup_source
                else:
                    _LOGGER.error("No source directory found for web assets")
                    return False
            else:
                www_source_actual = www_source

            os.makedirs(os.path.dirname(www_target), exist_ok=True)
            if os.path.exists(www_target):
                _LOGGER.info("Removing existing directory at %s", www_target)
                shutil.rmtree(www_target)
            shutil.copytree(www_source_actual, www_target)
            _LOGGER.info("Files copied successfully")
            for root, dirs, files in os.walk(www_target):
                for d in dirs:
                    os.chmod(os.path.join(root, d), 0o755)
                for f in files:
                    os.chmod(os.path.join(root, f), 0o644)
            _LOGGER.info("Files in target directory: %s", os.listdir(www_target))
            return True

        success = await hass.async_add_executor_job(copy_files)
        if success:
            _LOGGER.info("Web assets setup completed")
        else:
            _LOGGER.error("Failed to copy web assets")
    except Exception as e:
        _LOGGER.error("Failed to copy web assets: %s", e, exc_info=True)


async def generate_auth_config(hass: HomeAssistant, target_dir: str) -> None:
    """Generate simple config file for frontend authentication."""
    try:
        config_path = os.path.join(target_dir, "config.json")
        _LOGGER.info("Creating config file at %s", config_path)

        config = {
            "base_url": "",
            "api_url": "/api",
            "refresh_interval": 30000,
            "debug": True,
            "use_modern_auth": True,
            "version": "1.0.0",
            "build_timestamp": datetime.now().strftime('%Y%m%d%H%M%S')
        }

        def write_config():
            with open(config_path, "w") as f:
                import json
                json.dump(config, f, indent=2)

            # Ensure file is readable
            os.chmod(config_path, 0o644)
            _LOGGER.info("Config file created with content: %s", config)

        await hass.async_add_executor_job(write_config)
        _LOGGER.info("Config file created successfully")

    except Exception as e:
        _LOGGER.error("Error creating config: %s", str(e), exc_info=True)


def create_minimal_tailwind(tailwind_path: str) -> None:
    """Create a minimal tailwind.css file if it's missing."""
    try:
        # Create a minimal version with basic styles needed
        min_css = """
/* Minimal Tailwind styles for Chores Dashboard */
*,::after,::before{box-sizing:border-box;border:0 solid #e5e7eb}
html{line-height:1.5;-webkit-text-size-adjust:100%;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}
body{margin:0;font-family:inherit;line-height:inherit}
hr{height:0;color:inherit;border-top-width:1px}
p{margin:0}
a{color:inherit;text-decoration:inherit}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit;margin:0}
table{text-indent:0;border-color:inherit;border-collapse:collapse}
button,input,select,textarea{font-family:inherit;font-size:100%;line-height:1.15;margin:0;padding:0;border-width:0}
.text-xs{font-size:.75rem;line-height:1rem}
.text-sm{font-size:.875rem;line-height:1.25rem}
.text-base{font-size:1rem;line-height:1.5rem}
.text-lg{font-size:1.125rem;line-height:1.75rem}
.text-xl{font-size:1.25rem;line-height:1.75rem}
.text-2xl{font-size:1.5rem;line-height:2rem}
.text-3xl{font-size:1.875rem;line-height:2.25rem}
.font-medium{font-weight:500}
.font-semibold{font-weight:600}
.font-bold{font-weight:700}
.mb-1{margin-bottom:.25rem}
.mb-2{margin-bottom:.5rem}
.mb-4{margin-bottom:1rem}
.mt-1{margin-top:.25rem}
.mt-2{margin-top:.5rem}
.mt-4{margin-top:1rem}
.mt-6{margin-top:1.5rem}
.mt-8{margin-top:2rem}
.ml-2{margin-left:.5rem}
.mr-2{margin-right:.5rem}
.mr-3{margin-right:.75rem}
.mx-auto{margin-left:auto;margin-right:auto}
.p-2{padding:.5rem}
.p-4{padding:1rem}
.px-4{padding-left:1rem;padding-right:1rem}
.py-2{padding-top:.5rem;padding-bottom:.5rem}
.bg-white{background-color:#fff}
.bg-blue-500{background-color:#3b82f6}
.bg-red-500{background-color:#ef4444}
.bg-green-500{background-color:#10b981}
.bg-yellow-500{background-color:#f59e0b}
.bg-gray-100{background-color:#f3f4f6}
.bg-gray-200{background-color:#e5e7eb}
.text-white{color:#fff}
.text-gray-500{color:#6b7280}
.text-gray-700{color:#374151}
.text-red-500{color:#ef4444}
.text-green-500{color:#10b981}
.text-blue-500{color:#3b82f6}
.rounded{border-radius:.25rem}
.rounded-lg{border-radius:.5rem}
.rounded-full{border-radius:9999px}
.border{border-width:1px}
.border-gray-300{border-color:#d1d5db}
.shadow{box-shadow:0 1px 3px 0 rgba(0,0,0,0.1),0 1px 2px 0 rgba(0,0,0,0.06)}
.shadow-lg{box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -2px rgba(0,0,0,0.05)}
.flex{display:flex}
.grid{display:grid}
.hidden{display:none}
.flex-1{flex:1 1 0%}
.flex-row{flex-direction:row}
.flex-col{flex-direction:column}
.items-start{align-items:flex-start}
.items-center{align-items:center}
.justify-start{justify-content:flex-start}
.justify-end{justify-content:flex-end}
.justify-center{justify-content:center}
.justify-between{justify-content:space-between}
.space-x-2>:not([hidden])~:not([hidden]){margin-left:.5rem}
.space-y-2>:not([hidden])~:not([hidden]){margin-top:.5rem}
.space-y-4>:not([hidden])~:not([hidden]){margin-top:1rem}
.whitespace-nowrap{white-space:nowrap}
.w-full{width:100%}
.w-4{width:1rem}
.w-6{width:1.5rem}
.h-4{height:1rem}
.h-6{height:1.5rem}
.max-w-md{max-width:28rem}
.max-w-lg{max-width:32rem}
.max-w-xl{max-width:36rem}
.max-w-2xl{max-width:42rem}
.max-w-3xl{max-width:48rem}
.max-w-4xl{max-width:56rem}
.max-w-5xl{max-width:64rem}
.max-w-6xl{max-width:72rem}
.max-w-7xl{max-width:80rem}
"""
        with open(tailwind_path, "w") as f:
            f.write(min_css)

        # Set read permissions
        os.chmod(tailwind_path, 0o644)
        _LOGGER.info("Created minimal tailwind css file at %s", tailwind_path)
    except Exception as e:
        _LOGGER.error("Failed to create minimal tailwind css: %s", e)


async def async_check_due_notifications(hass: HomeAssistant, database_path: str) -> None:
    """Check for tasks due today and send summary notifications."""
    from .database import get_ha_user_id_for_assignee

    try:
        import sqlite3

        def get_due_tasks_needing_notification():
            conn = sqlite3.connect(database_path)
            cursor = conn.cursor()

            # Get all tasks with notifications enabled that are due today
            cursor.execute("""
                SELECT
                    c.id,
                    c.name,
                    c.assigned_to,
                    a.ha_user_id,
                    c.priority
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
                        -- New task (never completed)
                        c.last_done IS NULL OR

                        -- Based on frequency, it's due today
                        (
                            CASE
                                WHEN c.frequency_type = 'Dagelijks' THEN
                                    julianday('now') - julianday(c.last_done) >= 1
                                WHEN c.frequency_type = 'Wekelijks' THEN
                                    julianday('now') - julianday(c.last_done) >= 7
                                WHEN c.frequency_type = 'Meerdere keren per week' THEN
                                    julianday('now') - julianday(c.last_done) >= (7.0 / c.frequency_times)
                                WHEN c.frequency_type = 'Maandelijks' THEN
                                    julianday('now') - julianday(c.last_done) >= 30
                                WHEN c.frequency_type = 'Meerdere keren per maand' THEN
                                    julianday('now') - julianday(c.last_done) >= (30.0 / c.frequency_times)
                                WHEN c.frequency_type = 'Per kwartaal' THEN
                                    julianday('now') - julianday(c.last_done) >= 90
                                WHEN c.frequency_type = 'Halfjaarlijks' THEN
                                    julianday('now') - julianday(c.last_done) >= 180
                                WHEN c.frequency_type = 'Jaarlijks' THEN
                                    julianday('now') - julianday(c.last_done) >= 365
                                ELSE
                                    julianday('now') - julianday(c.last_done) >= c.frequency_days
                            END
                        ) AND

                        -- Not already completed today
                        (date(c.last_done) != date('now'))
                    )
                ORDER BY c.priority ASC
            """)

            due_tasks = cursor.fetchall()
            conn.close()
            return due_tasks

        due_tasks = await hass.async_add_executor_job(get_due_tasks_needing_notification)

        # Group tasks by user
        tasks_by_user = {}
        task_ids = []

        for task_id, task_name, assigned_to, ha_user_id, priority in due_tasks:
            if not ha_user_id:
                continue

            if ha_user_id not in tasks_by_user:
                tasks_by_user[ha_user_id] = []

            tasks_by_user[ha_user_id].append({
                'id': task_id,
                'name': task_name,
                'assigned_to': assigned_to,
                'priority': priority
            })

            task_ids.append(task_id)

        # Send summary notifications for each user
        for ha_user_id, user_tasks in tasks_by_user.items():
            if not user_tasks:
                continue

            # Create summary message
            if len(user_tasks) == 1:
                title = "Taak op planning voor vandaag"
                message = f"Je hebt 1 taak op de planning voor vandaag: {user_tasks[0]['name']}"
            else:
                title = f"{len(user_tasks)} taken op planning voor vandaag"
                # Sort tasks by priority
                priority_order = {'Hoog': 0, 'Middel': 1, 'Laag': 2}
                sorted_tasks = sorted(user_tasks, key=lambda t: priority_order.get(t['priority'], 99))

                task_list = "\n".join([f"• {task['name']}" for task in sorted_tasks])
                message = f"Je hebt {len(user_tasks)} taken op de planning voor vandaag:\n{task_list}"

            # Send the notification
            await send_user_summary_notification(hass, ha_user_id, title, message)

            # Log all these tasks as notified
            def log_notifications():
                conn = sqlite3.connect(database_path)
                cursor = conn.cursor()
                now = datetime.now().isoformat()

                for task in user_tasks:
                    cursor.execute(
                        "INSERT INTO notification_log (chore_id, sent_at) VALUES (?, ?)",
                        (task['id'], now)
                    )

                conn.commit()
                conn.close()

            await hass.async_add_executor_job(log_notifications)

    except Exception as e:
        _LOGGER.error("Error sending due task notifications: %s", e)


async def send_user_summary_notification(
    hass: HomeAssistant,
    ha_user_id: str,
    title: str,
    message: str
) -> bool:
    """Send a summary notification to a user's devices."""
    try:
        user = await hass.auth.async_get_user(ha_user_id)
        if not user:
            _LOGGER.warning(f"User with ID {ha_user_id} not found")
            return False

        # Get all user's devices
        sent = False
        user_devices = await hass.auth.async_get_user_devices(ha_user_id)
        for device in user_devices:
            if hasattr(device, 'push_token') and device.push_token:
                try:
                    device_name = device.name if device.name else device.id
                    _LOGGER.debug(f"Sending notification to {user.name}'s device: {device_name}")

                    # Create rich notification
                    rich_content = {
                        "push": {
                            "sound": "default",
                            "badge": 1,
                            "interruption-level": "time-sensitive"
                        },
                        "tag": "chores_summary",
                        "group": "chores",
                        "color": "#f59e0b",
                        "actions": [
                            {
                                "action": "VIEW_TASKS",
                                "title": "Bekijk Taken",
                                "uri": "/local/chores-dashboard/index.html"
                            },
                            {
                                "action": "DISMISS",
                                "title": "Later",
                                "destructive": False
                            }
                        ]
                    }

                    # Send notification
                    await hass.services.async_call(
                        'notify',
                        f'mobile_app_{device.id}',
                        {
                            "title": title,
                            "message": message,
                            "data": rich_content
                        }
                    )
                    sent = True
                except Exception as e:
                    _LOGGER.error(f"Failed to send notification to device {device.id}: {str(e)}")

        # If no mobile devices found, try persistent notification
        if not sent:
            await hass.services.async_call(
                'persistent_notification',
                'create',
                {
                    "title": title,
                    "message": message
                }
            )

        return sent
    except Exception as e:
        _LOGGER.error(f"Error sending summary notification: {str(e)}")
        return False
