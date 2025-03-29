"""Schemas for Chores Manager."""
import voluptuous as vol
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN, ATTR_CHORE_ID, ATTR_NAME, ATTR_FREQUENCY_TYPE, ATTR_FREQUENCY_DAYS,
    ATTR_FREQUENCY_TIMES, ATTR_ASSIGNED_TO, ATTR_PRIORITY, ATTR_DURATION,
    ATTR_PERSON, ATTR_ICON, ATTR_DESCRIPTION, ATTR_ALTERNATE_WITH,
    ATTR_USE_ALTERNATING, ATTR_START_MONTH, ATTR_START_DAY, ATTR_WEEKDAY,
    ATTR_MONTHDAY, ATTR_USER_ID, ATTR_COLOR, ATTR_ACTIVE, DEFAULT_DB, DEFAULT_NOTIFICATION_TIME
)

CONFIG_SCHEMA = vol.Schema({
    DOMAIN: vol.Schema({
        vol.Optional("database", default=DEFAULT_DB): cv.string,
        vol.Optional("notification_time", default=DEFAULT_NOTIFICATION_TIME): cv.time,
    })
}, extra=vol.ALLOW_EXTRA)

ADD_CHORE_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Optional(ATTR_NAME): cv.string,
    vol.Optional(ATTR_FREQUENCY_TYPE): str,  # Accept any string to be more permissive
    vol.Optional(ATTR_FREQUENCY_DAYS): vol.Coerce(int),  # Coerce to int
    vol.Optional(ATTR_FREQUENCY_TIMES): vol.Coerce(int),  # Coerce to int
    vol.Optional(ATTR_ASSIGNED_TO): str,  # Accept any string
    vol.Optional(ATTR_PRIORITY): str,  # Accept any string
    vol.Optional(ATTR_DURATION): vol.Coerce(int),  # Coerce to int
    vol.Optional(ATTR_ICON): cv.string,
    vol.Optional(ATTR_DESCRIPTION): cv.string,
    vol.Optional(ATTR_ALTERNATE_WITH): cv.string,
    vol.Optional(ATTR_USE_ALTERNATING): vol.Any(bool, vol.Coerce(bool)),  # Handle boolean or string
    vol.Optional(ATTR_START_MONTH): vol.Coerce(int),  # For quarterly and semi-annual tasks
    vol.Optional(ATTR_START_DAY): vol.Coerce(int),    # For quarterly and semi-annual tasks
    vol.Optional(ATTR_WEEKDAY): vol.Coerce(int),      # For weekly tasks (0=Monday, 6=Sunday)
    vol.Optional(ATTR_MONTHDAY): vol.Coerce(int),     # For monthly tasks (1-31)
    vol.Optional("notify_when_due"): vol.Any(bool, vol.Coerce(bool)),  # Notification option
}, extra=vol.ALLOW_EXTRA)  # Allow any extra fields to pass through

MARK_DONE_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Required(ATTR_PERSON): cv.string,
})

UPDATE_DESCRIPTION_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Required(ATTR_DESCRIPTION): cv.string,
})

RESET_CHORE_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
})

ADD_USER_SCHEMA = vol.Schema({
    vol.Required("id"): cv.string,
    vol.Required("name"): cv.string,
    vol.Optional("color", default="#CCCCCC"): cv.string,
    vol.Optional("active", default=True): vol.Any(bool, vol.Coerce(bool)),
    vol.Optional("ha_user_id"): cv.string,  # Home Assistant user ID
})

DELETE_USER_SCHEMA = vol.Schema({
    vol.Required("user_id"): cv.string,
})

FORCE_DUE_SCHEMA = vol.Schema({
    vol.Required(ATTR_CHORE_ID): cv.string,
    vol.Optional("notify", default=False): vol.Any(bool, vol.Coerce(bool)),
    vol.Optional("message"): cv.string,
})
