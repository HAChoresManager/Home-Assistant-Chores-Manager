"""De v2-overzichtssensor (§2.4), naast de oude sensor (fase 2b).

TIJDELIJK een eigen module: sensor.py hoort bij de oude app en krijgt alleen
een minimale aanroep hierheen. In fase 3 vervangt dit de oude sensor en gaat
de inhoud op in een herschreven sensor.py.

Geen polling: should_poll staat uit en updates komen via de dispatcher
(SIGNAL_V2_UPDATED) na elke mutatie, rol of seed. Precies het §2.3-besluit:
push in plaats van de 30-secondenpoll van de oude sensor.
"""
from __future__ import annotations

import logging

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .store.overview import overview
from .v2_const import DATA_V2_PATH, SIGNAL_V2_UPDATED

_LOGGER = logging.getLogger(__name__)


async def async_add_v2_sensor(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Voeg de v2-sensor toe; aangeroepen vanuit sensor.py."""
    database_path = hass.data[DOMAIN][entry.entry_id].get(DATA_V2_PATH)
    if not database_path:
        _LOGGER.warning("Chores v2: geen databasepad, v2-sensor overgeslagen")
        return
    async_add_entities([ChoresV2OverviewSensor(database_path, entry.entry_id)], True)


class ChoresV2OverviewSensor(SensorEntity):
    """state = aantal openstaande taken vandaag; attributen conform §2.4."""

    _attr_should_poll = False
    _attr_name = "Chores v2 Overview"
    _attr_icon = "mdi:clipboard-check-outline"
    _attr_native_unit_of_measurement = "taken"

    def __init__(self, database_path: str, entry_id: str) -> None:
        self._database_path = database_path
        self._attr_unique_id = f"chores_manager_v2_{entry_id}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(
            self.hass, SIGNAL_V2_UPDATED, self._handle_update))

    @callback
    def _handle_update(self, payload=None) -> None:
        self.hass.async_create_task(self._refresh(write=True))

    async def async_update(self) -> None:
        # alleen de eerste keer, via update_before_add; daarna is het push
        await self._refresh(write=False)

    async def _refresh(self, write: bool) -> None:
        try:
            data = await self.hass.async_add_executor_job(
                overview, self._database_path, dt_util.now().date())
        except Exception as err:  # sensor mag de dispatcherketen nooit breken
            _LOGGER.error("Chores v2: sensorupdate mislukt: %s", err)
            return
        self._attr_native_value = data["open_today"]
        self._attr_extra_state_attributes = {
            "due_today": data["due_today"],
            "overdue": data["overdue"],
            "completed_today": data["completed_today"],
            "week_minutes_total": data["week_minutes_total"],
            "persons": data["persons"],
        }
        if write:
            self.async_write_ha_state()
