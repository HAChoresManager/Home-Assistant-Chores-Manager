"""Utility functions for the Chores Manager integration."""
import os
import shutil
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def setup_web_assets(hass: HomeAssistant) -> None:
    """Set up web assets by creating a symlink."""
    # Create symlink for web assets
    www_source = os.path.join(os.path.dirname(__file__), "www")
    www_target = os.path.join(hass.config.path("www"), "chores_manager")

    # Remove old symlink if it exists
    if os.path.islink(www_target):
        os.unlink(www_target)
    elif os.path.isdir(www_target):
        shutil.rmtree(www_target)

    # Create new symlink
    try:
        os.symlink(www_source, www_target)
        _LOGGER.info("Created symlink from %s to %s", www_source, www_target)
    except Exception as e:
        _LOGGER.error("Failed to create symlink: %s", e)

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
                                "uri": "/chores-dashboard/index.html"
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
