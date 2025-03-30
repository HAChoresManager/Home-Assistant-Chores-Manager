"""Initialize the Chores Manager integration."""
import logging
import os
import shutil
from pathlib import Path
from datetime import datetime, timedelta, time

from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.helpers.event import async_track_time_change

from .const import DOMAIN, DEFAULT_DB, DEFAULT_NOTIFICATION_TIME
from .database import init_database, verify_database
from .utils import async_check_due_notifications
from .services import async_register_services

_LOGGER = logging.getLogger(__name__)

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the chores manager component from YAML (legacy)."""
    _LOGGER.info("Setting up chores_manager from YAML (legacy)")

    if DOMAIN not in config:
        return True

    # If we have YAML config but there's already a config entry,
    # don't set up from YAML (prefer the config entry)
    if hass.config_entries.async_entries(DOMAIN):
        _LOGGER.info("Configuration entry exists, ignoring YAML config")
        return True

    # Create a config entry from the YAML config
    hass.async_create_task(
        hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": "import"},
            data=config[DOMAIN],
        )
    )

    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up chores_manager from a config entry."""
    _LOGGER.info("Setting up chores_manager from config entry")

    # Handle database path - allow relative or absolute
    database_name = entry.data.get("database", DEFAULT_DB)
    if not os.path.isabs(database_name):
        database_path = Path(hass.config.path(database_name))
    else:
        database_path = Path(database_name)

    _LOGGER.info("Setting up chores_manager with database at: %s", database_path)

    # Initialize database
    await hass.async_add_executor_job(init_database, str(database_path))

    # Set up web assets
    await setup_web_assets(hass)

    # Store the database path and other config
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "database_path": str(database_path),
    }

    # Register services
    await async_register_services(hass, str(database_path))

    # Schedule daily notification check
    notification_time_config = entry.data.get("notification_time", DEFAULT_NOTIFICATION_TIME)

    # Handle the notification time correctly based on its type
    if isinstance(notification_time_config, time):
        # Already a time object, use it directly
        notification_time = notification_time_config
    elif isinstance(notification_time_config, str):
        # Parse string into time object
        try:
            notification_time = datetime.strptime(notification_time_config, "%H:%M").time()
        except ValueError:
            _LOGGER.error(f"Invalid notification_time format: {notification_time_config}. Using default {DEFAULT_NOTIFICATION_TIME}.")
            notification_time = datetime.strptime(DEFAULT_NOTIFICATION_TIME, "%H:%M").time()
    else:
        # Fallback to default
        _LOGGER.error(f"Unexpected notification_time type: {type(notification_time_config)}. Using default.")
        notification_time = datetime.strptime(DEFAULT_NOTIFICATION_TIME, "%H:%M").time()

    async def _async_daily_notification_check(now=None):
        """Run the daily notification check."""
        await async_check_due_notifications(hass, str(database_path))

    # Run once at startup and then at configured time every day
    await _async_daily_notification_check()
    async_track_time_change(
        hass,
        _async_daily_notification_check,
        hour=notification_time.hour,
        minute=notification_time.minute,
        second=0
    )

    # Set up platform
    await hass.config_entries.async_forward_entry_setups(entry, [Platform.SENSOR])

    entry.async_on_unload(entry.add_update_listener(async_update_options))

    return True

async def setup_web_assets(hass: HomeAssistant) -> None:
    """Set up web assets by copying files to www directory."""
    try:
        # Get source and destination paths
        www_source = os.path.join(os.path.dirname(__file__), "www", "chores-dashboard")
        www_target = os.path.join(hass.config.path("www"), "chores-dashboard")

        def copy_files():
            """Copy files with correct permissions."""
            _LOGGER.info("Setting up web assets from %s to %s", www_source, www_target)

            # Make parent directory if needed
            os.makedirs(os.path.dirname(www_target), exist_ok=True)

            # Remove existing directory if it exists
            if os.path.exists(www_target):
                _LOGGER.info("Removing existing directory at %s", www_target)
                shutil.rmtree(www_target)

            # Copy files
            shutil.copytree(www_source, www_target)
            _LOGGER.info("Files copied successfully")

            # Set correct permissions
            for root, dirs, files in os.walk(www_target):
                for d in dirs:
                    os.chmod(os.path.join(root, d), 0o755)
                for f in files:
                    os.chmod(os.path.join(root, f), 0o644)

            # Create a minimal config.json if it doesn't exist
            config_path = os.path.join(www_target, "config.json")
            if not os.path.exists(config_path):
                with open(config_path, "w") as f:
                    import json
                    json.dump({
                        "refresh_interval": 30000,
                        "debug": False
                    }, f, indent=2)
                os.chmod(config_path, 0o644)

        # Use executor to avoid blocking
        await hass.async_add_executor_job(copy_files)

    except Exception as e:
        _LOGGER.error("Failed to copy web assets: %s", e, exc_info=True)

async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Update options for the entry."""
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, [Platform.SENSOR])
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok
