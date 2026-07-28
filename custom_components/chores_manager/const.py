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

# Sleutels in hass.data[DOMAIN]
DATA_DB_PATH = "db_path"
DATA_UNDO = "undo"
DATA_WS_REGISTERED = "ws_registered"
DATA_UNSUB_ROLL = "unsub_roll"
