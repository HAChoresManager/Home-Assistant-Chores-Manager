"""De overzichtssensor (§2.4).

Geen polling: should_poll staat uit en updates komen via de dispatcher
(SIGNAL_UPDATED) na elke mutatie of rol — push in plaats van de
30-secondenpoll van de oude sensor (§2.3-besluit).

Het unique_id is dat van de oude sensor. Daardoor neemt deze entiteit in het
entiteitenregister automatisch de plek — en dus de naam sensor.chores_overview
— van zijn voorganger over. Het register-item van de tussentijdse v2-sensor
(sensor.chores_v2_overview, unique_id chores_manager_v2_<entry>) blijft als
wees achter en kan handmatig verwijderd worden.

De persons-attributen tonen iedereen die deze week iets deed, mét een
in_leaderboard-vlag per persoon. Filteren is presentatie: een Lovelace-kaart
die alleen de ranglijst wil, filtert zelf op die vlag — de sensor verzwijgt
geen bijdragen.

tasks_today en recent_completions dragen ids, zodat een Lovelace-kaart met
één tik chores_manager.mark_done respectievelijk
chores_manager.revert_completion kan aanroepen.

Net-afgevinkte taken staan RECENT_DONE_SECONDS lang als "done" in
tasks_today. Omdat er dan geen mutatie (en dus geen SIGNAL_UPDATED) volgt,
plant de sensor na elke update zelf één verversing voor het moment dat de
oudste done-rij verloopt.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .const import DATA_DB_PATH, DOMAIN, RECENT_DONE_SECONDS, SIGNAL_UPDATED
from .db.overview import overview

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Zet de overzichtssensor op."""
    database_path = hass.data[DOMAIN][entry.entry_id].get(DATA_DB_PATH)
    if not database_path:
        _LOGGER.error("Chores Manager: geen databasepad, sensor overgeslagen")
        return
    async_add_entities([ChoresOverviewSensor(database_path, entry.entry_id)], True)


class ChoresOverviewSensor(SensorEntity):
    """state = aantal openstaande taken vandaag; attributen conform §2.4."""

    _attr_should_poll = False
    _attr_name = "Chores Overview"
    _attr_icon = "mdi:clipboard-check-outline"
    _attr_native_unit_of_measurement = "taken"

    def __init__(self, database_path: str, entry_id: str) -> None:
        self._database_path = database_path
        # het unique_id van de oude sensor — zie de moduledocstring
        self._attr_unique_id = f"chores_manager_{entry_id}"
        # annuleerfunctie van de geplande verversing (done-rijen), of None
        self._unsub_done_refresh = None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(
            self.hass, SIGNAL_UPDATED, self._handle_update))
        self.async_on_remove(self._cancel_done_refresh)

    @callback
    def _cancel_done_refresh(self) -> None:
        if self._unsub_done_refresh is not None:
            self._unsub_done_refresh()
            self._unsub_done_refresh = None

    @callback
    def _schedule_done_refresh(self, tasks_today: list[dict]) -> None:
        """Eén verversing plannen voor als de oudste done-rij verloopt
        (+1 s, zodat hij er dan zeker uit is). Een eerder geplande vervalt."""
        self._cancel_done_refresh()
        done_at = [datetime.fromisoformat(t["completed_at"])
                   for t in tasks_today if t["status"] == "done"]
        if not done_at:
            return
        expires = min(done_at) + timedelta(seconds=RECENT_DONE_SECONDS + 1)
        delay = max(1.0, (expires - dt_util.now()).total_seconds())
        self._unsub_done_refresh = async_call_later(
            self.hass, delay, self._handle_done_refresh)

    @callback
    def _handle_done_refresh(self, _now) -> None:
        self._unsub_done_refresh = None
        self.hass.async_create_task(self._refresh(write=True))

    @callback
    def _handle_update(self, payload=None) -> None:
        self.hass.async_create_task(self._refresh(write=True))

    async def async_update(self) -> None:
        # alleen de eerste keer, via update_before_add; daarna is het push
        await self._refresh(write=False)

    async def _refresh(self, write: bool) -> None:
        try:
            now = dt_util.now()
            data = await self.hass.async_add_executor_job(
                overview, self._database_path, now.date(), now,
                RECENT_DONE_SECONDS)
        except Exception as err:  # sensor mag de dispatcherketen nooit breken
            _LOGGER.error("Chores Manager: sensorupdate mislukt: %s", err)
            return
        self._attr_native_value = data["open_today"]
        self._attr_extra_state_attributes = {
            "due_today": data["due_today"],
            "overdue": data["overdue"],
            "completed_today": data["completed_today"],
            "week_minutes_total": data["week_minutes_total"],
            "persons": data["persons"],
            # compacte weergavelijst voor Lovelace-kaarten (fase 5, stap B);
            # net afgevinkte taken staan er twee minuten in als "done"
            "tasks_today": data["tasks_today"],
            # laatste acht voltooiingen, voor revert_completion vanaf een kaart
            "recent_completions": data["recent_completions"],
        }
        self._schedule_done_refresh(data["tasks_today"])
        if write:
            self.async_write_ha_state()
