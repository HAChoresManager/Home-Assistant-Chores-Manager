"""Notification service handlers."""
import logging
from typing import Dict, Any

from homeassistant.core import HomeAssistant, ServiceCall
import voluptuous as vol

from ..const import DOMAIN
from ..database import (
    get_pending_notifications,
    mark_notifications_sent,
    get_notification_summary
)
from ..utils import async_check_due_notifications, send_user_summary_notification
from .base import service_error_handler, ServiceResponse

_LOGGER = logging.getLogger(__name__)


async def register_notification_services(hass: HomeAssistant, database_path: str) -> None:
    """Register notification services."""
    
    @service_error_handler
    async def handle_check_due_notifications(call: ServiceCall) -> Dict[str, Any]:
        """Handle checking and sending due notifications."""
        try:
            await async_check_due_notifications(hass, database_path)
            
            # Get summary of what was sent
            summary = await hass.async_add_executor_job(
                get_notification_summary, database_path
            )
            
            return ServiceResponse.success({
                "notifications_sent_today": summary.get("today_count", 0),
                "summary": summary
            }, "Due notifications checked and sent")
            
        except Exception as err:
            _LOGGER.error("Error checking due notifications: %s", err)
            return ServiceResponse.error(str(err))
    
    @service_error_handler
    async def handle_send_notification(call: ServiceCall) -> Dict[str, Any]:
        """Handle sending a custom notification."""
        ha_user_id = call.data.get("ha_user_id")
        title = call.data.get("title", "Chores Manager")
        message = call.data.get("message")
        
        if not ha_user_id or not message:
            return ServiceResponse.error("Missing required fields: ha_user_id, message")
        
        try:
            sent = await send_user_summary_notification(
                hass, ha_user_id, title, message
            )
            
            if sent:
                return ServiceResponse.success(
                    {"sent": True},
                    "Notification sent successfully"
                )
            else:
                return ServiceResponse.error("Failed to send notification")
                
        except Exception as err:
            _LOGGER.error("Error sending notification: %s", err)
            return ServiceResponse.error(str(err))
    
    @service_error_handler
    async def handle_get_pending_notifications(call: ServiceCall) -> Dict[str, Any]:
        """Get list of pending notifications."""
        try:
            pending = await hass.async_add_executor_job(
                get_pending_notifications, database_path
            )
            
            return ServiceResponse.success({
                "pending_count": len(pending),
                "notifications": pending
            })
            
        except Exception as err:
            _LOGGER.error("Error getting pending notifications: %s", err)
            return ServiceResponse.error(str(err))
    
    # Register services
    hass.services.async_register(
        DOMAIN, "check_due_notifications", handle_check_due_notifications
    )
    
    hass.services.async_register(
        DOMAIN, "send_notification", handle_send_notification,
        schema=vol.Schema({
            vol.Required("ha_user_id"): str,
            vol.Required("message"): str,
            vol.Optional("title", default="Chores Manager"): str
        })
    )
    
    hass.services.async_register(
        DOMAIN, "get_pending_notifications", handle_get_pending_notifications
    )
    
    _LOGGER.info("Registered notification services")
