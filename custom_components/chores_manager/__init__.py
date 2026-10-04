"""Chores Manager: huishoudelijke taken met een eigen panel op /taken.

Sinds fase 3c is dit de enige app. De opzet is klein gehouden:

- eigen SQLite-database (zie const.DB_FILENAME), alle toegang via db/;
- achttien WS-commando's (websocket.py, de drie vakantiecommando's in
  vacation.py, de drie afwezigheidscommando's in absence.py) met push via
  de dispatcher;
- één overzichtssensor (sensor.py), zonder polling;
- de vakantieschakelaar switch.chores_vakantiemodus (switch.py, v2.6) en
  per actieve persoon een schakelaar switch.chores_afwezig_<id> (v2.7);
- nachtelijke rol om 03:00 (scheduler.py), die eerst een verlopen vakantie
  en verlopen afwezigheden beëindigt — dat gebeurt ook bij het opstarten,
  hieronder;
- meldingen om 08:00 en zondag 20:00 plus de "Klaar"-knop (notify.py, fase 4);
- twaalf services: roll_forward en de twee meldingsservices als handmatige
  trigger, mark_done, undo_last, revert_completion, skip en revert_skip
  als dunne laag voor Lovelace-kaarten (die kunnen alleen services
  aanroepen), en start_vacation, end_vacation, start_absence en
  end_absence voor automatiseringen (idempotent). Afvinken zelf loopt via
  notify.async_complete, overslaan via websocket.async_skip en
  websocket.async_revert_skip, terugdraaien binnen het venster via
  websocket.async_undo_last, de vakantie via vacation.async_start_vacation
  en async_end_vacation, de afwezigheid via absence.async_start_absence en
  async_end_absence — dezelfde kernen als het panel;
- het panel op /taken (panel.py), rechtstreeks geserveerd uit deze map.

De oude app (React-dashboard onder www/, eigen tokens, twintig services) is
op 28-07-2026 verwijderd; het terugvalpunt is de tag/branch v1-final.
"""
from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import (
    DATA_DB_PATH,
    DATA_UNDO,
    DATA_UNSUB_NOTIFY,
    DATA_UNSUB_ROLL,
    DATA_WS_REGISTERED,
    DB_FILENAME,
    DOMAIN,
    PLATFORMS,
    SIGNAL_UPDATED,
    UNDO_KIND_COMPLETION,
)
from .db.completions import revert_completion
from .db.schema import create_database
from .notify import (
    async_complete,
    async_send_daily,
    async_send_weekly,
    async_setup_notifications,
)
from .absence import async_end_absence, async_start_absence
from .panel import async_remove_panel, async_setup_panel
from .scheduler import (
    async_check_absence_end,
    async_check_vacation_end,
    async_run_roll,
    async_setup_scheduler,
)
from .vacation import async_end_vacation, async_start_vacation
from .websocket import (
    async_register_websocket_commands,
    async_revert_skip,
    async_skip,
    async_undo_last,
    resolve_caller,
)

_LOGGER = logging.getLogger(__name__)

MARK_DONE_SCHEMA = vol.Schema({
    vol.Required("chore_id"): cv.string,
    # null mag: tasks_today geeft assignee_id null bij 'anyone'-taken, en een
    # kaart die dat veld doorgeeft moet dan op de aanroeper terugvallen.
    vol.Optional("assignee_id"): vol.Any(None, cv.string),
})

REVERT_COMPLETION_SCHEMA = vol.Schema({
    # de number-selector levert een float (412.0); coerce maakt er een int van
    vol.Required("completion_id"): vol.All(vol.Coerce(int), vol.Range(min=1)),
})

SKIP_SCHEMA = vol.Schema({
    vol.Required("chore_id"): cv.string,
    # leeg of null = de aanroepende gebruiker, en anders "onbekend"
    vol.Optional("assignee_id"): vol.Any(None, cv.string),
})

REVERT_SKIP_SCHEMA = vol.Schema({
    # zelfde reden als bij completion_id: de number-selector levert een float;
    # bovengrens omdat sqlite geen grotere gehele getallen kent
    vol.Required("skip_id"): vol.All(
        vol.Coerce(int), vol.Range(min=1, max=2**63 - 1)),
})

