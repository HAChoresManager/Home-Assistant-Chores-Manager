"""Chores Manager: huishoudelijke taken met een eigen panel op /taken.

Sinds fase 3c is dit de enige app. De opzet is klein gehouden:

- eigen SQLite-database (zie const.DB_FILENAME), alle toegang via db/;
- negen WS-commando's (websocket.py) met push via de dispatcher;
- één overzichtssensor (sensor.py), zonder polling;
- nachtelijke rol om 03:00 (scheduler.py);
- meldingen om 08:00 en zondag 20:00 plus de "Klaar"-knop (notify.py, fase 4);
- het panel op /taken (panel.py), rechtstreeks geserveerd uit deze map.

De oude app (React-dashboard onder www/, eigen tokens, twintig services) is
op 28-07-2026 verwijderd; het terugvalpunt is de tag/branch v1-final.
"""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import (
    DATA_DB_PATH,
    DATA_UNSUB_NOTIFY,
    DATA_UNSUB_ROLL,
    DATA_WS_REGISTERED,
    DB_FILENAME,
    DOMAIN,
    PLATFORMS,
    SIGNAL_UPDATED,
)
from .db.schema import create_database
from .notify import async_send_daily, async_send_weekly, async_setup_notifications
from .panel import async_remove_panel, async_setup_panel
from .scheduler import async_run_roll, async_setup_scheduler
from .seed import seed_v2
from .websocket import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Zet de integratie op vanuit de config entry."""
    database_path = hass.config.path(DB_FILENAME)
    await hass.async_add_executor_job(create_database, database_path)
    _LOGGER.info("Chores Manager: database klaar op %s", database_path)

    hass.data.setdefault(DOMAIN, {})
    domain_data = hass.data[DOMAIN]
    domain_data[DATA_DB_PATH] = database_path
    domain_data.setdefault(entry.entry_id, {})
    domain_data[entry.entry_id][DATA_DB_PATH] = database_path

    # WS-commando's zijn globaal; één keer per HA-run registreren.
    if not domain_data.get(DATA_WS_REGISTERED):
        async_register_websocket_commands(hass)
        domain_data[DATA_WS_REGISTERED] = True

    # nachtelijke rol om 03:00
    domain_data[entry.entry_id][DATA_UNSUB_ROLL] = async_setup_scheduler(
        hass, database_path)

    # meldingen (fase 4): 08:00, zondag 20:00 en de "Klaar"-knop
    domain_data[entry.entry_id][DATA_UNSUB_NOTIFY] = async_setup_notifications(
        hass, database_path)

    await async_setup_panel(hass)

    async def handle_seed(call: ServiceCall) -> None:
        """TIJDELIJK (fase 5 verwijdert dit): de acht legacy-taken seeden."""
        now = dt_util.now()
        summary = await hass.async_add_executor_job(
            seed_v2, database_path, now.date(), now.isoformat())
        _LOGGER.info("Chores Manager: seed klaar: %s", summary)
        async_dispatcher_send(hass, SIGNAL_UPDATED, {"reason": "seed"})

    async def handle_roll(call: ServiceCall) -> None:
        """De nachtelijke rol nu draaien, zonder op 03:00 te wachten."""
        await async_run_roll(hass, database_path)

    async def handle_send_daily(call: ServiceCall) -> None:
        """TIJDELIJK (net als seed): de ochtendmelding nu versturen."""
        verzonden = await async_send_daily(hass, database_path)
        _LOGGER.info("Chores Manager: send_daily_summary → %d meldingen", verzonden)

    async def handle_send_weekly(call: ServiceCall) -> None:
        """TIJDELIJK (net als seed): de weeksamenvatting nu versturen."""
        verzonden = await async_send_weekly(hass, database_path)
        _LOGGER.info("Chores Manager: send_weekly_summary → %d meldingen", verzonden)

    hass.services.async_register(DOMAIN, "seed", handle_seed)
    hass.services.async_register(DOMAIN, "roll_forward", handle_roll)
    hass.services.async_register(DOMAIN, "send_daily_summary", handle_send_daily)
    hass.services.async_register(DOMAIN, "send_weekly_summary", handle_send_weekly)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _LOGGER.info("Chores Manager: setup compleet")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Ruim alle registraties op bij het ontladen van de config entry."""
    async_remove_panel(hass)

    entry_data = hass.data.get(DOMAIN, {}).get(entry.entry_id, {})
    for key in (DATA_UNSUB_ROLL, DATA_UNSUB_NOTIFY):
        unsub = entry_data.pop(key, None)
        if unsub:
            unsub()

    for service in ("seed", "roll_forward",
                    "send_daily_summary", "send_weekly_summary"):
        if hass.services.has_service(DOMAIN, service):
            hass.services.async_remove(DOMAIN, service)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        _LOGGER.info("Chores Manager: ontladen")
    return unload_ok
