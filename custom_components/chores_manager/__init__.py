"""Initialize the Chores Manager integration."""
import logging
import os
import json
import shutil
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.auth.const import GROUP_ID_ADMIN
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

    # Generate or retrieve a token for the dashboard
    token = entry.data.get("auth_token")
    if not token:
        try:
            _LOGGER.info("Generating new authentication token for chores dashboard")
            token = await _generate_dashboard_token(hass)
            # Store in config entry
            new_data = dict(entry.data)
            new_data["auth_token"] = token
            hass.config_entries.async_update_entry(entry, data=new_data)
        except Exception as err:
            _LOGGER.error("Failed to generate authentication token: %s", err)

    # Update dashboard config with token
    if token:
        await _update_dashboard_config(hass, token)

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

    # Set up web assets
    await setup_web_assets(hass)

    return True


async def _generate_dashboard_token(hass: HomeAssistant) -> str:
    """Generate a long-lived access token for the dashboard."""
    # Find an admin user to create the token with
    for user in await hass.auth.async_get_users():
        if not user.is_active:
            continue
        
        for group in user.groups:
            if group.id == GROUP_ID_ADMIN:
                # Create token for admin user
                _LOGGER.debug("Creating token for user %s", user.name)
                refresh_token = await hass.auth.async_create_refresh_token(
                    user, client_name="Chores Manager Dashboard"
                )
                access_token = hass.auth.async_create_access_token(refresh_token)
                return access_token
    
    # If no admin user found, raise error
    raise ValueError("No admin user found to create token")


async def _update_dashboard_config(hass: HomeAssistant, token: str) -> None:
    """Update dashboard config with the authentication token."""
    config_dir = Path(hass.config.path("www/chores-dashboard"))
    config_file = config_dir / "config.json"
    
    # Ensure directory exists
    os.makedirs(config_dir, exist_ok=True)
    
    try:
        # Load existing config if it exists
        config = {}
        if config_file.exists():
            try:
                with open(config_file, "r") as f:
                    config = json.load(f)
            except json.JSONDecodeError:
                _LOGGER.warning("Existing config.json was invalid, creating new one")
        
        # Update with token
        config["api_token"] = token
        config.setdefault("refresh_interval", 30000)
        config.setdefault("debug", False)
        
        # Save updated config
        with open(config_file, "w") as f:
            json.dump(config, f, indent=2)
        
        # Set proper permissions
        os.chmod(config_file, 0o644)
        
        _LOGGER.info("Updated dashboard config with authentication token")
    
    except Exception as err:
        _LOGGER.error("Failed to update dashboard config: %s", err)


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

        await hass.async_add_executor_job(copy_files)
        _LOGGER.info("Web assets setup completed")

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
