"""De vakantiemodus in de HA-laag (v2.6): drie kernen en drie WS-commando's.

De kernen async_start_vacation, async_update_vacation en async_end_vacation
zijn gedeeld door het panel (de WS-commando's hieronder), de services
start_vacation en end_vacation (__init__.py) en de schakelaar
switch.chores_vakantiemodus (switch.py), zodat ze precies hetzelfde doen.
De WS-commando's chores_manager/vacation/start, /update en /end staan in
VACATION_COMMANDS; websocket.py registreert ze samen met de rest
(achttien in totaal, sinds de afwezigheid van v2.7 in absence.py). Ze
staan los van websocket.py om die onder de 600 regels te houden.

Zelfde regels als in websocket.py: elke ingelogde gebruiker mag ze
aanroepen, alle databasewerk via de executor, na elke wijziging
SIGNAL_UPDATED (reden "vacation"), en een StoreError uit de datalaag wordt
in WS "invalid_input" met de Nederlandse tekst. De services en de
schakelaar maken er een ServiceValidationError van.

Strikt of niet: het panel (WS) is strikt — aanzetten terwijl hij al aan
staat of uitzetten terwijl hij uit staat is een fout, want dan liep het
panel achter. Services en schakelaar zijn idempotent (strict=False), zodat
een automatisering niet botst met iemand die het net in het panel deed.
"""
from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import DATA_DB_PATH, DATA_UNDO, DOMAIN, SIGNAL_UPDATED
from .db.vacations import (
    end_vacation,
    get_active_vacation,
    start_vacation,
    update_vacation,
)

_LOGGER = logging.getLogger(__name__)


def _path(hass: HomeAssistant) -> str:
    return hass.data[DOMAIN][DATA_DB_PATH]


@callback
def _notify(hass: HomeAssistant, **extra) -> None:
    async_dispatcher_send(hass, SIGNAL_UPDATED, {"reason": "vacation", **extra})


async def async_start_vacation(
    hass: HomeAssistant, until, strict: bool = True,
) -> dict:
    """Vakantiemodus aan vanaf vandaag, tot en met `until` (date, ISO-string,
    of None voor een open einde). Geeft de publieke vorm {active,
    start_date, until} terug.

    Leegt de undo-buffer: een voltooiing of overslag van vóór de vakantie
    terugdraaien zou de momentopname van het aanzetten ondergraven, en
    tijdens de vakantie kan de buffer niet opnieuw vullen.

    strict (WS, het panel): al aan is een StoreError. Niet strict
    (services, schakelaar): idempotent — al aan, dan wordt een meegegeven
    until de nieuwe laatste dag en gebeurt er zonder until niets. "Al aan"
    wordt ná de weigering opnieuw gelezen (ook gelijktijdig aanzetten loopt
    zo goed af); een echte weigering (until verleden) blijft een StoreError.
    """
    path = _path(hass)
    now = dt_util.now()
    try:
        vacation = await hass.async_add_executor_job(
            start_vacation, path, now.date(), until, now.isoformat())
    except ValueError:
        if strict:
            raise
        active = await hass.async_add_executor_job(get_active_vacation, path)
        if active is None:
            raise
        if until is None:
            _LOGGER.info("Chores Manager: vakantiemodus stond al aan")
            return active
        return await async_update_vacation(hass, until)
    hass.data[DOMAIN][DATA_UNDO] = None
    _LOGGER.info("Chores Manager: vakantiemodus aan (tot en met %s)",
                 vacation["until"] or "open einde")
    _notify(hass, active=True)
    return vacation


async def async_update_vacation(hass: HomeAssistant, until) -> dict:
    """De laatste vakantiedag wijzigen of (None) wissen; geeft de publieke
    vorm. Geen vakantie aan, of until vóór vandaag: een StoreError."""
    vacation = await hass.async_add_executor_job(
        update_vacation, _path(hass), until, dt_util.now().date())
    _notify(hass, active=True)
    return vacation


async def async_end_vacation(hass: HomeAssistant, strict: bool = True) -> dict | None:
    """Vakantiemodus uit, met vandaag als dag van terugkomst; de taken
    schuiven op (vacations.end_vacation). Geeft {start_date, until,
    ended_on, days, changes} terug. Staat er geen vakantie aan: strict (WS)
    een StoreError, niet strict (services, schakelaar) niets en None.
    """
    path = _path(hass)
    now = dt_util.now()
    try:
        result = await hass.async_add_executor_job(
            end_vacation, path, now.date(), now.isoformat())
    except ValueError:
        if strict:
            raise
        if await hass.async_add_executor_job(get_active_vacation, path) is not None:
            raise
        _LOGGER.info("Chores Manager: vakantiemodus stond al uit")
        return None
    _LOGGER.info("Chores Manager: vakantiemodus uit na %d dagen, verschoven: %s",
                 result["days"], result["changes"])
    _notify(hass, active=False, changed=len(result["changes"]))
    return result


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/vacation/start",
    vol.Optional("until"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_vacation_start(hass, connection, msg):
    """Vakantiemodus aan (strikt: al aan is een fout); zie async_start_vacation."""
    try:
        vacation = await async_start_vacation(hass, msg.get("until"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    connection.send_result(msg["id"], {"vacation": vacation})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/vacation/update",
    vol.Required("until"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_vacation_update(hass, connection, msg):
    """De "tot en met" van de lopende vakantie wijzigen; null wist hem."""
    try:
        vacation = await async_update_vacation(hass, msg["until"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    connection.send_result(msg["id"], {"vacation": vacation})


@websocket_api.websocket_command({vol.Required("type"): "chores_manager/vacation/end"})
@websocket_api.async_response
async def ws_vacation_end(hass, connection, msg):
    """Vakantiemodus uit (strikt). changed is het aantal verschoven taken."""
    try:
        result = await async_end_vacation(hass)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    connection.send_result(msg["id"], {
        "ended_on": result["ended_on"],
        "days": result["days"],
        "changed": len(result["changes"]),
    })


# geregistreerd door websocket.async_register_websocket_commands
VACATION_COMMANDS = (ws_vacation_start, ws_vacation_update, ws_vacation_end)