def _optional_date(value):
    """Leeg, alleen spaties of null = geen datum (open einde), anders een
    datum. Een getemplatete automatisering levert voor "geen einddatum" vaak
    een lege string; die mag niet als schemafout de hele run afbreken."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return cv.date(value)


START_VACATION_SCHEMA = vol.Schema({
    # laatste vakantiedag (t/m); weggelaten, leeg of null = open einde
    vol.Optional("until"): _optional_date,
})

START_ABSENCE_SCHEMA = vol.Schema({
    vol.Required("assignee_id"): cv.string,
    # laatste dag van de afwezigheid (t/m); weggelaten, leeg of null = open einde
    vol.Optional("until"): _optional_date,
})

END_ABSENCE_SCHEMA = vol.Schema({vol.Required("assignee_id"): cv.string})

SERVICES = ("roll_forward", "send_daily_summary", "send_weekly_summary",
            "mark_done", "undo_last", "revert_completion",
            "skip", "revert_skip", "start_vacation", "end_vacation",
            "start_absence", "end_absence")


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Zet de integratie op vanuit de config entry."""
    database_path = hass.config.path(DB_FILENAME)
    await hass.async_add_executor_job(create_database, database_path)
    _LOGGER.info("Chores Manager: database klaar op %s", database_path)

    # HA kan uit hebben gestaan op de nacht dat de vakantie afliep. Een
    # mislukt einde wordt gelogd en houdt de setup niet tegen. Is er een
    # vakantie beëindigd, dan meteen de rol: anders staan kalendertaken tot
    # 03:00 op een achterstand die bij het einde al had moeten vervallen.
    if await async_check_vacation_end(hass, database_path):
        try:
            await async_run_roll(hass, database_path)
        except HomeAssistantError:
            pass  # al gelogd in async_run_roll; de nachtjob probeert het weer
    else:
        # Hetzelfde voor afwezigheden (v2.7; de rol hierboven doet dat al
        # zelf). Die verschuiven geen taken, dus geen rol nodig.
        await async_check_absence_end(hass, database_path)

    hass.data.setdefault(DOMAIN, {})
    domain_data = hass.data[DOMAIN]
    domain_data[DATA_DB_PATH] = database_path
    domain_data.setdefault(entry.entry_id, {})
    domain_data[entry.entry_id][DATA_DB_PATH] = database_path

    # WS-commando's zijn globaal; één keer per HA-run registreren.
    if not domain_data.get(DATA_WS_REGISTERED):
        async_register_websocket_commands(hass)
        domain_data[DATA_WS_REGISTERED] = True

    # nachtelijke rol om 03:00
    domain_data[entry.entry_id][DATA_UNSUB_ROLL] = async_setup_scheduler(
        hass, database_path)

    # meldingen (fase 4): 08:00, zondag 20:00 en de "Klaar"-knop
    domain_data[entry.entry_id][DATA_UNSUB_NOTIFY] = async_setup_notifications(
        hass, database_path)

    await async_setup_panel(hass)

    async def handle_roll(call: ServiceCall) -> None:
        """De nachtelijke rol nu draaien, zonder op 03:00 te wachten: eerst
        een verlopen vakantie beëindigen, dan doorrollen (tijdens de
        vakantie doet die niets)."""
        await async_run_roll(hass, database_path)

    async def handle_send_daily(call: ServiceCall) -> None:
        """De ochtendmelding nu versturen, zonder op 08:00 te wachten."""
        verzonden = await async_send_daily(hass, database_path)
        _LOGGER.info("Chores Manager: send_daily_summary → %d meldingen", verzonden)

    async def handle_send_weekly(call: ServiceCall) -> None:
        """De weeksamenvatting nu versturen, zonder op zondag te wachten."""
        verzonden = await async_send_weekly(hass, database_path)
        _LOGGER.info("Chores Manager: send_weekly_summary → %d meldingen", verzonden)

    async def handle_mark_done(call: ServiceCall) -> None:
        """Taak afvinken vanaf een dashboard; zonder assignee_id op naam van
        de aanroepende HA-gebruiker (gekoppeld via ha_user_id).

        Dunne laag zonder eigen logica: afvinken loopt via
        notify.async_complete, dus met dezelfde undo-buffer en dezelfde push
        als het panel en de "Klaar"-knop. Een fout wordt een
        ServiceValidationError, zodat HA een toast toont en er niets
        stilletjes misgaat.
        """
        chore_id = call.data["chore_id"].strip()
        # weggelaten, null, leeg of alleen spaties: allemaal "niet meegegeven"
        assignee_id = (call.data.get("assignee_id") or "").strip()
        if not assignee_id:
            user_id = call.context.user_id
            if not user_id:
                # automation of script zonder gebruiker: er ís geen aanroeper
                raise ServiceValidationError(
                    "Deze aanroep heeft geen HA-gebruiker (automatisering?); "
                    "geef assignee_id mee.")
            assignee_id = await resolve_caller(hass, user_id)
            if assignee_id is None:
                raise ServiceValidationError(
                    "Deze HA-gebruiker is aan geen persoon gekoppeld; "
                    "geef assignee_id mee of kies wie het gedaan heeft.")
        try:
            await async_complete(hass, database_path, chore_id, assignee_id)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        _LOGGER.info("Chores Manager: %s afgevinkt via mark_done door %s",
                     chore_id, assignee_id)

    async def handle_undo_last(call: ServiceCall) -> None:
        """Laatste voltooiing of overslag exact terugdraaien, binnen vijf
        minuten.

        Dunne laag om dezelfde async_undo_last als het WS-commando
        chores_manager/undo: zelfde buffer, zelfde venster, zelfde signaal.
        Niets (meer) om terug te draaien, of een overslag die niet meer terug
        kan (al aan gewerkt, datum gewijzigd), geeft een
        ServiceValidationError met de reden.
        """
        chore_id = await async_undo_last(hass)
        _LOGGER.info("Chores Manager: %s teruggedraaid via undo_last", chore_id)

    async def handle_revert_completion(call: ServiceCall) -> None:
        """Een eerdere voltooiing weghalen, ook buiten het undo-venster
        ("toch niet gedaan"); het id komt uit recent_completions.

        Wijst de undo-buffer naar dezelfde regel, dan vervalt hij: anders
        zou undo_last daarna de toestand van vóór het afvinken terugzetten
        over het terugdraaien heen. Alleen een buffer van kind completion
        komt daarvoor in aanmerking; een gebufferde overslag blijft staan.
        """
        completion_id = call.data["completion_id"]
        try:
            result = await hass.async_add_executor_job(
                revert_completion, database_path, completion_id,
                dt_util.now().date())
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        buffered = domain_data.get(DATA_UNDO)
        if (buffered and buffered["kind"] == UNDO_KIND_COMPLETION
                and buffered["undo"]["row_id"] == completion_id):
            domain_data[DATA_UNDO] = None
        async_dispatcher_send(hass, SIGNAL_UPDATED,
                              {"reason": "revert", "chore_id": result["chore_id"]})
        _LOGGER.info("Chores Manager: voltooiing %d (%s) teruggedraaid via "
                     "revert_completion", completion_id, result["chore_id"])

    async def handle_skip(call: ServiceCall) -> None:
        """Taak overslaan vanaf een dashboard: deze keer doet niemand hem.

        Dunne laag om websocket.async_skip, dus met dezelfde undo-buffer en
        dezelfde push als het panel. Zonder assignee_id komt de overslag op
        naam van de aanroepende HA-gebruiker (gekoppeld via ha_user_id).
        Bewust anders dan mark_done: lukt dat niet — een automatisering
        zonder gebruiker, of een ongekoppeld account zoals de tablet — dan
        wordt het "onbekend" (NULL) in plaats van een fout. Overslaan heeft
        geen persoon nodig; afvinken wel, want daar horen minuten bij.
        """
        chore_id = call.data["chore_id"].strip()
        # weggelaten, null, leeg of alleen spaties: allemaal "niet meegegeven"
        assignee_id = (call.data.get("assignee_id") or "").strip() or None
        if assignee_id is None:
            assignee_id = await resolve_caller(hass, call.context.user_id)
        try:
            await async_skip(hass, chore_id, assignee_id)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        _LOGGER.info("Chores Manager: %s overgeslagen via skip door %s",
                     chore_id, assignee_id or "onbekend")

    async def handle_revert_skip(call: ServiceCall) -> None:
        """"Toch niet overslaan", ook buiten het undo-venster; het id komt
        uit recent_skips. Dunne laag om websocket.async_revert_skip: die
        weigert met een ServiceValidationError als er sinds het overslaan al
        aan de taak gewerkt is of de datum gewijzigd is, en laat de
        undo-buffer vervallen als die naar deze overslag wees.
        """
        skip_id = call.data["skip_id"]
        result = await async_revert_skip(hass, skip_id)
        _LOGGER.info("Chores Manager: overslag %d (%s) teruggedraaid via "
                     "revert_skip", skip_id, result["chore_id"])

    async def handle_start_vacation(call: ServiceCall) -> None:
        """Vakantiemodus aan vanaf vandaag, eventueel tot en met until.

        Idempotent (strict=False), voor automatiseringen: staat hij al aan,
        dan wordt een meegegeven until de nieuwe laatste dag, en zonder until
        gebeurt er niets. Een until vóór vandaag wordt een
        ServiceValidationError.
        """
        try:
            await async_start_vacation(hass, call.data.get("until"), strict=False)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err

    async def handle_end_vacation(call: ServiceCall) -> None:
        """Vakantiemodus uit, met vandaag als dag van terugkomst; de taken
        schuiven op. Idempotent: staat hij al uit, dan gebeurt er niets."""
        try:
            await async_end_vacation(hass, strict=False)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err

    async def handle_start_absence(call: ServiceCall) -> None:
        """Afwezigheid van één persoon aan vanaf vandaag, eventueel tot en
        met until (v2.7).

        Idempotent (strict=False), zoals start_vacation: is de persoon al
        afwezig, dan wordt een meegegeven until de nieuwe laatste dag, en
        zonder until gebeurt er niets. Een onbekende of gearchiveerde
        persoon of een until vóór vandaag wordt een ServiceValidationError.
        """
        try:
            await async_start_absence(
                hass, call.data["assignee_id"].strip(), call.data.get("until"),
                strict=False)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err

    async def handle_end_absence(call: ServiceCall) -> None:
        """Afwezigheid van één persoon uit, met vandaag als dag van
        terugkomst. Idempotent: niet afwezig, dan gebeurt er niets; een
        onbekende persoon wordt een ServiceValidationError."""
        try:
            await async_end_absence(
                hass, call.data["assignee_id"].strip(), strict=False)
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err

    hass.services.async_register(DOMAIN, "roll_forward", handle_roll)
    hass.services.async_register(DOMAIN, "send_daily_summary", handle_send_daily)
    hass.services.async_register(DOMAIN, "send_weekly_summary", handle_send_weekly)
    hass.services.async_register(
        DOMAIN, "mark_done", handle_mark_done, schema=MARK_DONE_SCHEMA)
    hass.services.async_register(DOMAIN, "undo_last", handle_undo_last)
    hass.services.async_register(
        DOMAIN, "revert_completion", handle_revert_completion,
        schema=REVERT_COMPLETION_SCHEMA)
    hass.services.async_register(DOMAIN, "skip", handle_skip, schema=SKIP_SCHEMA)
    hass.services.async_register(
        DOMAIN, "revert_skip", handle_revert_skip, schema=REVERT_SKIP_SCHEMA)
    hass.services.async_register(
        DOMAIN, "start_vacation", handle_start_vacation,
        schema=START_VACATION_SCHEMA)
    hass.services.async_register(DOMAIN, "end_vacation", handle_end_vacation)
    hass.services.async_register(
        DOMAIN, "start_absence", handle_start_absence, schema=START_ABSENCE_SCHEMA)
    hass.services.async_register(
        DOMAIN, "end_absence", handle_end_absence, schema=END_ABSENCE_SCHEMA)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _LOGGER.info("Chores Manager: setup compleet")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Ruim alle registraties op bij het ontladen van de config entry."""
    async_remove_panel(hass)

    entry_data = hass.data.get(DOMAIN, {}).get(entry.entry_id, {})
    for key in (DATA_UNSUB_ROLL, DATA_UNSUB_NOTIFY):
        unsub = entry_data.pop(key, None)
        if unsub:
            unsub()

    for service in SERVICES:
        if hass.services.has_service(DOMAIN, service):
            hass.services.async_remove(DOMAIN, service)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        _LOGGER.info("Chores Manager: ontladen")
    return unload_ok
