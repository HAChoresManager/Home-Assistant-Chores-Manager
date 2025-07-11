"""
Service handlers for Chores Manager.

This file acts as a compatibility layer for the old service structure
while using the new modular service handlers.
"""
import logging
from typing import Dict, Any

from homeassistant.core import HomeAssistant

from .services import async_register_services as register_services_new

_LOGGER = logging.getLogger(__name__)

# Re-export the main registration function
async_register_services = register_services_new

# For backwards compatibility, expose service handler references
# (though they shouldn't be used directly anymore)
__all__ = ['async_register_services']
