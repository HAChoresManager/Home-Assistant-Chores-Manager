"""De vakantieschakelaar switch.chores_vakantiemodus (v2.6).

Aan = de vakantiemodus start vandaag, zonder einddatum; uit = de vakantie
eindigt met vandaag als dag van terugkomst en de taken schuiven op. Een
einddatum kiezen kan in het panel (Beheer) of met de service
chores_manager.start_vacation; de schakelaar is er voor de eenvoudige
gevallen: een knop op een dashboard, een automatisering, een spraakopdracht.

Dezelfde kernen als panel en services (vacation.async_start_vacation en
async_end_vacation), niet strikt: aan op een schakelaar die al aan staat,
of uit op een die al uit staat, doet niets. Zo botst een automatisering
niet met iemand die het net in het panel deed.

Geen polling: de schakelaar leest de stand na ELK SIGNAL_UPDATED opnieuw
uit de database (in de executor, net als sensor.py), en volgt zo ook een
vakantie die via het panel, een service of het automatische einde om
03:00 aan- of uitging. De attributen start_date en until zijn None als de
modus uit staat.
"""
from __future__ import annotations

import logging

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DATA_DB_PATH, DOMAIN, SIGNAL_UPDATED
from .db.vacations import get_active_vacation
from .vacation import async_end_vacation, async_start_vacation

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Zet de vakantieschakelaar op."""
    database_path = hass.data[DOMAIN][entry.entry_id].get(DATA_DB_PATH)
    if not database_path:
        _LOGGER.error("Chores Manager: geen databasepad, schakelaar overgeslagen")
        return
    async_add_entities(
        [ChoresVacationSwitch(database_path, entry.entry_id)], update_before_add=True)


class ChoresVacationSwitch(SwitchEntity):
    """is_on = de vakantiemodus staat aan; attributen start_date en until."""

    _attr_should_poll = False
    # zonder has_entity_name wordt dit het entity_id switch.chores_vakantiemodus
    _attr_name = "Chores Vakantiemodus"
    _attr_icon = "mdi:palm-tree"

    def __init__(self, database_path: str, entry_id: str) -> None:
        self._database_path = database_path
        self._attr_unique_id = f"chores_manager_vacation_{entry_id}"
        self._attr_is_on = False
        self._attr_extra_state_attributes = {"start_date": None, "until": None}

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(
            self.hass, SIGNAL_UPDATED, self._handle_update))

    @callback
    def _handle_update(self, payload=None) -> None:
        # elk signaal, niet alleen reason "vacation": goedkoop, en zo mist
        # de schakelaar niets (ook niet het automatische einde)
        self.hass.async_create_task(self._refresh(write=True))

    async def async_update(self) -> None:
        # alleen de eerste keer, via update_before_add; daarna is het push
        await self._refresh(write=False)

    async def _refresh(self, write: bool) -> None:
        try:
            vacation = await self.hass.async_add_executor_job(
                get_active_vacation, self._database_path)
        except Exception as err:  # de dispatcherketen mag nooit breken
            _LOGGER.error("Chores Manager: schakelaarupdate mislukt: %s", err)
            return
        self._attr_is_on = vacation is not None
        self._attr_extra_state_attributes = {
            "start_date": vacation["start_date"] if vacation else None,
            "until": vacation["until"] if vacation else None,
        }
        if write:
            self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        """Vakantiemodus aan vanaf vandaag, zonder einddatum."""
        await self._call(async_start_vacation(self.hass, None, strict=False),
                         "aanzetten")

    async def async_turn_off(self, **kwargs) -> None:
        """Vakantiemodus uit; de taken schuiven op met de vakantie."""
        await self._call(async_end_vacation(self.hass, strict=False), "uitzetten")

    async def _call(self, kern, actie: str) -> None:
        """Een kern afwachten en elke fout omzetten naar iets dat HA netjes
        toont: een weigering uit de datalaag als ServiceValidationError met
        de Nederlandse tekst, al het andere als HomeAssistantError (met de
        traceback in de log).

        Na de kern — ook na een weigering — leest de schakelaar zijn staat
        meteen zelf opnieuw en schrijft hem weg, vóórdat de serviceaanroep
        terugkeert. Op het signaal wachten is te laat: een script dat direct
        na switch.turn_on de staat controleert, of een toggle vlak erna,
        zou anders nog de oude staat zien."""
        try:
            await kern
        except ValueError as err:
            await self._refresh(write=True)
            raise ServiceValidationError(str(err)) from err
        except HomeAssistantError:
            await self._refresh(write=True)
            raise
        except Exception as err:
            _LOGGER.exception("Chores Manager: vakantiemodus %s mislukt", actie)
            await self._refresh(write=True)
            raise HomeAssistantError(
                f"Vakantiemodus {actie} is niet gelukt; de details staan in de log."
            ) from err
        await self._refresh(write=True)
