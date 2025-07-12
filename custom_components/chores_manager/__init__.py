"""Initialize the Chores Manager integration."""
import logging
import os
import json
import shutil
import secrets
from pathlib import Path
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.auth.const import GROUP_ID_ADMIN
from homeassistant.const import Platform
from homeassistant.helpers.event import async_track_time_interval

# Define constants here to avoid circular imports
DOMAIN = "chores_manager"
DEFAULT_DB = "chores_manager.db"
DEFAULT_NOTIFICATION_TIME = "08:00"
PLATFORMS = [Platform.SENSOR]
# Reduced refresh interval to 2 hours for better mobile app compatibility
TOKEN_REFRESH_INTERVAL = timedelta(hours=2)

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
    from .database import init_database
    await hass.async_add_executor_job(init_database, str(database_path))

    # Store the database path in hass.data
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "database_path": str(database_path),
    }

    # Generate authentication token for dashboard with more frequent refresh
    try:
        _LOGGER.info("Generating authentication token for chores dashboard")
        token = await _generate_dashboard_token(hass)
        # Store in config entry
        new_data = dict(entry.data)
        new_data["auth_token"] = token
        new_data["auth_token_generated"] = hass.loop.time()  # Store generation time
        hass.config_entries.async_update_entry(entry, data=new_data)

        # Update dashboard config with token
        if token:
            await _update_dashboard_config(hass, token)
    except Exception as err:
        _LOGGER.error("Failed to generate/update authentication token: %s", err)

    # Set up more frequent token refresh for better mobile compatibility
    async def refresh_token_periodically(now=None):
        """Refresh the token periodically."""
        try:
            _LOGGER.info("Periodic token refresh triggered")
            # Generate new token
            new_token = await _generate_dashboard_token(hass)

            # Update config entry
            updated_data = dict(entry.data)
            updated_data["auth_token"] = new_token
            updated_data["auth_token_generated"] = hass.loop.time()
            hass.config_entries.async_update_entry(entry, data=updated_data)

            # Update dashboard config
            await _update_dashboard_config(hass, new_token)
            _LOGGER.info("Token refreshed successfully")
        except Exception as err:
            _LOGGER.error("Failed to refresh token: %s", err)

    # Schedule more frequent token refresh
    hass.data[DOMAIN][entry.entry_id]["token_refresh_unsub"] = async_track_time_interval(
        hass, refresh_token_periodically, TOKEN_REFRESH_INTERVAL
    )

    # Register services
    from .services import async_register_services
    await async_register_services(hass, str(database_path))

    # Forward config entry to the sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register panel and set up web assets
    try:
        from .panel import async_setup_panel
        await async_setup_panel(hass)
        await _setup_web_assets(hass)
    except Exception as err:
        _LOGGER.error("Failed to set up panel or web assets: %s", err)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Cancel token refresh subscription if exists
    if "token_refresh_unsub" in hass.data[DOMAIN][entry.entry_id]:
        hass.data[DOMAIN][entry.entry_id]["token_refresh_unsub"]()

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def _generate_dashboard_token(hass: HomeAssistant) -> str:
    """Generate a long-lived access token for the dashboard with improved mobile compatibility."""
    # Add a random component to the client name to create unique tokens each time
    random_id = secrets.token_hex(4)
    client_name = f"Chores Manager Dashboard {random_id}"

    # Try to find an admin user, preferring non-system users
    admin_users = []
    for user in await hass.auth.async_get_users():
        if not user.is_active:
            continue
        for group in user.groups:
            if group.id == GROUP_ID_ADMIN:
                admin_users.append(user)
                break

    if not admin_users:
        raise ValueError("No admin user found to create token")

    # Prefer non-system generated users for better mobile app compatibility
    preferred_user = None
    for user in admin_users:
        if not user.system_generated:
            preferred_user = user
            break

    if not preferred_user:
        preferred_user = admin_users[0]  # Fallback to first admin user

    _LOGGER.info(f"Creating token for user: {preferred_user.name} (system_generated: {preferred_user.system_generated})")

    try:
        refresh_token = await hass.auth.async_create_refresh_token(
            preferred_user, 
            client_name=client_name,
            # Set longer expiration for better mobile compatibility
            token_type="long_lived_access_token"
        )
        access_token = hass.auth.async_create_access_token(refresh_token)
        return access_token
    except Exception as err:
        _LOGGER.error(f"Failed to create token for user {preferred_user.name}: {err}")
        raise


