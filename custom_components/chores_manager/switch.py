"""De vakantieschakelaar switch.chores_vakantiemodus (v2.6) en per actieve
persoon een afwezigheidsschakelaar switch.chores_afwezig_<id> (v2.7).

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
modus uit staat. Die lezingen lopen één tegelijk, achter een lock, zodat
een oudere lezing nooit over een nieuwere heen schrijft (dezelfde race als
in sensor.py).

Afwezigheid (v2.7): per actieve persoon een schakelaar "Chores Afwezig
<Naam>" met entity_id switch.chores_afwezig_<assignee_id> en een unique_id
op het assignee-id (niet op de naam: hernoemen laat de entiteit staan).
Aan = afwezig vanaf vandaag zonder einddatum, uit = terug vandaag; een
einddatum kiezen kan in het panel of met chores_manager.start_absence.
Dezelfde idempotente kernen als de services (absence.py). Attributen
start_date en until (None als de persoon er is).

AbsenceSwitches houdt de verzameling bij: na ELK SIGNAL_UPDATED leest hij
personen en afwezigheden één keer uit de database, werkt elke schakelaar
bij, voegt er een toe voor een nieuwe persoon en ruimt die van een
gearchiveerde of verwijderde persoon op — ook in het entiteitenregister,
inclusief achtergebleven registraties van eerdere runs. Net als de
vakantieschakelaar leest een afwezigheidsschakelaar na turn_on/turn_off
zijn eigen stand meteen opnieuw, vóórdat de serviceaanroep terugkeert.
"""
from __future__ import annotations

import asyncio
import logging

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import slugify

