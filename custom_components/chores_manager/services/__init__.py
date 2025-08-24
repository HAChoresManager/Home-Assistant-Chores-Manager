"""Service registration for Chores Manager."""
import logging
from typing import Dict, Any

from homeassistant.core import HomeAssistant, ServiceCall

from ..const import DOMAIN
from .chore_services import register_chore_services
from .user_services import register_user_services
from .notification_services import register_notification_services
from .theme_services import register_theme_services

_LOGGER = logging.getLogger(__name__)


async def async_register_services(hass: HomeAssistant, database_path: str) -> None:
    """Register all services for chores manager."""
    _LOGGER.info("Registering Chores Manager services")
    
    try:
        # Register service groups
        await register_chore_services(hass, database_path)
        await register_user_services(hass, database_path)
        await register_notification_services(hass, database_path)
        await register_theme_services(hass, database_path)
        
        # Register utility services
        await _register_utility_services(hass, database_path)
        
        _LOGGER.info("All Chores Manager services registered successfully")
        
    except Exception as err:
        _LOGGER.error("Failed to register services: %s", err)
        raise


async def _register_utility_services(hass: HomeAssistant, database_path: str) -> None:
    """Register utility services."""
    from ..database import (
        get_database_stats,
        vacuum_database,
        export_database_to_dict,
        import_database_from_dict
    )
    from ..db.migrations import check_database_integrity, run_migrations
    
    async def handle_get_stats(call: ServiceCall) -> Dict[str, Any]:
        """Handle getting database statistics."""
        try:
            return await hass.async_add_executor_job(
                get_database_stats, database_path
            )
        except Exception as err:
            _LOGGER.error("Error getting database stats: %s", err)
            return {"error": str(err)}
    
    async def handle_vacuum(call: ServiceCall) -> Dict[str, Any]:
        """Handle database vacuum."""
        try:
            return await hass.async_add_executor_job(
                vacuum_database, database_path
            )
        except Exception as err:
            _LOGGER.error("Error vacuuming database: %s", err)
            return {"error": str(err)}
    
    async def handle_check_integrity(call: ServiceCall) -> Dict[str, Any]:
        """Handle database integrity check."""
        try:
            return await hass.async_add_executor_job(
                check_database_integrity, database_path
            )
        except Exception as err:
            _LOGGER.error("Error checking database integrity: %s", err)
            return {"error": str(err)}
    
    async def handle_run_migrations(call: ServiceCall) -> Dict[str, Any]:
        """Handle running database migrations."""
        try:
            return await hass.async_add_executor_job(
                run_migrations, database_path
            )
        except Exception as err:
            _LOGGER.error("Error running migrations: %s", err)
            return {"error": str(err)}
    
    # Register utility services
    hass.services.async_register(
        DOMAIN, "get_database_stats", handle_get_stats
    )
    
    hass.services.async_register(
        DOMAIN, "vacuum_database", handle_vacuum
    )
    
    hass.services.async_register(
        DOMAIN, "check_database_integrity", handle_check_integrity
    )
    
    hass.services.async_register(
        DOMAIN, "run_migrations", handle_run_migrations
    )


async def async_unregister_services(hass: HomeAssistant) -> None:
    """Unregister all services."""
    services = [
        # Chore services
        "add_chore", "mark_done", "update_description", "reset_chore",
        "delete_chore", "force_due",
        # User services
        "add_user", "delete_user", "get_ha_users",
        # Notification services
        "check_due_notifications", "send_notification",
        # Theme services
        "save_theme", "get_theme",
        # Subtask services
        "complete_subtask", "add_subtask", "delete_subtask",
        # Utility services
        "get_database_stats", "vacuum_database", 
        "check_database_integrity", "run_migrations"
    ]
    
    for service in services:
        hass.services.async_remove(DOMAIN, service)
    
    _LOGGER.info("All Chores Manager services unregistered")
