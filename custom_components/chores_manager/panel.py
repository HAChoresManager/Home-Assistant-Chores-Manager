# File: custom_components/chores_manager/panel.py

"""Panel for the Chores Manager."""
import logging
import os
from homeassistant.components import panel_custom
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

async def async_setup_panel(hass: HomeAssistant) -> None:
    """Set up the Chores Manager panel."""
    try:
        # Check if panel already exists
        if "chores" in hass.data.get("frontend_panels", {}):
            _LOGGER.warning("Chores panel already registered, skipping")
            return

        # Register the panel
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="chores-dashboard",
            frontend_url_path="chores",
            require_admin=False,
            config={
                "name": "Chores Manager",
                "icon": "mdi:broom",
                "embed_iframe": True,
                "trust_external": False,
            },
            js_url="/local/chores-dashboard/chores-dashboard.js?v=20250405",
        )

        _LOGGER.info("Chores Manager panel registered")
    except Exception as e:
        _LOGGER.error("Failed to register panel: %s", str(e))