"""Panel for the Chores Manager."""
import logging
from homeassistant.components import panel_custom
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Set up the Chores Manager panel."""
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="chores-dashboard",
        frontend_url_path="chores",
        require_admin=False,
        config={
            "name": "Chores Manager",
            "icon": "mdi:broom",
            "embed_iframe": True,
        }
    )
    
    _LOGGER.info("Chores Manager panel registered")
