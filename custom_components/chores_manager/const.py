"""Constanten voor Chores Manager.

Sinds fase 3c is er één app; de constanten van de oude app (ATTR_*,
FREQ_TYPES, PRIORITY_TYPES enzovoort) zijn met die app verdwenen.
"""
from homeassistant.const import Platform

DOMAIN = "chores_manager"
PLATFORMS = [Platform.SENSOR]

# De bestandsnaam stamt uit fase 2b, toen v2 naast de oude app draaide.
# Hernoemen zou de bestaande data wegzetten, dus hij blijft chores_v2.db.
DB_FILENAME = "chores_v2.db"

# Dispatchersignaal na elke mutatie: sensor en WS-abonnees verversen hierop.
SIGNAL_UPDATED = "chores_manager_updated"

# Undo-venster (§2.3): laatste voltooiing terugdraaien binnen 5 minuten.
UNDO_WINDOW_SECONDS = 300

# Meldingstijden (§6). Vast in fase 4; fase 5 kan ze instelbaar maken.
# Volgorde-afhankelijkheid: de rol van 03:00 (scheduler.py) draait vóór de
# ochtendmelding — die leest gewoon de dan actuele staat, maar zet je de
# melding ooit vóór de rol, dan meldt hij gisteren.
MORNING_HOUR = 8
MORNING_MINUTE = 0
WEEKLY_DAY = 6  # maandag = 0, dus 6 = zondag
WEEKLY_HOUR = 20
WEEKLY_MINUTE = 0

# Prefix van de action-string achter de "Klaar"-knop (notify.py):
# "<prefix>:<chore_id>:<assignee_id>". Ids zijn slugs zonder dubbele punt.
NOTIFY_ACTION_PREFIX = "chores_manager_complete"

# Sleutels in hass.data[DOMAIN]
DATA_DB_PATH = "db_path"
DATA_UNDO = "undo"
DATA_WS_REGISTERED = "ws_registered"
DATA_UNSUB_ROLL = "unsub_roll"
DATA_UNSUB_NOTIFY = "unsub_notify"
