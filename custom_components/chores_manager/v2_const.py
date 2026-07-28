"""Constanten voor het v2-deel (fase 2b).

TIJDELIJK apart van const.py: dat bestand hoort bij de oude app en blijft
tijdens 2b onaangeraakt. In fase 3 gaan deze constanten op in const.py.
"""

# Eigen database naast chores_manager.db; de oude blijft onaangeroerd (B1).
V2_DB_FILENAME = "chores_v2.db"

# Dispatchersignaal na elke mutatie: sensor en WS-abonnees verversen hierop.
SIGNAL_V2_UPDATED = "chores_manager_v2_updated"

# Undo-venster (§2.3): laatste voltooiing terugdraaien binnen 5 minuten.
UNDO_WINDOW_SECONDS = 300

# Sleutels in hass.data[DOMAIN]
DATA_V2_PATH = "v2_database_path"
DATA_V2_UNDO = "v2_undo"
DATA_V2_WS_REGISTERED = "v2_ws_registered"
DATA_V2_UNSUB_ROLL = "v2_unsub_roll"
