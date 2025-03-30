"""Initialize the Chores Manager integration."""
import logging
import os
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.helpers.entity_platform import async_get_platforms
from homeassistant.helpers.entity_registry import async_get

from .const import DOMAIN, DEFAULT_DB
from .database import init_database, verify_database
from .services import async_register_services
from .panel import async_setup_panel
from .sensor import ChoresOverviewSensor

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up chores_manager from a config entry."""
    _LOGGER.info("Setting up chores_manager from config entry")

    # Handle database path - allow relative or absolute
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

    # Register services
    await async_register_services(hass, str(database_path))

    # CRITICAL: Create and register the sensor manually
    sensor = ChoresOverviewSensor(str(database_path))
    sensor.entity_id = "sensor.chores_overview"
    sensor.hass = hass

    # Add to Home Assistant
    from homeassistant.helpers.entity_component import EntityComponent
    from homeassistant.components.sensor import DOMAIN as SENSOR_DOMAIN

    # Get the sensor component
    component = hass.data.get("entity_components", {}).get(SENSOR_DOMAIN)
    if not component:
        component = await hass.helpers.entity_component.async_get_entity_component(SENSOR_DOMAIN)

    # Add entity and force update
    await component.async_add_entities([sensor])
    await sensor.async_update()

    # Register in entity registry
    entity_registry = async_get(hass)
    entity_registry.async_get_or_create(
        SENSOR_DOMAIN, DOMAIN, "chores_overview",
        suggested_object_id="chores_overview"
    )

    # Register panel
    await async_setup_panel(hass)

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

            # Check if source directory exists
            if not os.path.exists(www_source):
                _LOGGER.error("Source directory %s does not exist", www_source)
                # Try to use fallback source from backup
                backup_source = os.path.join(hass.config.path("www"), "chores-dashboard-backup")
                if os.path.exists(backup_source):
                    _LOGGER.info("Using backup source: %s", backup_source)
                    www_source_actual = backup_source
                else:
                    _LOGGER.error("No source directory found for web assets")
                    return
            else:
                www_source_actual = www_source

            # Make parent directory if needed
            os.makedirs(os.path.dirname(www_target), exist_ok=True)

            # Remove existing directory if it exists
            if os.path.exists(www_target):
                _LOGGER.info("Removing existing directory at %s", www_target)
                shutil.rmtree(www_target)

            # Copy files
            shutil.copytree(www_source_actual, www_target)
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

            # Add cache-busting .htaccess file
            htaccess_path = os.path.join(www_target, ".htaccess")
            with open(htaccess_path, "w") as f:
                f.write("""
<FilesMatch "\.(js|css|html)$">
Header set Cache-Control "no-cache, no-store, must-revalidate"
Header set Pragma "no-cache"
Header set Expires "0"
</FilesMatch>
""")
            os.chmod(htaccess_path, 0o644)

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
