"""Afwezigheid per persoon in de HA-laag (v2.7): drie kernen en drie WS-commando's.

De kernen async_start_absence, async_update_absence en async_end_absence
zijn gedeeld door het panel (de WS-commando's hieronder), de services
start_absence en end_absence (__init__.py) en de schakelaars
switch.chores_afwezig_<id> (switch.py), zodat ze precies hetzelfde doen.
De WS-commando's chores_manager/absence/start, /update en /end staan in
ABSENCE_COMMANDS; websocket.py registreert ze samen met de rest (achttien
in totaal). Ze staan hier, net als de vakantie in vacation.py, om
websocket.py onder de 600 regels te houden.

Zelfde regels als in vacation.py: elke ingelogde gebruiker mag ze
aanroepen, alle databasewerk via de executor, na elke wijziging
SIGNAL_UPDATED (reden "absence", met assignee_id), en een StoreError uit de
datalaag wordt in WS "invalid_input" met de Nederlandse tekst. De services
en de schakelaars maken er een ServiceValidationError van.

Strikt of niet: het panel (WS) is strikt — aanzetten terwijl iemand al weg
is of beëindigen terwijl hij er is, is een fout, want dan liep het panel
achter. Services en schakelaars zijn idempotent (strict=False). Daarvoor
herkennen ze alleen AlreadyAbsentError en NotAbsentError; een onbekende
persoon of een datum in het verleden blijft altijd een fout.

Anders dan de vakantie raakt een afwezigheid de undo-buffer niet: er wordt
niets aan taken of beurten geschreven, dus er valt niets te ondergraven.
"""
from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import DATA_DB_PATH, DOMAIN, SIGNAL_UPDATED
from .db.absences import (
    AlreadyAbsentError,
    NotAbsentError,
    end_absence,
    get_active_absence,
    start_absence,
    update_absence,
)

_LOGGER = logging.getLogger(__name__)


def _path(hass: HomeAssistant) -> str:
    return hass.data[DOMAIN][DATA_DB_PATH]


@callback
def _notify(hass: HomeAssistant, assignee_id: str, **extra) -> None:
    async_dispatcher_send(hass, SIGNAL_UPDATED, {
        "reason": "absence", "assignee_id": assignee_id, **extra})


async def async_start_absence(
    hass: HomeAssistant, assignee_id: str, until, strict: bool = True,
) -> dict | None:
    """Afwezigheid aan vanaf vandaag, tot en met `until` (date, ISO-string,
    of None voor een open einde). Geeft de publieke vorm {assignee_id,
    start_date, until} terug.

    strict (WS, het panel): al afwezig is een AlreadyAbsentError. Niet
    strict (services, schakelaar): idempotent — al afwezig, dan wordt een
    meegegeven until de nieuwe laatste dag en gebeurt er zonder until niets.
    """
    now = dt_util.now()
    try:
        absence = await hass.async_add_executor_job(
            start_absence, _path(hass), assignee_id, now.date(), until,
            now.isoformat())
    except AlreadyAbsentError:
        if strict:
            raise
        if until is None:
            _LOGGER.info("Chores Manager: %s was al afwezig", assignee_id)
            return await hass.async_add_executor_job(
                get_active_absence, _path(hass), assignee_id)
        return await async_update_absence(hass, assignee_id, until)
    _LOGGER.info("Chores Manager: %s afwezig (tot en met %s)",
                 assignee_id, absence["until"] or "open einde")
    _notify(hass, assignee_id, active=True)
    return absence


async def async_update_absence(hass: HomeAssistant, assignee_id: str, until) -> dict:
    """De laatste dag van een lopende afwezigheid wijzigen of (None)
    wissen; geeft de publieke vorm. Niet afwezig, of until vóór vandaag:
    een StoreError."""
    absence = await hass.async_add_executor_job(
        update_absence, _path(hass), assignee_id, until, dt_util.now().date())
    _notify(hass, assignee_id, active=True)
    return absence


async def async_end_absence(
    hass: HomeAssistant, assignee_id: str, strict: bool = True,
) -> dict | None:
    """Afwezigheid uit, met vandaag als dag van terugkomst. Geeft
    {assignee_id, start_date, until, ended_on, days} terug. Niet afwezig:
    strict (WS) een NotAbsentError, niet strict (services, schakelaar)
    niets en None."""
    try:
        result = await hass.async_add_executor_job(
            end_absence, _path(hass), assignee_id, dt_util.now().date())
    except NotAbsentError:
        if strict:
            raise
        _LOGGER.info("Chores Manager: %s was niet afwezig", assignee_id)
        return None
    _LOGGER.info("Chores Manager: %s weer terug na %d dagen",
                 assignee_id, result["days"])
    _notify(hass, assignee_id, active=False)
    return result


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/absence/start",
    vol.Required("assignee_id"): str,
    vol.Optional("until"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_absence_start(hass, connection, msg):
    """Afwezigheid aan (strikt: al afwezig is een fout); zie async_start_absence."""
    try:
        absence = await async_start_absence(hass, msg["assignee_id"], msg.get("until"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    connection.send_result(msg["id"], {"absence": absence})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/absence/update",
    vol.Required("assignee_id"): str,
    vol.Required("until"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_absence_update(hass, connection, msg):
    """De "tot en met" van een lopende afwezigheid wijzigen; null wist hem."""
    try:
        absence = await async_update_absence(hass, msg["assignee_id"], msg["until"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    connection.send_result(msg["id"], {"absence": absence})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/absence/end",
    vol.Required("assignee_id"): str,
})
@websocket_api.async_response
async def ws_absence_end(hass, connection, msg):
    """Afwezigheid uit (strikt); vandaag is de dag van terugkomst."""
    try:
        result = await async_end_absence(hass, msg["assignee_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    connection.send_result(msg["id"], {
        "assignee_id": result["assignee_id"],
        "ended_on": result["ended_on"],
        "days": result["days"],
    })


# geregistreerd door websocket.async_register_websocket_commands
ABSENCE_COMMANDS = (ws_absence_start, ws_absence_update, ws_absence_end)