async def _update_dashboard_config(hass: HomeAssistant, token: str) -> None:
    """Update dashboard config with the authentication token."""
    config_dir = Path(hass.config.path("www/chores-dashboard"))
    config_file = config_dir / "config.json"

    # Ensure directory exists
    await hass.async_add_executor_job(lambda: os.makedirs(config_dir, exist_ok=True))

    try:
        def read_config():
            if config_file.exists():
                try:
                    with open(config_file, "r") as f:
                        return json.load(f)
                except (json.JSONDecodeError, IOError):
                    _LOGGER.warning("Existing config.json was invalid, creating new one")
            return {}

        def write_config(config_data):
            with open(config_file, "w") as f:
                json.dump(config_data, f, indent=2)
            os.chmod(config_file, 0o644)

        # Read existing config in executor
        config = await hass.async_add_executor_job(read_config)

        # Update config values
        config["api_token"] = token
        config.setdefault("refresh_interval", 30000)  # 30 seconds for mobile compatibility
        config.setdefault("debug", False)
        # Add timestamp to help debug token changes
        config["token_updated"] = hass.loop.time()
        config["mobile_optimized"] = True  # Flag to indicate mobile optimization

        # Write updated config in executor
        await hass.async_add_executor_job(lambda: write_config(config))

        _LOGGER.info("Updated dashboard config with new authentication token (mobile optimized)")
    except Exception as err:
        _LOGGER.error("Failed to update dashboard config: %s", err)


async def _setup_web_assets(hass: HomeAssistant) -> None:
    """Set up web assets by copying files to www directory."""
    try:
        www_source = os.path.join(os.path.dirname(__file__), "www", "chores-dashboard")
        www_target = os.path.join(hass.config.path("www"), "chores-dashboard")

        def copy_files():
            _LOGGER.info("Setting up web assets from %s to %s", www_source, www_target)
            
            # Check if source exists
            if not os.path.exists(www_source):
                _LOGGER.error("Source directory %s does not exist", www_source)
                # List contents of parent directory for debugging
                parent_dir = os.path.dirname(__file__)
                _LOGGER.info("Contents of %s: %s", parent_dir, os.listdir(parent_dir))
                
                # Check if www directory exists
                www_dir = os.path.join(parent_dir, "www")
                if os.path.exists(www_dir):
                    _LOGGER.info("Contents of www: %s", os.listdir(www_dir))
                return False
            
            # List source contents for debugging
            _LOGGER.info("Source directory contents: %s", os.listdir(www_source))
            
            # Create target directory
            os.makedirs(www_target, exist_ok=True)
            
            # Copy all files
            import shutil
            for item in os.listdir(www_source):
                source_path = os.path.join(www_source, item)
                target_path = os.path.join(www_target, item)
                
                if os.path.isdir(source_path):
                    if os.path.exists(target_path):
                        shutil.rmtree(target_path)
                    shutil.copytree(source_path, target_path)
                else:
                    shutil.copy2(source_path, target_path)
                
                _LOGGER.info("Copied %s to %s", item, target_path)
            
            # Set permissions
            for root, dirs, files in os.walk(www_target):
                for d in dirs:
                    os.chmod(os.path.join(root, d), 0o755)
                for f in files:
                    os.chmod(os.path.join(root, f), 0o644)
            
            _LOGGER.info("Web assets setup completed")
            return True

        success = await hass.async_add_executor_job(copy_files)
        if not success:
            _LOGGER.error("Failed to copy web assets")
    except Exception as e:
        _LOGGER.error("Failed to copy web assets: %s", e, exc_info=True)


async def async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Update options for the entry."""
    await hass.config_entries.async_reload(entry.entry_id)
