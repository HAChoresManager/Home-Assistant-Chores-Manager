"""User management service handlers."""
import logging
from typing import Dict, Any

from homeassistant.core import HomeAssistant, ServiceCall

from ..const import DOMAIN
from ..schemas import ADD_USER_SCHEMA, DELETE_USER_SCHEMA
from ..database import add_user, delete_user
from .base import (
    service_error_handler,
    notify_state_change,
    log_service_call,
    ServiceResponse
)

_LOGGER = logging.getLogger(__name__)


async def register_user_services(hass: HomeAssistant, database_path: str) -> None:
    """Register user management services."""
    
    @service_error_handler
    async def handle_add_user(call: ServiceCall) -> Dict[str, Any]:
        """Handle adding or updating a user."""
        user_data = dict(call.data)
        log_service_call("add_user", user_data)
        
        result = await hass.async_add_executor_job(
            add_user, database_path, user_data
        )
        
        if result.get("success"):
            notify_state_change(hass)
            _LOGGER.info("Successfully added/updated user: %s", user_data.get("id"))
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_delete_user(call: ServiceCall) -> Dict[str, Any]:
        """Handle deleting a user."""
        user_id = call.data.get("user_id")
        
        result = await hass.async_add_executor_job(
            delete_user, database_path, user_id
        )
        
        if result.get("success"):
            notify_state_change(hass)
            _LOGGER.info("Successfully deleted user: %s", user_id)
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_get_ha_users(call: ServiceCall) -> Dict[str, Any]:
        """Get list of available Home Assistant users."""
        try:
            # Get all users
            users = await hass.auth.async_get_users()
            
            # Filter and format users
            valid_users = []
            for user in users:
                # Skip system generated users
                if user.system_generated:
                    continue
                
                user_info = {
                    "id": user.id,
                    "name": user.name,
                    "is_active": user.is_active,
                    "is_owner": user.is_owner,
                    "groups": [group.name for group in user.groups]
                }
                
                # Add refresh tokens count (for debugging)
                refresh_tokens = await hass.auth.async_get_refresh_tokens(user)
                user_info["token_count"] = len(refresh_tokens)
                
                valid_users.append(user_info)
            
            _LOGGER.info("Found %d valid HA users", len(valid_users))
            
            return ServiceResponse.success({
                "users": valid_users,
                "count": len(valid_users)
            })
            
        except Exception as err:
            _LOGGER.error("Error getting HA users: %s", err)
            return ServiceResponse.error(str(err))
    
    # Register services
    hass.services.async_register(
        DOMAIN, "add_user", handle_add_user, schema=ADD_USER_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, "delete_user", handle_delete_user, schema=DELETE_USER_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, "get_ha_users", handle_get_ha_users
    )
    
    _LOGGER.info("Registered user management services")
