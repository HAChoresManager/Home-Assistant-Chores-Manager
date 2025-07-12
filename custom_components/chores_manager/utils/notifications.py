"""Notification utility functions for Chores Manager."""
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_check_due_notifications(hass: HomeAssistant, database_path: str) -> None:
    """Check for tasks due today and send summary notifications."""
    from ..database import get_pending_notifications, mark_notifications_sent
    
    try:
        # Get all tasks needing notifications
        due_tasks = await hass.async_add_executor_job(
            get_pending_notifications, database_path
        )
        
        if not due_tasks:
            return
        
        # Group tasks by user
        tasks_by_user = {}
        task_ids = []
        
        for task in due_tasks:
            ha_user_id = task.get('ha_user_id')
            if not ha_user_id:
                continue
            
            if ha_user_id not in tasks_by_user:
                tasks_by_user[ha_user_id] = []
            
            tasks_by_user[ha_user_id].append({
                'id': task['id'],
                'name': task['name'],
                'assigned_to': task['assigned_to'],
                'priority': task['priority']
            })
            
            task_ids.append(task['id'])
        
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
        
        # Mark all tasks as notified
        if task_ids:
            await hass.async_add_executor_job(
                mark_notifications_sent, database_path, task_ids
            )
    
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
        
        # Get all user's mobile app devices
        sent = False
        
        # Try to find mobile app notify services for this user
        # This is a simplified approach - in reality you'd need to map users to devices
        notify_services = []
        
        # Get all notify services
        for service in hass.services.async_services().get('notify', {}):
            if service.startswith('mobile_app_'):
                notify_services.append(service)
        
        # For now, try to send to all mobile app services
        # In a real implementation, you'd map HA users to their devices
        for service in notify_services:
            try:
                await hass.services.async_call(
                    'notify',
                    service,
                    {
                        "title": title,
                        "message": message,
                        "data": {
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
                    }
                )
                sent = True
                _LOGGER.info(f"Sent notification via {service}")
            except Exception as e:
                _LOGGER.error(f"Failed to send notification via {service}: {str(e)}")
        
        # If no mobile devices found, try persistent notification
        if not sent:
            await hass.services.async_call(
                'persistent_notification',
                'create',
                {
                    "title": title,
                    "message": message,
                    "notification_id": f"chores_{ha_user_id}_{datetime.now().timestamp()}"
                }
            )
            sent = True
        
        return sent
    except Exception as e:
        _LOGGER.error(f"Error sending summary notification: {str(e)}")
        return False
