"""Opzet van het v2-deel (fase 2b): database, WS-commando's, scheduler en de
tijdelijke services.

Eén aanroep vanuit __init__.py; alles wat v2 registreert zit hier bij elkaar,
zodat de oude app er niets van merkt en fase 3 dit in één beweging kan
integreren. Fouten hier zijn niet fataal voor de oude app — de aanroeper
vangt ze en laat de setup doorlopen.
"""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .scheduler import async_run_roll, async_setup_scheduler
from .seed import seed_v2
from .store.schema import create_database
from .v2_const import (
    DATA_V2_PATH,
    DATA_V2_UNSUB_ROLL,
    DATA_V2_WS_REGISTERED,
    SIGNAL_V2_UPDATED,
    V2_DB_FILENAME,
)
from .websocket import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)


async def async_setup_v2(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Zet het v2-deel op, volledig naast de bestaande app."""
    database_path = hass.config.path(V2_DB_FILENAME)
    await hass.async_add_executor_job(create_database, database_path)
    _LOGGER.info("Chores v2: database klaar op %s", database_path)

    domain_data = hass.data[DOMAIN]
    domain_data[DATA_V2_PATH] = database_path
    domain_data[entry.entry_id][DATA_V2_PATH] = database_path

    # WS-commando's zijn globaal; één keer per HA-run registreren
    if not domain_data.get(DATA_V2_WS_REGISTERED):
        async_register_websocket_commands(hass)
        domain_data[DATA_V2_WS_REGISTERED] = True

    # nachtelijke rol om 03:00
    domain_data[entry.entry_id][DATA_V2_UNSUB_ROLL] = async_setup_scheduler(
        hass, database_path)

    # nieuw panel op /taken (fase 3a); de oude app blijft op
    # /dashboard-chores/taken draaien tot fase 3c
    from .panel_v2 import async_setup_panel_v2
    await async_setup_panel_v2(hass)

    async def handle_seed(call: ServiceCall) -> None:
        """TIJDELIJK (fase 5 verwijdert dit): de acht legacy-taken seeden."""
        now = dt_util.now()
        summary = await hass.async_add_executor_job(
            seed_v2, database_path, now.date(), now.isoformat())
        _LOGGER.info("Chores v2: seed klaar: %s", summary)
        async_dispatcher_send(hass, SIGNAL_V2_UPDATED, {"reason": "seed"})

    async def handle_roll(call: ServiceCall) -> None:
        """De nachtelijke rol nu draaien, zonder op 03:00 te wachten."""
        await async_run_roll(hass, database_path)

    hass.services.async_register(DOMAIN, "v2_seed", handle_seed)
    hass.services.async_register(DOMAIN, "v2_roll", handle_roll)
    _LOGGER.info("Chores v2: setup compleet (naast de bestaande app)")


async def async_unload_v2(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Ruim de v2-registraties op bij het ontladen van de config entry."""
    from .panel_v2 import async_remove_panel_v2
    async_remove_panel_v2(hass)
    entry_data = hass.data.get(DOMAIN, {}).get(entry.entry_id, {})
    unsub = entry_data.pop(DATA_V2_UNSUB_ROLL, None)
    if unsub:
        unsub()
    for service in ("v2_seed", "v2_roll"):
        if hass.services.has_service(DOMAIN, service):
            hass.services.async_remove(DOMAIN, service)
