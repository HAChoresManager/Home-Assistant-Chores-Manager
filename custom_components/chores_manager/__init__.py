"""Initialize the Chores Manager integration."""
import logging
import os
import json
import shutil
import secrets
import asyncio
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

# Global lock for token refresh to prevent race conditions
_token_refresh_lock = asyncio.Lock()


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

    # Initialize database with error handling
    try:
        from .database import init_database, verify_database
        await hass.async_add_executor_job(init_database, str(database_path))
        
        # Verify database is working
        verification = await hass.async_add_executor_job(verify_database, str(database_path))
        if not verification.get("success"):
            _LOGGER.error("Database verification failed: %s", verification.get("error"))
            return False
    except Exception as e:
        _LOGGER.error("Failed to initialize database: %s", e)
        return False

    # Store the database path and lock in hass.data
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "database_path": str(database_path),
        "token_refresh_lock": _token_refresh_lock,
        "token_refresh_count": 0,
        "last_token_refresh": None
    }

    # Generate authentication token for dashboard with more frequent refresh
    try:
        _LOGGER.info("Generating authentication token for chores dashboard")
        token = await _generate_dashboard_token(hass)
        
        if token:
            # Store in config entry
            new_data = dict(entry.data)
            new_data["auth_token"] = token
            new_data["auth_token_generated"] = hass.loop.time()
            hass.config_entries.async_update_entry(entry, data=new_data)

            # Update dashboard config with token
            await _update_dashboard_config(hass, token)
            
            # Track successful token generation
            hass.data[DOMAIN][entry.entry_id]["last_token_refresh"] = hass.loop.time()
        else:
            _LOGGER.warning("Failed to generate authentication token")
    except Exception as err:
        _LOGGER.error("Failed to generate/update authentication token: %s", err)
        # Continue setup even if token generation fails

    # Set up token refresh with proper locking
    async def refresh_token_periodically(now=None):
        """Refresh the token periodically with race condition prevention."""
        # Use the lock to prevent concurrent refreshes
        async with hass.data[DOMAIN][entry.entry_id]["token_refresh_lock"]:
            try:
                # Check if we should refresh (prevent rapid refreshes)
                last_refresh = hass.data[DOMAIN][entry.entry_id].get("last_token_refresh")
                if last_refresh:
                    time_since_refresh = hass.loop.time() - last_refresh
                    if time_since_refresh < 60:  # Don't refresh more than once per minute
                        _LOGGER.debug("Skipping token refresh, too soon since last refresh")
                        return
                
                _LOGGER.info("Periodic token refresh triggered (count: %d)", 
                           hass.data[DOMAIN][entry.entry_id]["token_refresh_count"])
                
                # Generate new token
                new_token = await _generate_dashboard_token(hass)
                
                if new_token:
                    # Update config entry
                    updated_data = dict(entry.data)
                    updated_data["auth_token"] = new_token
                    updated_data["auth_token_generated"] = hass.loop.time()
                    hass.config_entries.async_update_entry(entry, data=updated_data)

                    # Update dashboard config
                    await _update_dashboard_config(hass, new_token)
                    
                    # Track successful refresh
                    hass.data[DOMAIN][entry.entry_id]["token_refresh_count"] += 1
                    hass.data[DOMAIN][entry.entry_id]["last_token_refresh"] = hass.loop.time()
                    
                    _LOGGER.info("Token refreshed successfully")
                else:
                    _LOGGER.warning("Token refresh failed - no token generated")
            except Exception as err:
                _LOGGER.error("Failed to refresh token: %s", err, exc_info=True)

    # Schedule token refresh
    hass.data[DOMAIN][entry.entry_id]["token_refresh_unsub"] = async_track_time_interval(
        hass, refresh_token_periodically, TOKEN_REFRESH_INTERVAL
    )

    # Register services
    try:
        from .services import async_register_services
        await async_register_services(hass, str(database_path))
    except Exception as e:
        _LOGGER.error("Failed to register services: %s", e)
        return False

    # Forward config entry to the sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register panel and set up web assets
    try:
        from .panel import async_setup_panel
        await async_setup_panel(hass)
        await _setup_web_assets(hass)
    except Exception as err:
        _LOGGER.error("Failed to set up panel or web assets: %s", err)
        # Non-fatal error, continue

    _LOGGER.info("Chores Manager setup completed successfully")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Cancel token refresh subscription if exists
    if "token_refresh_unsub" in hass.data[DOMAIN][entry.entry_id]:
        hass.data[DOMAIN][entry.entry_id]["token_refresh_unsub"]()
        _LOGGER.info("Cancelled token refresh subscription")

    # Unregister services
    try:
        from .services import async_unregister_services
        await async_unregister_services(hass)
    except Exception as e:
        _LOGGER.warning("Failed to unregister services: %s", e)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        _LOGGER.info("Chores Manager unloaded successfully")
    return unload_ok


