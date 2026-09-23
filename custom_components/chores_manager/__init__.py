"""Chores Manager: huishoudelijke taken met een eigen panel op /taken.

Sinds fase 3c is dit de enige app. De opzet is klein gehouden:

- eigen SQLite-database (zie const.DB_FILENAME), alle toegang via db/;
- tien WS-commando's (websocket.py) met push via de dispatcher;
- één overzichtssensor (sensor.py), zonder polling;
- nachtelijke rol om 03:00 (scheduler.py);
- meldingen om 08:00 en zondag 20:00 plus de "Klaar"-knop (notify.py, fase 4);
- zes services: roll_forward en de twee meldingsservices als handmatige
  trigger, en mark_done, undo_last en revert_completion als dunne laag voor
  Lovelace-kaarten (die kunnen alleen services aanroepen); afvinken zelf
  loopt via notify.async_complete, terugdraaien binnen het venster via
  websocket.async_undo_last;
- het panel op /taken (panel.py), rechtstreeks geserveerd uit deze map.

De oude app (React-dashboard onder www/, eigen tokens, twintig services) is
op 28-07-2026 verwijderd; het terugvalpunt is de tag/branch v1-final.
"""
from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import (
    DATA_DB_PATH,
    DATA_UNDO,
    DATA_UNSUB_NOTIFY,
    DATA_UNSUB_ROLL,
    DATA_WS_REGISTERED,
    DB_FILENAME,
    DOMAIN,
    PLATFORMS,
    SIGNAL_UPDATED,
)
from .db.assignees import list_assignees
from .db.completions import revert_completion
from .db.schema import create_database
from .notify import (
    async_complete,
    async_send_daily,
    async_send_weekly,
    async_setup_notifications,
)
from .panel import async_remove_panel, async_setup_panel
from .scheduler import async_run_roll, async_setup_scheduler
from .websocket import async_register_websocket_commands, async_undo_last

_LOGGER = logging.getLogger(__name__)

MARK_DONE_SCHEMA = vol.Schema({
    vol.Required("chore_id"): cv.string,
    # null mag: tasks_today geeft assignee_id null bij 'anyone'-taken, en een
    # kaart die dat veld doorgeeft moet dan op de aanroeper terugvallen.
    vol.Optional("assignee_id"): vol.Any(None, cv.string),
})

REVERT_COMPLETION_SCHEMA = vol.Schema({
    # de number-selector levert een float (412.0); coerce maakt er een int van
    vol.Required("completion_id"): vol.All(vol.Coerce(int), vol.Range(min=1)),
})

SERVICES = ("roll_forward", "send_daily_summary", "send_weekly_summary",
            "mark_done", "undo_last", "revert_completion")


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

    async def handle_roll(call: ServiceCall) -> None:
        """De nachtelijke rol nu draaien, zonder op 03:00 te wachten."""
        await async_run_roll(hass, database_path)

    async def handle_send_daily(call: ServiceCall) -> None:
        """De ochtendmelding nu versturen, zonder op 08:00 te wachten."""
        verzonden = await async_send_daily(hass, database_path)
        _LOGGER.info("Chores Manager: send_daily_summary → %d meldingen", verzonden)

    async def handle_send_weekly(call: ServiceCall) -> None:
        """De weeksamenvatting nu versturen, zonder op zondag te wachten."""
        verzonden = await async_send_weekly(hass, database_path)
        _LOGGER.info("Chores Manager: send_weekly_summary → %d meldingen", verzonden)

    async def handle_mark_done(call: ServiceCall) -> None:
        """Taak afvinken vanaf een dashboard; zonder assignee_id op naam van
        de aanroepende HA-gebruiker (gekoppeld via ha_user_id).

        Dunne laag zonder eigen logica: afvinken loopt via
        notify.async_complete, dus met dezelfde undo-buffer en dezelfde push
        als het panel en de "Klaar"-knop. Een fout wordt een
        ServiceValidationError, zodat HA een toast toont en er niets
        stilletjes misgaat.
        """
        chore_id = call.data["chore_id"].strip()
        # weggelaten, null, leeg of alleen spaties: allemaal "niet meegegeven"
        assignee_id = (call.data.get("assignee_id") or "").strip()
        if not assignee_id:
            user_id = call.context.user_id
            if not user_id:
                # automation of script zonder gebruiker: er ís geen aanroeper
                raise ServiceValidationError(
                    "Deze aanroep heeft geen HA-gebruiker (automatisering?); "
                    "geef assignee_id mee.")
            assignees = await hass.async_add_executor_job(
                list_assignees, database_path)
            match = next(
                (a for a in assignees if a.get("ha_user_id") == user_id), None)
            if match is None:
                raise ServiceValidationError(
                    "Deze HA-gebruiker is aan geen persoon gekoppeld; "
                    "geef assignee_id mee of kies wie het gedaan heeft.")
            assignee_id = match["id"]
        try:
            await async_complete(hass, database_path, chore_id, assignee_id)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        _LOGGER.info("Chores Manager: %s afgevinkt via mark_done door %s",
                     chore_id, assignee_id)

    async def handle_undo_last(call: ServiceCall) -> None:
        """Laatste voltooiing exact terugdraaien, binnen vijf minuten.

        Dunne laag om dezelfde async_undo_last als het WS-commando
        chores_manager/undo: zelfde buffer, zelfde venster, zelfde signaal.
        Niets (meer) om terug te draaien geeft een ServiceValidationError.
        """
        chore_id = await async_undo_last(hass)
        _LOGGER.info("Chores Manager: %s teruggedraaid via undo_last", chore_id)

    async def handle_revert_completion(call: ServiceCall) -> None:
        """Een eerdere voltooiing weghalen, ook buiten het undo-venster
        ("toch niet gedaan"); het id komt uit recent_completions.

        Wijst de undo-buffer naar dezelfde regel, dan vervalt hij: anders
        zou undo_last daarna de toestand van vóór het afvinken terugzetten
        over het terugdraaien heen.
        """
        completion_id = call.data["completion_id"]
        try:
            result = await hass.async_add_executor_job(
                revert_completion, database_path, completion_id,
                dt_util.now().date())
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        buffered = domain_data.get(DATA_UNDO)
        if buffered and buffered["undo"]["row_id"] == completion_id:
            domain_data[DATA_UNDO] = None
        async_dispatcher_send(hass, SIGNAL_UPDATED,
                              {"reason": "revert", "chore_id": result["chore_id"]})
        _LOGGER.info("Chores Manager: voltooiing %d (%s) teruggedraaid via "
                     "revert_completion", completion_id, result["chore_id"])

    hass.services.async_register(DOMAIN, "roll_forward", handle_roll)
    hass.services.async_register(DOMAIN, "send_daily_summary", handle_send_daily)
    hass.services.async_register(DOMAIN, "send_weekly_summary", handle_send_weekly)
    hass.services.async_register(
        DOMAIN, "mark_done", handle_mark_done, schema=MARK_DONE_SCHEMA)
    hass.services.async_register(DOMAIN, "undo_last", handle_undo_last)
    hass.services.async_register(
        DOMAIN, "revert_completion", handle_revert_completion,
        schema=REVERT_COMPLETION_SCHEMA)

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

    for service in SERVICES:
        if hass.services.has_service(DOMAIN, service):
            hass.services.async_remove(DOMAIN, service)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        _LOGGER.info("Chores Manager: ontladen")
    return unload_ok
