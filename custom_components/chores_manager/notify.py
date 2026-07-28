"""Meldingen (§6, fase 4): ochtendoverzicht, weeksamenvatting en "Klaar".

Alleen naar personen met een ingevulde notify_service én meldingen aan
(notifications_enabled); wie niets ingevuld heeft, krijgt niets en houdt de
log stil. De teksten volgen de toon van het panel: actief, Nederlands, geen
verwijt — daarom noemt de ochtendmelding wat er vandaag speelt met namen, en
nooit het kale totaal.

Volgorde-afhankelijkheid: de scheduler rolt om 03:00 de vervaldata door
(§4.2); de ochtendmelding van 08:00 leest daarna gewoon de actuele staat.
Het zijn twee losse taken zonder koppeling — maar verzet de meldingstijd
nooit tot vóór de rol, anders meldt hij de staat van gisteren.

De "Klaar"-knop is het minst gebaande pad. De companion-app toont de knop
uit data.actions en vuurt bij het tikken een event
``mobile_app_notification_action`` met daarin onze action-string. Taak en
ontvanger zitten in die string gecodeerd:
``chores_manager_complete:<chore_id>:<assignee_id>`` (ids zijn slugs zonder
dubbele punt). De listener hieronder vangt het event, vinkt af via dezelfde
db-functie als het panel, vult dezelfde undo-buffer en stuurt hetzelfde
dispatchersignaal — het panel ziet het dus direct (push) en de minuten staan
op naam van de ontvanger van de melding.
"""
from __future__ import annotations

import logging
import time

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .const import (
    DATA_UNDO,
    DOMAIN,
    MORNING_HOUR,
    MORNING_MINUTE,
    NOTIFY_ACTION_PREFIX,
    SIGNAL_UPDATED,
    WEEKLY_DAY,
    WEEKLY_HOUR,
    WEEKLY_MINUTE,
)
from .db.assignees import list_assignees
from .db.completions import assignee_streaks, complete_chore, leaderboard
from .db.overview import notification_summary, pick_notify_action

_LOGGER = logging.getLogger(__name__)

MOBILE_APP_ACTION_EVENT = "mobile_app_notification_action"


def _duur(minutes: int) -> str:
    """Zelfde vorm als het panel (format.js): "20m", "1u", "1u 20m"."""
    total = max(0, round(minutes))
    hours, rest = divmod(total, 60)
    if hours == 0:
        return f"{rest}m"
    if rest == 0:
        return f"{hours}u"
    return f"{hours}u {rest}m"


def _opsomming(namen: list[str]) -> str:
    """"A", "A en B", "A, B en C"."""
    if len(namen) <= 1:
        return "".join(namen)
    return f"{', '.join(namen[:-1])} en {namen[-1]}"


def _notify_target(notify_service: str) -> str | None:
    """"notify.mobile_app_x" → "mobile_app_x"; kale servicenaam mag ook."""
    if not notify_service:
        return None
    if notify_service.startswith("notify."):
        return notify_service.split(".", 1)[1] or None
    return notify_service


def _daily_payload(entry: dict) -> dict | None:
    """Bouw de ochtendmelding voor één persoon; None als er niets speelt."""
    due, overdue = entry["due"], entry["overdue"]
    if not due and not overdue:
        return None

    kop = []
    if due:
        kop.append(f"{len(due)} voor vandaag")
    if overdue:
        kop.append("1 loopt achter" if len(overdue) == 1
                   else f"{len(overdue)} lopen achter")
    regels = []
    if due:
        regels.append(f"Vandaag: {_opsomming([c['name'] for c in due])}.")
    if overdue:
        regels.append(f"Achterstand: {_opsomming([c['name'] for c in overdue])}.")

    payload = {
        "title": ", ".join(kop),
        "message": " ".join(regels),
        "data": {
            # vervangt de melding van gisteren in plaats van te stapelen
            "tag": "chores_manager_daily",
        },
    }
    actie = pick_notify_action(due, overdue)
    if actie:
        payload["data"]["actions"] = [{
            "action": (f"{NOTIFY_ACTION_PREFIX}:{actie['id']}"
                       f":{entry['assignee']['id']}"),
            "title": "Klaar",
        }]
    return payload


def _weekly_message(board: dict, streaks: dict) -> str:
    """De eindstand: samen eerst, dan de verdeling. Feiten, geen ranglijsttaal."""
    if not board["total_minutes"]:
        return ("Deze week is er niets afgevinkt. "
                "Maandag begint de teller opnieuw.")
    regels = [f"Samen {_duur(board['total_minutes'])} dit huishouden "
              "draaiende gehouden."]
    for person in board["persons"]:
        if not person["tasks"]:
            continue
        taken = "1 taak" if person["tasks"] == 1 else f"{person['tasks']} taken"
        regel = f"{person['name']}: {_duur(person['minutes'])} · {taken}"
        streak = streaks.get(person["id"], 0)
        if streak >= 2:
            regel += f" · {streak} weken op rij"
        regels.append(regel)
    return "\n".join(regels)


