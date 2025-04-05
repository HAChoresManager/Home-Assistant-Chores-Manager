"""Initialize the Chores Manager integration."""
import logging
import os
import json
import shutil
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.auth.const import GROUP_ID_ADMIN

from .const import DOMAIN, DEFAULT_DB, PLATFORMS
from .database import init_database
from .services import async_register_services
from .panel import async_setup_panel
from .utils import setup_web_assets

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up chores_manager from a config entry."""
    _LOGGER.info("Setting up chores_manager from config entry")

    # Handle database path – allow relative or absolute
    database_name = entry.data.get("database", DEFAULT_DB)
    if not os.path.isabs(database_name):
        database_path = Path(hass.config.path(database_name))
    else:
        database_path = Path(database_name)

    _LOGGER.info("Using database at: %s", database_path)

    # Initialize database
    await hass.async_add_executor_job(init_database, str(database_path))

    # Store the database path in hass.data
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "database_path": str(database_path),
    }

    # Always regenerate token to resolve auth issues
    try:
        _LOGGER.info("Generating new authentication token for chores dashboard")
        token = await _generate_dashboard_token(hass)
        # Store in config entry
        new_data = dict(entry.data)
        new_data["auth_token"] = token
        hass.config_entries.async_update_entry(entry, data=new_data)
    except Exception as err:
        _LOGGER.error("Failed to generate authentication token: %s", err)
        token = entry.data.get("auth_token")

    # Update dashboard config with token
    if token:
        await _update_dashboard_config(hass, token)

    # Register services
    await async_register_services(hass, str(database_path))

    # Forward config entry to the sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register panel and set up web assets
    await async_setup_panel(hass)
    await setup_web_assets(hass)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def _generate_dashboard_token(hass: HomeAssistant) -> str:
    """Generate a long-lived access token for the dashboard."""
    for user in await hass.auth.async_get_users():
        if not user.is_active:
            continue
        for group in user.groups:
            if group.id == GROUP_ID_ADMIN:
                _LOGGER.debug("Creating token for user %s", user.name)
                refresh_token = await hass.auth.async_create_refresh_token(
                    user, client_name="Chores Manager Dashboard"
                )
                access_token = hass.auth.async_create_access_token(refresh_token)
                return access_token
    raise ValueError("No admin user found to create token")


async def _update_dashboard_config(hass: HomeAssistant, token: str) -> None:
    """Update dashboard config with the authentication token."""
    config_dir = Path(hass.config.path("www/chores-dashboard"))
    config_file = config_dir / "config.json"

    # Ensure directory exists
    await hass.async_add_executor_job(lambda: os.makedirs(config_dir, exist_ok=True))

    try:
        config = {}
v=20250405
        # Read existing config file if it exists
        def read_config():
            if config_file.exists():
                try:
                    with open(config_file, "r") as f:
                        return json.load(f)
                except json.JSONDecodeError:
                    _LOGGER.warning("Existing config.json was invalid, creating new one")
            return {}
v=20250405
        # Write updated config file
        def write_config(config_data):
            with open(config_file, "w") as f:
                json.dump(config_data, f, indent=2)
            os.chmod(config_file, 0o644)
v=20250405
        # Read existing config in executor
        config = await hass.async_add_executor_job(read_config)
v=20250405
        # Update config values
        config["api_token"] = token
        config.setdefault("refresh_interval", 30000)
        config.setdefault("debug", False)
v=20250405
        # Write updated config in executor
        await hass.async_add_executor_job(lambda: write_config(config))
v=20250405
        _LOGGER.info("Updated dashboard config with authentication token")
    except Exception as err:
        _LOGGER.error("Failed to update dashboard config: %s", err)


async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Update options for the entry."""
    await hass.config_entries.async_reload(entry.entry_id)
