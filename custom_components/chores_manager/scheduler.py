"""De nachtelijke rol om 03:00 op de v2-database (§4.2, fase 2b).

Doet zelf geen berekeningen: per taak roept db.chores.roll_all_forward de
pure roll_forward uit scheduling/ aan. De meldingen van §6 staan sinds fase 4
los hiervan in notify.py.

Sinds v2.6 beëindigt de rol eerst een verlopen vakantie (until vóór
vandaag; db.vacations.end_due_vacation), zodat hij op de dag na de vakantie
gewoon weer draait. Tijdens een vakantie doet de rol zelf niets
(roll_all_forward geeft dan []). Dezelfde controle draait bij het opstarten
(__init__.py): HA kan op de bewuste nacht uit hebben gestaan.
"""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .db.chores import roll_all_forward
from .db.vacations import end_due_vacation
from .const import SIGNAL_UPDATED

_LOGGER = logging.getLogger(__name__)


async def async_check_vacation_end(hass: HomeAssistant, database_path: str) -> bool:
    """Beëindig een verlopen vakantie (resume = de dag na until). Geeft True
    als er een vakantie beëindigd is.

    Gedeeld door de rol en het opstarten. Een fout wordt gelogd en nooit
    opgeworpen: een mislukt einde mag de rol en de setup niet tegenhouden —
    de volgende nacht of herstart probeert het opnieuw.
    """
    now = dt_util.now()
    try:
        ended = await hass.async_add_executor_job(
            end_due_vacation, database_path, now.date(), now.isoformat())
    except Exception:  # noqa: BLE001 — zie docstring
        _LOGGER.exception("Chores Manager: automatisch einde van de vakantie mislukt")
        return False
    if ended is None:
        return False
    _LOGGER.info("Chores Manager: vakantie automatisch beëindigd (tot en met %s, "
                 "%d dagen), verschoven: %s",
                 ended["until"], ended["days"], ended["changes"])
    async_dispatcher_send(hass, SIGNAL_UPDATED, {
        "reason": "vacation", "active": False, "changed": len(ended["changes"])})
    return True


async def async_run_roll(hass: HomeAssistant, database_path: str) -> list:
    """Voer de rol nu uit; ook aangeroepen door de service roll_forward en,
    na een automatisch vakantie-einde, bij het opstarten.

    Eerst een verlopen vakantie beëindigen (async_check_vacation_end, met
    een eigen foutafhandeling), dan de rol. Mislukt de rol, dan staat de
    traceback in de log en komt er een HomeAssistantError: de service toont
    die als melding, de nachtjob slikt hem (al gelogd).
    """
    await async_check_vacation_end(hass, database_path)
    now = dt_util.now()
    try:
        changes = await hass.async_add_executor_job(
            roll_all_forward, database_path, now.date(), now.isoformat())
    except Exception as err:
        _LOGGER.exception("Chores Manager: nachtelijke rol mislukt")
        raise HomeAssistantError(
            "De rol is niet gelukt; de details staan in de log.") from err
    if changes:
        _LOGGER.info("Chores Manager: nachtelijke rol verschoof %d taken: %s",
                     len(changes), changes)
    else:
        _LOGGER.debug("Chores Manager: nachtelijke rol, niets te verschuiven")
    async_dispatcher_send(hass, SIGNAL_UPDATED,
                          {"reason": "roll", "changed": len(changes)})
    return changes


def async_setup_scheduler(hass: HomeAssistant, database_path: str):
    """Plan de rol dagelijks om 03:00 lokale tijd. Geeft de unsubscribe terug."""
    async def _nightly(now) -> None:
        try:
            await async_run_roll(hass, database_path)
        except HomeAssistantError:
            pass  # al gelogd in async_run_roll

    return async_track_time_change(hass, _nightly, hour=3, minute=0, second=0)
