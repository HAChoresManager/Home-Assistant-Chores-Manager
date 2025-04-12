"""Service handlers for Chores Manager."""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from .const import DOMAIN, ATTR_CHORE_ID, ATTR_PERSON, ATTR_DESCRIPTION, ATTR_SUBTASK_ID
from .database import (
    add_chore_to_db,
    mark_chore_done,
    update_chore_description,
    reset_chore,
    add_user,
    delete_user,
    force_chore_due,
    get_ha_user_id_for_assignee,
    delete_chore,
    complete_subtask,
    add_subtask,
    delete_subtask,
    update_chore_completion_status
)
from .utils import async_check_due_notifications, send_user_summary_notification
from .schemas import (
    ADD_CHORE_SCHEMA,
    MARK_DONE_SCHEMA,
    UPDATE_DESCRIPTION_SCHEMA,
    RESET_CHORE_SCHEMA,
    ADD_USER_SCHEMA,
    DELETE_USER_SCHEMA,
    FORCE_DUE_SCHEMA,
    DELETE_CHORE_SCHEMA
)

_LOGGER = logging.getLogger(__name__)


async def async_register_services(hass: HomeAssistant, database_path: str) -> None:
    """Register services for chores manager."""

    async def handle_add_chore(call: ServiceCall) -> Dict[str, Any]:
        """Handle the add_chore service call."""
        chore_data = dict(call.data)
        chore_id = chore_data[ATTR_CHORE_ID]
        _LOGGER.debug("Adding/updating chore: %s", chore_id)

        try:
            result = await hass.async_add_executor_job(
                add_chore_to_db, database_path, chore_data
            )
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error adding/updating chore: %s", err, exc_info=True)
            raise

    async def handle_mark_done(call: ServiceCall) -> Dict[str, Any]:
        """Handle the mark_done service call."""
        chore_id = call.data[ATTR_CHORE_ID]
        person = call.data[ATTR_PERSON]

        try:
            result = await hass.async_add_executor_job(
                mark_chore_done, database_path, chore_id, person
            )
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error marking chore as done: %s", err)
            raise

    async def handle_update_description(call: ServiceCall) -> Dict[str, Any]:
        """Handle updating a chore description."""
        chore_id = call.data[ATTR_CHORE_ID]
        description = call.data[ATTR_DESCRIPTION]

        try:
            result = await hass.async_add_executor_job(
                update_chore_description, database_path, chore_id, description
            )
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error updating chore description: %s", err)
            raise

    async def handle_reset_chore(call: ServiceCall) -> Dict[str, Any]:
        """Handle resetting a chore completely including history."""
        chore_id = call.data[ATTR_CHORE_ID]

        try:
            result = await hass.async_add_executor_job(
                reset_chore, database_path, chore_id
            )
            # Force immediate update
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error resetting chore: %s", err)
            raise

    async def handle_add_user(call: ServiceCall) -> Dict[str, Any]:
        """Handle adding or updating a user."""
        user_data = dict(call.data)

        try:
            result = await hass.async_add_executor_job(
                add_user, database_path, user_data
            )
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error adding/updating user: %s", err)
            raise

    async def handle_delete_user(call: ServiceCall) -> Dict[str, Any]:
        """Handle deleting a user."""
        user_id = call.data.get("user_id")

        try:
            result = await hass.async_add_executor_job(
                delete_user, database_path, user_id
            )
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error deleting user: %s", err)
            raise

    async def handle_get_ha_users(call: ServiceCall) -> Dict[str, Any]:
        """Get list of available Home Assistant users."""
        try:
            # Get all users
            users = await hass.auth.async_get_users()

            # Filter out system users
            valid_users = [
                {
                    "id": user.id,
                    "name": user.name,
                    "is_active": user.is_active
                }
                for user in users
                if not user.system_generated and user.is_active
            ]

            return {"users": valid_users}
        except Exception as err:
            _LOGGER.error("Error getting HA users: %s", err)
            raise

    async def handle_force_due(call: ServiceCall) -> Dict[str, Any]:
        """Handle forcing a task to be due today."""
        chore_id = call.data[ATTR_CHORE_ID]
        should_notify = call.data.get("notify", False)
        custom_message = call.data.get("message")

        try:
            result = await hass.async_add_executor_job(
                force_chore_due, database_path, chore_id
            )

            # Notification handling:
            if should_notify and result.get("success"):
                # Two options:
                # 1. Custom message - send direct notification
                # 2. No custom message - check other tasks and send a summary

                if custom_message:
                    # If there's a custom message, send a direct notification
                    chore_name = result.get("chore_name", chore_id)
                    assigned_to = result.get("assigned_to")
                    ha_user_id = await hass.async_add_executor_job(
                        get_ha_user_id_for_assignee, database_path, assigned_to
                    )

                    if ha_user_id:
                        await send_user_summary_notification(
                            hass,
                            ha_user_id,
                            "Taak toegevoegd",
                            custom_message
                        )
                else:
                    # No custom message - update tasks due notification
                    if result.get("has_auto_notify"):
                        # Run the standard notification check which will handle this
                        await async_check_due_notifications(hass, database_path)
                    else:
                        # Simple notification
                        chore_name = result.get("chore_name", chore_id)
                        assigned_to = result.get("assigned_to")
                        ha_user_id = await hass.async_add_executor_job(
                            get_ha_user_id_for_assignee, database_path, assigned_to
                        )

                        if ha_user_id:
                            await send_user_summary_notification(
                                hass,
                                ha_user_id,
                                "Taak op planning",
                                f"Taak '{chore_name}' staat op de planning voor vandaag"
                            )

            # Force an immediate update
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result

        except Exception as err:
            _LOGGER.error("Error forcing chore due: %s", err)
            raise

    async def handle_delete_chore(call: ServiceCall) -> Dict[str, Any]:
        """Handle the delete_chore service call."""
        chore_id = call.data[ATTR_CHORE_ID]

        try:
            result = await hass.async_add_executor_job(
                delete_chore, database_path, chore_id
            )
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error deleting chore: %s", err)
            raise

    async def handle_complete_subtask(call: ServiceCall) -> Dict[str, Any]:
        """Handle completing a subtask."""
        subtask_id = call.data.get(ATTR_SUBTASK_ID)
        person = call.data.get(ATTR_PERSON)

        if not subtask_id or not person:
            raise ValueError("subtask_id and person are required")

        try:
            result = await hass.async_add_executor_job(
                complete_subtask, database_path, subtask_id, person
            )

            # Also update the main chore completion status based on completion rules
            chore_id = result.get("chore_id")
            if chore_id:
                await hass.async_add_executor_job(
                    update_chore_completion_status, database_path, chore_id
                )

            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error completing subtask: %s", err)
            raise

    async def handle_add_subtask(call: ServiceCall) -> Dict[str, Any]:
        """Handle adding a subtask to a chore."""
        chore_id = call.data.get(ATTR_CHORE_ID)
        name = call.data.get("name")
        position = call.data.get("position", 0)

        try:
            result = await hass.async_add_executor_job(
                add_subtask, database_path, chore_id, name, position
            )
            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error adding subtask: %s", err)
            raise

    async def handle_delete_subtask(call: ServiceCall) -> Dict[str, Any]:
        """Handle deleting a subtask."""
        subtask_id = call.data.get(ATTR_SUBTASK_ID)

        try:
            result = await hass.async_add_executor_job(
                delete_subtask, database_path, subtask_id
            )

            # Update parent chore completion status after deletion
            chore_id = result.get("chore_id")
            if chore_id:
                await hass.async_add_executor_job(
                    update_chore_completion_status, database_path, chore_id
                )

            async_dispatcher_send(hass, f"{DOMAIN}_updated")
            return result
        except Exception as err:
            _LOGGER.error("Error deleting subtask: %s", err)
            raise

    # Register all services
    hass.services.async_register(
        DOMAIN,
        "add_chore",
        handle_add_chore,
        schema=ADD_CHORE_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "mark_done",
        handle_mark_done,
        schema=MARK_DONE_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "update_description",
        handle_update_description,
        schema=UPDATE_DESCRIPTION_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "reset_chore",
        handle_reset_chore,
        schema=RESET_CHORE_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "add_user",
        handle_add_user,
        schema=ADD_USER_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "delete_user",
        handle_delete_user,
        schema=DELETE_USER_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "get_ha_users",
        handle_get_ha_users
    )

    hass.services.async_register(
        DOMAIN,
        "force_due",
        handle_force_due,
        schema=FORCE_DUE_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        "delete_chore",
        handle_delete_chore,
        schema=DELETE_CHORE_SCHEMA
    )

    # Register subtask services
    hass.services.async_register(
        DOMAIN,
        "complete_subtask",
        handle_complete_subtask,
        schema=vol.Schema({
            vol.Required(ATTR_SUBTASK_ID): vol.Coerce(int),
            vol.Required(ATTR_PERSON): cv.string
        })
    )

    hass.services.async_register(
        DOMAIN,
        "add_subtask",
        handle_add_subtask,
        schema=vol.Schema({
            vol.Required(ATTR_CHORE_ID): cv.string,
            vol.Required("name"): cv.string,
            vol.Optional("position", default=0): vol.Coerce(int)
        })
    )

    hass.services.async_register(
        DOMAIN,
        "delete_subtask",
        handle_delete_subtask,
        schema=vol.Schema({
            vol.Required(ATTR_SUBTASK_ID): vol.Coerce(int)
        })
    )
