"""Chore-related service handlers."""
import logging
from typing import Dict, Any

from homeassistant.core import HomeAssistant, ServiceCall
import voluptuous as vol

from ..const import DOMAIN
from ..schemas import (
    ADD_CHORE_SCHEMA,
    MARK_DONE_SCHEMA,
    UPDATE_DESCRIPTION_SCHEMA,
    RESET_CHORE_SCHEMA,
    FORCE_DUE_SCHEMA,
    DELETE_CHORE_SCHEMA
)
from ..database import (
    add_chore_to_db,
    mark_chore_done,
    update_chore_description,
    reset_chore,
    force_chore_due,
    delete_chore,
    complete_subtask,
    add_subtask,
    delete_subtask,
    update_chore_completion_status
)
from .base import (
    service_error_handler,
    notify_state_change,
    validate_required_fields,
    log_service_call,
    ServiceResponse
)

_LOGGER = logging.getLogger(__name__)


async def register_chore_services(hass: HomeAssistant, database_path: str) -> None:
    """Register chore-related services."""
    
    @service_error_handler
    async def handle_add_chore(call: ServiceCall) -> Dict[str, Any]:
        """Handle the add_chore service call."""
        chore_data = dict(call.data)
        log_service_call("add_chore", chore_data)
        
        # Validate required fields
        validate_required_fields(chore_data, ["chore_id"])
        
        # Process the chore
        result = await hass.async_add_executor_job(
            add_chore_to_db, database_path, chore_data
        )
        
        if result.get("success"):
            notify_state_change(hass)
            _LOGGER.info("Successfully added/updated chore: %s", chore_data["chore_id"])
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_mark_done(call: ServiceCall) -> Dict[str, Any]:
        """Handle the mark_done service call."""
        chore_id = call.data["chore_id"]
        person = call.data["person"]
        
        log_service_call("mark_done", call.data)
        
        result = await hass.async_add_executor_job(
            mark_chore_done, database_path, chore_id, person
        )
        
        if result.get("success"):
            notify_state_change(hass)
            _LOGGER.info("Chore %s marked as done by %s", chore_id, person)
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_update_description(call: ServiceCall) -> Dict[str, Any]:
        """Handle updating a chore description."""
        chore_id = call.data["chore_id"]
        description = call.data["description"]
        
        result = await hass.async_add_executor_job(
            update_chore_description, database_path, chore_id, description
        )
        
        if result.get("success"):
            notify_state_change(hass)
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_reset_chore(call: ServiceCall) -> Dict[str, Any]:
        """Handle resetting a chore."""
        chore_id = call.data["chore_id"]
        
        result = await hass.async_add_executor_job(
            reset_chore, database_path, chore_id
        )
        
        if result.get("success"):
            notify_state_change(hass)
            _LOGGER.info("Reset completion for chore: %s", chore_id)
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_delete_chore(call: ServiceCall) -> Dict[str, Any]:
        """Handle deleting a chore."""
        chore_id = call.data["chore_id"]
        
        result = await hass.async_add_executor_job(
            delete_chore, database_path, chore_id
        )
        
        if result.get("success"):
            notify_state_change(hass)
            _LOGGER.info("Deleted chore: %s", chore_id)
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_force_due(call: ServiceCall) -> Dict[str, Any]:
        """Handle forcing a task to be due today."""
        from ..utils import send_user_summary_notification
        
        chore_id = call.data["chore_id"]
        should_notify = call.data.get("notify", False)
        custom_message = call.data.get("message")
        
        # Force the chore due
        result = await hass.async_add_executor_job(
            force_chore_due, database_path, chore_id
        )
        
        if result.get("success") and should_notify:
            await _handle_force_due_notification(
                hass, database_path, result, custom_message
            )
        
        if result.get("success"):
            notify_state_change(hass)
        
        return ServiceResponse.from_db_result(result)
    
    # Subtask services
    @service_error_handler
    async def handle_complete_subtask(call: ServiceCall) -> Dict[str, Any]:
        """Handle completing a subtask."""
        subtask_id = call.data["subtask_id"]
        person = call.data["person"]
        
        validate_required_fields(call.data, ["subtask_id", "person"])
        
        result = await hass.async_add_executor_job(
            complete_subtask, database_path, subtask_id, person
        )
        
        if result.get("success"):
            # Update main chore completion status
            chore_id = result.get("chore_id")
            if chore_id:
                await hass.async_add_executor_job(
                    update_chore_completion_status, database_path, chore_id
                )
            
            notify_state_change(hass)
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_add_subtask(call: ServiceCall) -> Dict[str, Any]:
        """Handle adding a subtask."""
        chore_id = call.data["chore_id"]
        name = call.data["name"]
        position = call.data.get("position", 0)
        
        result = await hass.async_add_executor_job(
            add_subtask, database_path, chore_id, name, position
        )
        
        if result.get("success"):
            notify_state_change(hass)
        
        return ServiceResponse.from_db_result(result)
    
    @service_error_handler
    async def handle_delete_subtask(call: ServiceCall) -> Dict[str, Any]:
        """Handle deleting a subtask."""
        subtask_id = call.data["subtask_id"]
        
        result = await hass.async_add_executor_job(
            delete_subtask, database_path, subtask_id
        )
        
        if result.get("success"):
            # Update parent chore completion status
            chore_id = result.get("chore_id")
            if chore_id:
                await hass.async_add_executor_job(
                    update_chore_completion_status, database_path, chore_id
                )
            
            notify_state_change(hass)
        
        return ServiceResponse.from_db_result(result)
    
    # Register all services
    services = [
        ("add_chore", handle_add_chore, ADD_CHORE_SCHEMA),
        ("mark_done", handle_mark_done, MARK_DONE_SCHEMA),
        ("update_description", handle_update_description, UPDATE_DESCRIPTION_SCHEMA),
        ("reset_chore", handle_reset_chore, RESET_CHORE_SCHEMA),
        ("delete_chore", handle_delete_chore, DELETE_CHORE_SCHEMA),
        ("force_due", handle_force_due, FORCE_DUE_SCHEMA),
        ("complete_subtask", handle_complete_subtask, vol.Schema({
            vol.Required("subtask_id"): vol.Coerce(int),
            vol.Required("person"): str
        })),
        ("add_subtask", handle_add_subtask, vol.Schema({
            vol.Required("chore_id"): str,
            vol.Required("name"): str,
            vol.Optional("position", default=0): vol.Coerce(int)
        })),
        ("delete_subtask", handle_delete_subtask, vol.Schema({
            vol.Required("subtask_id"): vol.Coerce(int)
        }))
    ]
    
    for service_name, handler, schema in services:
        hass.services.async_register(
            DOMAIN, service_name, handler, schema=schema
        )
    
    _LOGGER.info("Registered %d chore services", len(services))


async def _handle_force_due_notification(
    hass: HomeAssistant,
    database_path: str,
    result: Dict[str, Any],
    custom_message: str = None
) -> None:
    """Handle notification for force_due service."""
    from ..database import get_ha_user_id_for_assignee
    from ..utils import send_user_summary_notification, async_check_due_notifications
    
    chore_name = result.get("chore_name", result.get("chore_id"))
    assigned_to = result.get("assigned_to")
    
    if custom_message:
        # Send custom message directly
        ha_user_id = await hass.async_add_executor_job(
            get_ha_user_id_for_assignee, database_path, assigned_to
        )
        
        if ha_user_id:
            await send_user_summary_notification(
                hass, ha_user_id, "Taak toegevoegd", custom_message
            )
    else:
        # Check if auto-notify is enabled
        if result.get("has_auto_notify"):
            # Run standard notification check
            await async_check_due_notifications(hass, database_path)
        else:
            # Send simple notification
            ha_user_id = await hass.async_add_executor_job(
                get_ha_user_id_for_assignee, database_path, assigned_to
            )
            
            if ha_user_id:
                await send_user_summary_notification(
                    hass, ha_user_id,
                    "Taak op planning",
                    f"Taak '{chore_name}' staat op de planning voor vandaag"
                )
