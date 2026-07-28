"""De negen WS-commando's uit §2.3 (fase 2b).

Authenticatie is de standaard van websocket_api: elke ingelogde gebruiker mag
ze aanroepen, geen admin vereist — Laura en Noud moeten kunnen afvinken. Alle
databasewerk loopt via de executor; de handlers zelf raken de database nooit
rechtstreeks aan.

Na elke mutatie gaat SIGNAL_V2_UPDATED over de dispatcher: de v2-sensor
ververst zichzelf en abonnees van chores_manager/subscribe krijgen een event.
Abonnees halen daarna zelf de verse staat op met chores_manager/state — de
events dragen alleen de reden, geen payload.
"""
from __future__ import annotations

import logging
import time

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .store.chores import delete_chore, get_chore, save_chore, snooze_chore
from .store.assignees import delete_assignee, save_assignee
from .store.completions import complete_chore, undo_completion
from .store.overview import build_state
from .v2_const import DATA_V2_PATH, DATA_V2_UNDO, SIGNAL_V2_UPDATED, UNDO_WINDOW_SECONDS

_LOGGER = logging.getLogger(__name__)


def _path(hass: HomeAssistant) -> str:
    return hass.data[DOMAIN][DATA_V2_PATH]


@callback
def _notify(hass: HomeAssistant, reason: str, **extra) -> None:
    async_dispatcher_send(hass, SIGNAL_V2_UPDATED, {"reason": reason, **extra})


@websocket_api.websocket_command({vol.Required("type"): "chores_manager/state"})
@websocket_api.async_response
async def ws_state(hass, connection, msg):
    """Volledige begintoestand: taken, personen, ranglijst, feed."""
    today = dt_util.now().date()
    state = await hass.async_add_executor_job(build_state, _path(hass), today)
    connection.send_result(msg["id"], state)


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/complete",
    vol.Required("chore_id"): str,
    vol.Required("assignee_id"): str,
    vol.Optional("subtask_id"): int,
    vol.Optional("note"): str,
})
@websocket_api.async_response
async def ws_complete(hass, connection, msg):
    """Taak, deeltaak of counter-tik afvinken."""
    now = dt_util.now()
    try:
        undo = await hass.async_add_executor_job(
            complete_chore, _path(hass), msg["chore_id"], msg["assignee_id"],
            now.date(), now.isoformat(), msg.get("subtask_id"), msg.get("note"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    hass.data[DOMAIN][DATA_V2_UNDO] = {"undo": undo, "at": time.monotonic()}
    _notify(hass, "complete", chore_id=msg["chore_id"])
    connection.send_result(msg["id"], {
        "chore_id": msg["chore_id"],
        "was_full": undo["was_full"],
        "next_due": undo["new_next_due"],
        "undo_available": True,
    })


@websocket_api.websocket_command({vol.Required("type"): "chores_manager/undo"})
@websocket_api.async_response
async def ws_undo(hass, connection, msg):
    """Laatste voltooiing terugdraaien, binnen vijf minuten (§2.3).

    De buffer leeft in het geheugen; na een herstart van HA is er niets meer
    om terug te draaien. Dat past bij een venster van vijf minuten.
    """
    buffered = hass.data[DOMAIN].get(DATA_V2_UNDO)
    if not buffered or time.monotonic() - buffered["at"] > UNDO_WINDOW_SECONDS:
        connection.send_error(msg["id"], "nothing_to_undo",
                              "geen voltooiing om terug te draaien (venster is 5 minuten)")
        return
    await hass.async_add_executor_job(
        undo_completion, _path(hass), buffered["undo"])
    hass.data[DOMAIN][DATA_V2_UNDO] = None
    _notify(hass, "undo", chore_id=buffered["undo"]["chore_id"])
    connection.send_result(msg["id"], {"chore_id": buffered["undo"]["chore_id"]})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/chore/save",
    vol.Required("chore"): dict,
})
@websocket_api.async_response
async def ws_chore_save(hass, connection, msg):
    """Taak aanmaken of bijwerken; validatie zit in de store-laag."""
    now = dt_util.now()
    try:
        chore = await hass.async_add_executor_job(
            save_chore, _path(hass), msg["chore"], now.date(), now.isoformat())
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    _notify(hass, "chore_save", chore_id=chore["id"])
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/chore/delete",
    vol.Required("chore_id"): str,
})
@websocket_api.async_response
async def ws_chore_delete(hass, connection, msg):
    """Taak verwijderen; met historie wordt hij gedeactiveerd."""
    result = await hass.async_add_executor_job(
        delete_chore, _path(hass), msg["chore_id"])
    _notify(hass, "chore_delete", chore_id=msg["chore_id"])
    connection.send_result(msg["id"], {"chore_id": msg["chore_id"], "result": result})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/chore/snooze",
    vol.Required("chore_id"): str,
    vol.Required("mode"): vol.In(["tomorrow", "skip"]),
})
@websocket_api.async_response
async def ws_chore_snooze(hass, connection, msg):
    """Naar morgen ('tomorrow') of naar de volgende geplande keer ('skip')."""
    now = dt_util.now()
    try:
        new_due = await hass.async_add_executor_job(
            snooze_chore, _path(hass), msg["chore_id"], msg["mode"],
            now.date(), now.isoformat())
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    _notify(hass, "snooze", chore_id=msg["chore_id"])
    connection.send_result(msg["id"], {
        "chore_id": msg["chore_id"], "next_due": new_due.isoformat()})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/assignee/save",
    vol.Required("assignee"): dict,
})
@websocket_api.async_response
async def ws_assignee_save(hass, connection, msg):
    """Persoon aanmaken of bijwerken."""
    try:
        assignee = await hass.async_add_executor_job(
            save_assignee, _path(hass), msg["assignee"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_input", str(err))
        return
    _notify(hass, "assignee_save", assignee_id=assignee["id"])
    connection.send_result(msg["id"], {"assignee": assignee})


@websocket_api.websocket_command({
    vol.Required("type"): "chores_manager/assignee/delete",
    vol.Required("assignee_id"): str,
})
@websocket_api.async_response
async def ws_assignee_delete(hass, connection, msg):
    """Persoon verwijderen; met historie of taken wordt hij gedeactiveerd."""
    result = await hass.async_add_executor_job(
        delete_assignee, _path(hass), msg["assignee_id"])
    _notify(hass, "assignee_delete", assignee_id=msg["assignee_id"])
    connection.send_result(msg["id"], {
        "assignee_id": msg["assignee_id"], "result": result})


@websocket_api.websocket_command({vol.Required("type"): "chores_manager/subscribe"})
@websocket_api.async_response
async def ws_subscribe(hass, connection, msg):
    """Abonneren op wijzigingen: elk SIGNAL_V2_UPDATED wordt een event."""
    @callback
    def _forward(payload: dict) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, SIGNAL_V2_UPDATED, _forward)
    connection.send_result(msg["id"])


COMMANDS = (
    ws_state, ws_complete, ws_undo,
    ws_chore_save, ws_chore_delete, ws_chore_snooze,
    ws_assignee_save, ws_assignee_delete, ws_subscribe,
)


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Registreer de negen commando's. Eén keer per HA-run aanroepen."""
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command)
    _LOGGER.info("Chores v2: %d WS-commando's geregistreerd", len(COMMANDS))