from .absence import async_end_absence, async_start_absence
from .const import DATA_DB_PATH, DOMAIN, SIGNAL_UPDATED
from .db.absences import get_active_absence, list_absences
from .db.assignees import list_assignees
from .db.vacations import get_active_vacation
from .vacation import async_end_vacation, async_start_vacation

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Zet de vakantieschakelaar en de afwezigheidsschakelaars op."""
    database_path = hass.data[DOMAIN][entry.entry_id].get(DATA_DB_PATH)
    if not database_path:
        _LOGGER.error("Chores Manager: geen databasepad, schakelaar overgeslagen")
        return
    async_add_entities(
        [ChoresVacationSwitch(database_path, entry.entry_id)], update_before_add=True)

    absence_switches = AbsenceSwitches(
        hass, entry.entry_id, database_path, async_add_entities)
    await absence_switches.async_sync()
    entry.async_on_unload(async_dispatcher_connect(
        hass, SIGNAL_UPDATED, absence_switches.handle_update))


async def _call(kern, refresh, onderwerp: str, actie: str) -> None:
    """Een kern afwachten en elke fout omzetten naar iets dat HA netjes
    toont: een weigering uit de datalaag als ServiceValidationError met de
    Nederlandse tekst, al het andere als HomeAssistantError (met de
    traceback in de log).

    Na de kern — ook na een weigering — leest de schakelaar zijn staat
    meteen zelf opnieuw (refresh) en schrijft hem weg, vóórdat de
    serviceaanroep terugkeert. Op het signaal wachten is te laat: een script
    dat direct na switch.turn_on de staat controleert, of een toggle vlak
    erna, zou anders nog de oude staat zien."""
    try:
        await kern
    except ValueError as err:
        await refresh()
        raise ServiceValidationError(str(err)) from err
    except HomeAssistantError:
        await refresh()
        raise
    except Exception as err:
        _LOGGER.exception("Chores Manager: %s %s mislukt", onderwerp.lower(), actie)
        await refresh()
        raise HomeAssistantError(
            f"{onderwerp} {actie} is niet gelukt; de details staan in de log."
        ) from err
    await refresh()


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
        # één lezing tegelijk, zie _refresh
        self._refresh_lock = asyncio.Lock()

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
        """Stand lezen en wegschrijven, één verversing tegelijk. Zonder lock
        kon een lezing die vóór een wijziging begon, ná een verse lezing
        wegschrijven, en sprong de schakelaar terug naar de oude stand. Ook
        de lezing direct na turn_on/turn_off wacht zo op zijn beurt."""
        async with self._refresh_lock:
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
        await _call(async_start_vacation(self.hass, None, strict=False),
                    self._write_refresh, "Vakantiemodus", "aanzetten")

    async def async_turn_off(self, **kwargs) -> None:
        """Vakantiemodus uit; de taken schuiven op met de vakantie."""
        await _call(async_end_vacation(self.hass, strict=False),
                    self._write_refresh, "Vakantiemodus", "uitzetten")

    async def _write_refresh(self) -> None:
        await self._refresh(write=True)


def _absence_unique_id(entry_id: str, assignee_id: str) -> str:
    return f"chores_manager_absence_{entry_id}_{assignee_id}"


def _read_persons(database_path: str) -> tuple[list, dict]:
    """Actieve personen en hun lopende afwezigheid, in één executor-taak."""
    absences = {a["assignee_id"]: a for a in list_absences(database_path)}
    return list_assignees(database_path), absences


class AbsenceSwitches:
    """Eén afwezigheidsschakelaar per actieve persoon, bijgehouden op elk
    SIGNAL_UPDATED (zie de moduledocstring).

    Eén lock voor alle lezingen, ook die van een schakelaar na turn_on/off:
    elke lezing begint pas als de vorige geschreven is. Zonder lock kon een
    nieuwe persoon twee schakelaars krijgen, en kon een lezing die vóór een
    wijziging begon ná een verse lezing wegschrijven — dan sprong de
    schakelaar terug naar de oude stand."""

    def __init__(self, hass: HomeAssistant, entry_id: str, database_path: str,
                 async_add_entities: AddEntitiesCallback) -> None:
        self._hass = hass
        self._entry_id = entry_id
        self._database_path = database_path
        self._add = async_add_entities
        self._switches: dict[str, ChoresAbsenceSwitch] = {}
        self._lock = asyncio.Lock()

    @callback
    def handle_update(self, payload=None) -> None:
        # elk signaal: een nieuwe of gearchiveerde persoon, een afwezigheid
        # via panel of service, het automatische einde — goedkoop genoeg
        self._hass.async_create_task(self.async_sync())

    async def async_sync(self) -> None:
        async with self._lock:
            try:
                persons, absences = await self._hass.async_add_executor_job(
                    _read_persons, self._database_path)
            except Exception as err:  # de dispatcherketen mag nooit breken
                _LOGGER.error("Chores Manager: afwezigheidsschakelaars bijwerken "
                              "mislukt: %s", err)
                return
            active_ids = {person["id"] for person in persons}
            new = []
            for person in persons:
                switch = self._switches.get(person["id"])
                if switch is None:
                    switch = ChoresAbsenceSwitch(
                        self._database_path, self._entry_id, person,
                        absences.get(person["id"]), self._lock)
                    self._switches[person["id"]] = switch
                    new.append(switch)
                else:
                    switch.apply(person, absences.get(person["id"]))
            if new:
                self._add(new)
            gone = [self._switches.pop(assignee_id)
                    for assignee_id in list(self._switches)
                    if assignee_id not in active_ids]
            self._prune_registry(active_ids)
            for switch in gone:
                # zonder registerregel (zou niet moeten) zelf weghalen; met
                # registerregel deed _prune_registry dat al
                if switch.hass is not None and switch.registry_entry is None:
                    await switch.async_remove(force_remove=True)

    @callback
    def _prune_registry(self, active_ids: set) -> None:
        """Registerregels van schakelaars voor wie niet (meer) actief is weg.
        Het register haalt een geladen entiteit dan zelf uit HA."""
        registry = er.async_get(self._hass)
        prefix = _absence_unique_id(self._entry_id, "")
        for entry in er.async_entries_for_config_entry(registry, self._entry_id):
            if (entry.domain == "switch" and entry.unique_id.startswith(prefix)
                    and entry.unique_id[len(prefix):] not in active_ids):
                _LOGGER.info("Chores Manager: afwezigheidsschakelaar %s opgeruimd",
                             entry.entity_id)
                registry.async_remove(entry.entity_id)


class ChoresAbsenceSwitch(SwitchEntity):
    """is_on = deze persoon is afwezig; attributen start_date en until."""

    _attr_should_poll = False

    def __init__(self, database_path: str, entry_id: str, person: dict,
                 absence: dict | None, lock: asyncio.Lock) -> None:
        self._database_path = database_path
        self._assignee_id = person["id"]
        # de lock van AbsenceSwitches: lezen en schrijven op volgorde
        self._lock = lock
        self._attr_unique_id = _absence_unique_id(entry_id, person["id"])
        # vast entity_id op het assignee-id; zonder has_entity_name zou HA
        # het uit de weergavenaam afleiden, en die mag wijzigen
        self.entity_id = f"switch.chores_afwezig_{slugify(person['id'])}"
        self._set(person, absence)

    def _set(self, person: dict | None, absence: dict | None) -> None:
        if person is not None:
            self._attr_name = f"Chores Afwezig {person['name']}"
        self._attr_is_on = absence is not None
        self._attr_icon = "mdi:account-off" if absence else "mdi:account"
        self._attr_extra_state_attributes = {
            "start_date": absence["start_date"] if absence else None,
            "until": absence["until"] if absence else None,
        }

    @callback
    def apply(self, person: dict, absence: dict | None) -> None:
        """Nieuwe stand uit AbsenceSwitches; alleen schrijven als hij al in
        HA staat (een net toegevoegde schakelaar schrijft zichzelf)."""
        self._set(person, absence)
        if self.hass is not None:
            self.async_write_ha_state()

    async def _refresh(self) -> None:
        async with self._lock:
            try:
                absence = await self.hass.async_add_executor_job(
                    get_active_absence, self._database_path, self._assignee_id)
            except Exception as err:  # de serviceaanroep mag hier niet op breken
                _LOGGER.error("Chores Manager: schakelaarupdate mislukt: %s", err)
                return
            self._set(None, absence)
            self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        """Afwezig vanaf vandaag, zonder einddatum."""
        await _call(async_start_absence(
            self.hass, self._assignee_id, None, strict=False),
            self._refresh, "Afwezigheid", "aanzetten")

    async def async_turn_off(self, **kwargs) -> None:
        """Terug vandaag: de afwezigheid eindigt."""
        await _call(async_end_absence(self.hass, self._assignee_id, strict=False),
                    self._refresh, "Afwezigheid", "uitzetten")
