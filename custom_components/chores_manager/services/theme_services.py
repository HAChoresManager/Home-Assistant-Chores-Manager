"""Theme management service handlers."""
import logging
from typing import Dict, Any

from homeassistant.core import HomeAssistant, ServiceCall
import voluptuous as vol

from ..const import DOMAIN
from ..theme_service import save_theme_settings, get_theme_settings
from .base import (
    service_error_handler,
    notify_state_change,
    ServiceResponse
)

_LOGGER = logging.getLogger(__name__)


async def register_theme_services(hass: HomeAssistant, database_path: str) -> None:
    """Register theme management services."""
    
    @service_error_handler
    async def handle_save_theme(call: ServiceCall) -> Dict[str, Any]:
        """Handle saving theme settings."""
        theme_data = dict(call.data)
        
        # Validate theme data
        required_fields = [
            "backgroundColor", "cardColor", 
            "primaryTextColor", "secondaryTextColor"
        ]
        
        missing = [f for f in required_fields if f not in theme_data]
        if missing:
            return ServiceResponse.error(f"Missing required fields: {', '.join(missing)}")
        
        # Validate color formats
        for field in required_fields:
            if not _is_valid_color(theme_data[field]):
                return ServiceResponse.error(f"Invalid color format for {field}")
        
        result = await hass.async_add_executor_job(
            save_theme_settings, database_path, theme_data
        )
        
        if result.get("success"):
            # Notify theme change
            async_dispatcher_send = hass.helpers.dispatcher.async_dispatcher_send
            async_dispatcher_send(hass, f"{DOMAIN}_theme_updated")
            _LOGGER.info("Theme settings saved successfully")
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_get_theme(call: ServiceCall) -> Dict[str, Any]:
        """Handle getting current theme settings."""
        try:
            theme = await hass.async_add_executor_job(
                get_theme_settings, database_path
            )
            
            return ServiceResponse.success({
                "theme": theme,
                "is_default": _is_default_theme(theme)
            })
            
        except Exception as err:
            _LOGGER.error("Error getting theme settings: %s", err)
            return ServiceResponse.error(str(err))
    
    @service_error_handler
    async def handle_reset_theme(call: ServiceCall) -> Dict[str, Any]:
        """Handle resetting theme to defaults."""
        default_theme = {
            "backgroundColor": "#ffffff",
            "cardColor": "#f8f8f8",
            "primaryTextColor": "#000000",
            "secondaryTextColor": "#333333"
        }
        
        result = await hass.async_add_executor_job(
            save_theme_settings, database_path, default_theme
        )
        
        if result.get("success"):
            async_dispatcher_send = hass.helpers.dispatcher.async_dispatcher_send
            async_dispatcher_send(hass, f"{DOMAIN}_theme_updated")
            _LOGGER.info("Theme reset to defaults")
        
        return ServiceResponse.from_db_result(result)
    
    # Register services
    hass.services.async_register(
        DOMAIN, "save_theme", handle_save_theme,
        schema=vol.Schema({
            vol.Required("backgroundColor"): str,
            vol.Required("cardColor"): str,
            vol.Required("primaryTextColor"): str,
            vol.Required("secondaryTextColor"): str,
            vol.Optional("customCSS"): str
        })
    )
    
    hass.services.async_register(
        DOMAIN, "get_theme", handle_get_theme
    )
    
    hass.services.async_register(
        DOMAIN, "reset_theme", handle_reset_theme
    )
    
    _LOGGER.info("Registered theme management services")


def _is_valid_color(color: str) -> bool:
    """Check if a color string is valid."""
    import re
    # Check for hex color format
    hex_pattern = r'^#[0-9A-Fa-f]{6}$'
    # Check for rgb/rgba format
    rgb_pattern = r'^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$'
    
    return bool(re.match(hex_pattern, color) or re.match(rgb_pattern, color))


def _is_default_theme(theme: Dict[str, Any]) -> bool:
    """Check if theme is using default values."""
    defaults = {
        "backgroundColor": "#ffffff",
        "cardColor": "#f8f8f8",
        "primaryTextColor": "#000000",
        "secondaryTextColor": "#333333"
    }
    
    for key, value in defaults.items():
        if theme.get(key) != value:
            return False
    
    return True