async def _send(hass: HomeAssistant, notify_service: str, payload: dict) -> None:
    target = _notify_target(notify_service)
    if not target:
        return
    await hass.services.async_call("notify", target, payload, blocking=False)


def _wil_meldingen(persoon: dict) -> bool:
    """Alleen wie een service heeft én meldingen aan (§6: per persoon)."""
    return bool(persoon.get("notify_service")
                and persoon.get("notifications_enabled", 1))


async def async_send_daily(hass: HomeAssistant, database_path: str) -> int:
    """Ochtendmelding per persoon; alleen als er voor die persoon iets is.

    Geeft het aantal verzonden meldingen terug (handig voor de logregel van
    de tijdelijke testservice).
    """
    today = dt_util.now().date()
    summary = await hass.async_add_executor_job(
        notification_summary, database_path, today)
    verzonden = 0
    for entry in summary.values():
        persoon = entry["assignee"]
        if not _wil_meldingen(persoon):
            continue
        payload = _daily_payload(entry)
        if not payload:
            continue
        await _send(hass, persoon["notify_service"], payload)
        verzonden += 1
    if verzonden:
        _LOGGER.info("Chores Manager: ochtendmelding naar %d personen", verzonden)
    return verzonden


async def async_send_weekly(hass: HomeAssistant, database_path: str) -> int:
    """Weeksamenvatting naar iedereen met een service; de feiten van de week."""
    today = dt_util.now().date()
    board = await hass.async_add_executor_job(leaderboard, database_path, today)
    streaks = await hass.async_add_executor_job(
        assignee_streaks, database_path, today)
    assignees = await hass.async_add_executor_job(list_assignees, database_path)
    message = _weekly_message(board, streaks)
    verzonden = 0
    for persoon in filter(_wil_meldingen, assignees):
        await _send(hass, persoon["notify_service"], {
            "title": "De week in het huishouden",
            "message": message,
            "data": {"tag": "chores_manager_weekly"},
        })
        verzonden += 1
    if verzonden:
        _LOGGER.info("Chores Manager: weeksamenvatting naar %d personen", verzonden)
    return verzonden


async def _async_complete_from_action(
    hass: HomeAssistant, database_path: str, chore_id: str, assignee_id: str,
) -> None:
    """Afvinken zoals het panel het doet: zelfde db-functie, zelfde
    undo-buffer, zelfde signaal."""
    now = dt_util.now()
    try:
        undo = await hass.async_add_executor_job(
            complete_chore, database_path, chore_id, assignee_id,
            now.date(), now.isoformat(), None, None)
    except ValueError as err:
        _LOGGER.warning(
            "Chores Manager: afvinken via melding mislukt (%s door %s): %s",
            chore_id, assignee_id, err)
        return
    hass.data[DOMAIN][DATA_UNDO] = {"undo": undo, "at": time.monotonic()}
    async_dispatcher_send(hass, SIGNAL_UPDATED,
                          {"reason": "complete", "chore_id": chore_id})
    _LOGGER.info("Chores Manager: %s afgevinkt via melding door %s",
                 chore_id, assignee_id)


@callback
def async_setup_notifications(hass: HomeAssistant, database_path: str):
    """Zet de twee tijdstippen en de action-listener op; geeft één
    opruimfunctie terug."""

    async def _morgen(now) -> None:
        await async_send_daily(hass, database_path)

    async def _zondagavond(now) -> None:
        # async_track_time_change kent geen weekdag; zelf filteren.
        if dt_util.now().weekday() == WEEKLY_DAY:
            await async_send_weekly(hass, database_path)

    async def _on_action(event: Event) -> None:
        action = event.data.get("action")
        if not isinstance(action, str) or not action.startswith(
                f"{NOTIFY_ACTION_PREFIX}:"):
            return
        parts = action.split(":")
        if len(parts) != 3:
            _LOGGER.warning("Chores Manager: onleesbare action-string: %s", action)
            return
        await _async_complete_from_action(hass, database_path, parts[1], parts[2])

    unsubs = [
        async_track_time_change(
            hass, _morgen, hour=MORNING_HOUR, minute=MORNING_MINUTE, second=0),
        async_track_time_change(
            hass, _zondagavond, hour=WEEKLY_HOUR, minute=WEEKLY_MINUTE, second=0),
        hass.bus.async_listen(MOBILE_APP_ACTION_EVENT, _on_action),
    ]

    @callback
    def _unsub_all() -> None:
        for unsub in unsubs:
            unsub()

    return _unsub_all
