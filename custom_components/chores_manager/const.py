"""Constants for the Chores Manager integration."""
from homeassistant.const import Platform

DOMAIN = "chores_manager"
PLATFORMS = [Platform.SENSOR]

# Attribute names
ATTR_CHORE_ID = "chore_id"
ATTR_NAME = "name"
ATTR_FREQUENCY_TYPE = "frequency_type"
ATTR_FREQUENCY_DAYS = "frequency_days"
ATTR_FREQUENCY_TIMES = "frequency_times"
ATTR_ASSIGNED_TO = "assigned_to"
ATTR_PRIORITY = "priority"
ATTR_DURATION = "duration"
ATTR_PERSON = "person"
ATTR_ICON = "icon"
ATTR_DESCRIPTION = "description"
ATTR_ALTERNATE_WITH = "alternate_with"
ATTR_USE_ALTERNATING = "use_alternating"
ATTR_START_MONTH = "startMonth"
ATTR_START_DAY = "startDay"
ATTR_WEEKDAY = "weekday"
ATTR_MONTHDAY = "monthday"
ATTR_USER_ID = "user_id"
ATTR_COLOR = "color"
ATTR_ACTIVE = "active"

# Frequency types
FREQ_TYPES = ["Dagelijks", "Wekelijks", "Meerdere keren per week", "Maandelijks", 
              "Meerdere keren per maand", "Per kwartaal", "Halfjaarlijks", "Jaarlijks"]

# Priority types
PRIORITY_TYPES = ["Hoog", "Middel", "Laag"]

# Assignee types
ASSIGNEE_TYPES = ["Martijn", "Laura", "Samen", "Wie kan"]

# Default values
DEFAULT_DB = "chores_manager.db"
DEFAULT_NOTIFICATION_TIME = "08:00"