async def _generate_dashboard_token(hass: HomeAssistant) -> str:
    """Generate a long-lived access token for the dashboard with improved mobile compatibility."""
    try:
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
            _LOGGER.error("No admin user found to create token")
            return None

        # Prefer non-system generated users for better mobile app compatibility
        preferred_user = None
        for user in admin_users:
            if not user.system_generated:
                preferred_user = user
                break

        if not preferred_user:
            preferred_user = admin_users[0]  # Fallback to first admin user

        _LOGGER.info(f"Creating token for user: {preferred_user.name} (system_generated: {preferred_user.system_generated})")

        # Create refresh token with error handling
        refresh_token = await hass.auth.async_create_refresh_token(
            preferred_user, 
            client_name=client_name,
            # Set longer expiration for better mobile compatibility
            token_type="long_lived_access_token"
        )
        
        if not refresh_token:
            _LOGGER.error("Failed to create refresh token")
            return None
            
        access_token = hass.auth.async_create_access_token(refresh_token)
        
        if not access_token:
            _LOGGER.error("Failed to create access token from refresh token")
            return None
            
        return access_token
        
    except Exception as err:
        _LOGGER.error(f"Failed to create token: {err}", exc_info=True)
        return None


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
                except (json.JSONDecodeError, IOError) as e:
                    _LOGGER.warning("Existing config.json was invalid: %s, creating new one", e)
            return {}

        def write_config(config_data):
            # Create backup of existing config
            if config_file.exists():
                backup_file = config_file.with_suffix('.json.backup')
                shutil.copy2(config_file, backup_file)
            
            # Write new config
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
        config["version"] = "1.0.0"

        # Write updated config in executor
        await hass.async_add_executor_job(lambda: write_config(config))

        _LOGGER.info("Updated dashboard config with new authentication token (mobile optimized)")
    except Exception as err:
        _LOGGER.error("Failed to update dashboard config: %s", err, exc_info=True)


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
                # Try backup location
                backup_source = os.path.join(hass.config.path("www"), "chores-dashboard-backup")
                if os.path.exists(backup_source):
                    _LOGGER.info("Using backup source: %s", backup_source)
                    www_source_actual = backup_source
                else:
                    _LOGGER.error("No source directory found for web assets")
                    return False
            else:
                www_source_actual = www_source
            
            # List source contents for debugging
            _LOGGER.debug("Source directory contents: %s", os.listdir(www_source_actual))
            
            # Create target directory
            os.makedirs(www_target, exist_ok=True)
            
            # Copy all files with proper error handling
            import shutil
            for item in os.listdir(www_source_actual):
                source_path = os.path.join(www_source_actual, item)
                target_path = os.path.join(www_target, item)
                
                try:
                    if os.path.isdir(source_path):
                        if os.path.exists(target_path):
                            shutil.rmtree(target_path)
                        shutil.copytree(source_path, target_path)
                    else:
                        shutil.copy2(source_path, target_path)
                    
                    _LOGGER.debug("Copied %s to %s", item, target_path)
                except Exception as e:
                    _LOGGER.error("Failed to copy %s: %s", item, e)
            
            # Set permissions
            for root, dirs, files in os.walk(www_target):
                for d in dirs:
                    try:
                        os.chmod(os.path.join(root, d), 0o755)
                    except Exception:
                        pass
                for f in files:
                    try:
                        os.chmod(os.path.join(root, f), 0o644)
                    except Exception:
                        pass

            _LOGGER.info("Web assets setup completed")
            return True

        success = await hass.async_add_executor_job(copy_files)
        if not success:
            _LOGGER.error("Failed to copy web assets")
    except Exception as e:
        _LOGGER.error("Failed to copy web assets: %s", e, exc_info=True)
