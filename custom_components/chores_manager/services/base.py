"""Base utilities for service handlers."""
import logging
from functools import wraps
from typing import Any, Callable, Dict

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.dispatcher import async_dispatcher_send

from ..const import DOMAIN

_LOGGER = logging.getLogger(__name__)


def service_error_handler(func: Callable) -> Callable:
    """Decorator to handle service errors consistently."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except ValueError as err:
            _LOGGER.warning("Invalid input for %s: %s", func.__name__, err)
            return {"success": False, "error": str(err)}
        except Exception as err:
            _LOGGER.error("Error in %s: %s", func.__name__, err, exc_info=True)
            return {"success": False, "error": f"Unexpected error: {str(err)}"}
    return wrapper


def notify_state_change(hass: HomeAssistant) -> None:
    """Send notification that state has changed."""
    async_dispatcher_send(hass, f"{DOMAIN}_updated")


def validate_required_fields(data: Dict[str, Any], required: list) -> None:
    """Validate required fields are present."""
    missing = [field for field in required if field not in data or data[field] is None]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")


def log_service_call(service_name: str, data: Dict[str, Any]) -> None:
    """Log service call for debugging."""
    # Remove sensitive data before logging
    safe_data = {k: v for k, v in data.items() if k not in ['password', 'token']}
    _LOGGER.debug("Service call %s with data: %s", service_name, safe_data)


class ServiceResponse:
    """Standardized service response builder."""
    
    @staticmethod
    def success(data: Dict[str, Any] = None, message: str = None) -> Dict[str, Any]:
        """Create a success response."""
        response = {"success": True}
        if data:
            response.update(data)
        if message:
            response["message"] = message
        return response
    
    @staticmethod
    def error(error: str, code: str = None) -> Dict[str, Any]:
        """Create an error response."""
        response = {"success": False, "error": error}
        if code:
            response["error_code"] = code
        return response
    
    @staticmethod
    def from_db_result(result: Dict[str, Any]) -> Dict[str, Any]:
        """Convert database result to service response."""
        if result.get("success", True):
            return ServiceResponse.success(result)
        else:
            return ServiceResponse.error(
                result.get("error", "Unknown error"),
                result.get("error_code")
            )
