"""Config flow for Chores Manager integration."""
import os
import logging
import voluptuous as vol
from pathlib import Path

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, DEFAULT_DB, DEFAULT_NOTIFICATION_TIME

_LOGGER = logging.getLogger(__name__)

class ChoresManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Chores Manager."""

    VERSION = 1
    CONNECTION_CLASS = config_entries.CONN_CLASS_LOCAL_PUSH

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}

        # Only allow a single instance of the integration
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            # Validate the database path
            database_path = user_input.get("database", DEFAULT_DB)
            if not os.path.isabs(database_path):
                database_path = Path(self.hass.config.path(database_path))
            else:
                database_path = Path(database_path)

            # Create directory if it doesn't exist
            if not database_path.parent.exists():
                try:
                    os.makedirs(database_path.parent, exist_ok=True)
                except Exception as e:
                    _LOGGER.error("Error creating database directory: %s", e)
                    errors["database"] = "invalid_path"

            if not errors:
                # Return the data to be stored in the config entry
                return self.async_create_entry(
                    title="Chores Manager",
                    data=user_input
                )

        # Show the form for user input
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Optional("database", default=DEFAULT_DB): str,
                    vol.Optional("notification_time", default=DEFAULT_NOTIFICATION_TIME): str,
                }
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return ChoresManagerOptionsFlowHandler(config_entry)


class ChoresManagerOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle Chores Manager options."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            # Check if token regeneration is requested
            if user_input.pop("regenerate_token", False):
                from . import _generate_dashboard_token, _update_dashboard_config
                try:
                    token = await _generate_dashboard_token(self.hass)
                    
                    # Update config entry with new token
                    new_data = dict(self.config_entry.data)
                    new_data["auth_token"] = token
                    self.hass.config_entries.async_update_entry(
                        self.config_entry, 
                        data=new_data
                    )
                    
                    # Update dashboard config file
                    await _update_dashboard_config(self.hass, token)
                except Exception as err:
                    _LOGGER.error("Failed to regenerate token: %s", err)
            
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        "database",
                        default=self.config_entry.data.get("database", DEFAULT_DB),
                    ): str,
                    vol.Optional(
                        "notification_time",
                        default=self.config_entry.data.get("notification_time", DEFAULT_NOTIFICATION_TIME),
                    ): str,
                    vol.Optional(
                        "regenerate_token",
                        default=False,
                    ): bool,
                }
            ),
        )
