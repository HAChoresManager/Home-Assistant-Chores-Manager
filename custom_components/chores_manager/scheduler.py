"""De nachtelijke rol om 03:00 op de v2-database (§4.2, fase 2b).

Doet zelf geen berekeningen: per taak roept store.chores.roll_all_forward de
pure roll_forward uit scheduling/ aan. De dagelijkse en wekelijkse meldingen
uit §6 komen hier in fase 4 bij.
"""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .db.chores import roll_all_forward
from .const import SIGNAL_UPDATED

_LOGGER = logging.getLogger(__name__)


async def async_run_roll(hass: HomeAssistant, database_path: str) -> list:
    """Voer de rol nu uit; ook aangeroepen door de service v2_roll."""
    now = dt_util.now()
    changes = await hass.async_add_executor_job(
        roll_all_forward, database_path, now.date(), now.isoformat())
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
        await async_run_roll(hass, database_path)

    return async_track_time_change(hass, _nightly, hour=3, minute=0, second=0)
