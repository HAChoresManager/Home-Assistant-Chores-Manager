# Changelog

## v2.7.0 (2026-10-04)

Afwezigheid per persoon — één iemand is een tijd weg, het huishouden draait
door. De vakantiemodus blijft zoals hij was; dit is een kleinere functie
ernaast.

- Vaste taken van wie weg is, worden tijdens de afwezigheid "wie kan":
  geen toegewezene, iedereen mag ze doen. Ze lopen gewoon door in het
  rooster (vervallen, achterstand, rol).
- Rotaties slaan de afwezige over: aan de beurt is de eerste persoon vanaf
  de huidige beurt die er wél is; is iedereen in de rotatie weg, dan wordt
  de taak "wie kan". Puur een berekening — de opgeslagen beurt verandert
  niet, er is geen inhaalslag, en na terugkomst sluit de persoon weer aan
  op zijn of haar plek. Doorschuiven na afvinken blijft vanaf de doener.
- Afvinken blijft voor iedereen kunnen, ook voor wie weg is; ranglijst en
  minuten tellen gewoon wat er gedaan is.
- Geen ochtendmelding en geen weeksamenvatting voor wie weg is; de anderen
  krijgen de overgenomen taken in hun ochtendmelding zoals elke "wie
  kan"-taak.
- Streak: weken die (deels) in iemands afwezigheid vallen, zijn voor die
  persoon neutraal (zoals vakantieweken); de anderen tellen gewoon door.
- De vakantiemodus wint: staat die aan, dan doet een afwezigheid niets
  extra's. Starten en beëindigen mag wel tijdens een vakantie.
- Automatisch einde: met een laatste dag (`until`) eindigt de afwezigheid
  de dag erna om 03:00 (vóór de rol) en bij het opstarten. Een persoon
  archiveren beëindigt een lopende afwezigheid.
- Nieuwe tabel `absences` (hooguit één lopende per persoon); komt er bij
  het opstarten vanzelf bij op een bestaande database.
- Schakelaars `switch.chores_afwezig_<id>` per actieve persoon (naam
  "Chores Afwezig <Naam>"): aan = afwezig zonder einddatum, uit = terug.
  Attributen `start_date` en `until`; volgen live, staan meteen goed na
  `turn_on`/`turn_off`, verschijnen bij een nieuwe persoon en verdwijnen
  (ook uit het entiteitenregister) bij archiveren.
- Services `chores_manager.start_absence` (`assignee_id`, optioneel
  `until`) en `chores_manager.end_absence` (`assignee_id`), idempotent.
- WebSocket: `absence/start`, `absence/update` en `absence/end`; `state`
  levert `absences`, en per taak is `current_assignee` het effectieve
  resultaat met `covering_for` erbij.
- `sensor.chores_overview`: nieuw attribuut `absences`; per persoon
  `absent` en `absent_until`; in `tasks_today` de effectieve toewijzing
  plus `covering_for` en `covering_for_name`.
- Panel: in Beheer per persoon een schakelaar "Afwezig" met een optioneel
  "Tot en met" en een korte uitleg. Op Vandaag en Alles "· voor Laura" bij
  een overgenomen vaste taak en "· Laura is weg" bij een rotatie; onder de
  kop van Vandaag "Laura is weg t/m 12 okt". In "Wie heeft het gedaan?"
  blijft de afwezige staan, iets gedimd.
- Intern: `chores-panel.js` gesplitst (schakelaars en datums in Beheer naar
  `controls.js`) om onder de 600 regels te blijven.
- Documentatie: drie bekende fouten rechtgezet (de planningstypen in de
  technische beschrijving, de nooit gebouwde sensoren per persoon in het
  plan, `notify.py` in de lagentabel van de ontwikkelgids).

## v2.6.0 (2026-10-04)

Vakantiemodus — alles staat stil, en bij terugkomst schuift het mee op.

- Aan = alle taken staan stil: niets is aan de beurt, niets loopt achter,
  er gaan geen meldingen uit. Afvinken, overslaan, snoozen en een overslag
  terugdraaien weigeren met "Vakantiemodus staat aan; afvinken en
  overslaan kan weer na de vakantie." — in de datalaag zelf, dus op elk
  pad (panel, services, "Klaar"-knop). De nachtelijke rol slaat over; de
  undo-buffer wordt bij het aanzetten geleegd.
- Bij het einde schuiven de taken op: intervaltaken precies zoveel dagen
  als de vakantie duurde (ook een achterstand blijft even groot); een
  intervaltaak die tijdens de vakantie nieuw is of een andere datum kreeg,
  komt op de laatste van zijn datum en de terugkomstdag, zonder dubbel op
  te schuiven. Taken op vaste dagen (daily/weekly/monthly/yearly) die vóór
  de terugkomst lagen, gaan naar de eerstvolgende keer vanaf de
  terugkomst; een kalenderachterstand van vóór de vakantie vervalt. Aan en
  uit op dezelfde dag verschuift niets. De beurt blijft staan.
- Automatisch einde: met een laatste vakantiedag (`until`) gaat de modus
  de dag erna om 03:00 vanzelf uit, vóór de rol; ook bij het opstarten,
  als HA over die datum heen uit stond (dan draait de rol meteen mee).
- Streaks: weken die (deels) in een vakantie vallen zijn neutraal — ze
  verlengen niet en breken niet. Ranglijst en weektotalen blijven gewoon
  wat er gedaan is.
- Nieuwe tabellen `vacations` (historie, hooguit één actieve) en
  `vacation_frozen` (momentopname van de datums bij het aanzetten); komen
  er bij het opstarten vanzelf bij op een bestaande database.
- Schakelaar `switch.chores_vakantiemodus` (nieuw platform `switch`): aan =
  vakantie zonder einddatum, uit = einde. Attributen `start_date` en
  `until`; volgt de stand live.
- Services `chores_manager.start_vacation` (optioneel `until`) en
  `chores_manager.end_vacation`, idempotent voor automatiseringen.
- WebSocket: `vacation/start`, `vacation/update` en `vacation/end`;
  `state` levert `vacation` (of `null`). Tijdens de vakantie geven
  `complete`, `chore/skip`, `skip/revert` en `chore/snooze` de foutcode
  `vacation_active`.
- `sensor.chores_overview`: state 0 en `tasks_today` leeg tijdens de
  vakantie; nieuw attribuut `vacation`.
- Panel: sectie "Vakantie" bovenaan Beheer (schakelaar, optioneel "Tot en
  met", uitleg wat er bij terugkomst gebeurt). Vandaag toont een rustige
  banner in plaats van taken; Alles toont alle taken onder "Staat stil",
  gedimd en zonder afvinkknoppen, met hun huidige datum.
- Een overslag van vóór een vakantie kan daarna niet meer terug (anders
  kwam een vervallen achterstand terug); een vakantie van nul dagen telt
  daarbij niet.
- Robuust bij gelijktijdigheid: de nachtelijke rol en het aanzetten van de
  vakantie kruisen elkaar niet, een undo die al liep bij het aanzetten
  weigert alsnog, en een taak die tijdens de vakantie uit het archief wordt
  teruggezet schuift niet dubbel op.
- De schakelaar staat meteen goed zodra `switch.turn_on`/`turn_off`
  terugkeert (scripts en toggles zien de nieuwe stand).
- Panel: een open keuzerij ("Wie heeft het gedaan?" en de creditkeuze)
  staat op een eigen regel onder de taak. Ernaast drukte hij de taaknaam
  samen tot één letter per regel — op de telefoon al eerder zo, met de
  knop "Overslaan" erbij ook op een breed scherm.

## v2.5.0 (2026-10-03)

Overslaan — "deze keer doet niemand het", met terugdraaien.

- Overslaan rolt een taak door naar de eerstvolgende geplande keer, zonder
  voltooiing: geen minuten, geen invloed op ranglijst of streak, en bij een
  roterende taak blijft dezelfde persoon aan de beurt. Alleen voor taken
  die vandaag aan de beurt zijn of achterlopen. Een half afgevinkte
  checklist of counter begint daarna opnieuw; de afgevinkte stappen blijven
  in de historie.
- Nieuwe tabel `skips` (wie, wanneer, datum ervoor en erna); komt er bij
  het opstarten vanzelf bij op een bestaande database.
- Panel: knop "Overslaan" achteraan in de rij "Wie heeft het gedaan?",
  optimistisch zoals afvinken en met dezelfde "Ongedaan maken".
  Activiteit toont overslagen als rustigere regel ("⏭ Laura sloeg Badkamer
  over") met "Toch niet overslaan" zolang dat nog kan.
- WebSocket: `chore/skip` en `skip/revert`; `state` levert ook `skips` en
  `activity_since`. `undo` draait nu de laatste voltooiing óf overslag
  terug.
- Services `chores_manager.skip` en `chores_manager.revert_skip`;
  `undo_last` draait ook een overslag terug.
- `sensor.chores_overview`: nieuw attribuut `recent_skips` (laatste acht,
  met `skip_id` voor `revert_skip`); `recent_completions` blijft alleen
  voltooiingen.
- `chore/snooze` met 'skip' wordt nu gelogd als overslag (zonder persoon,
  zonder undo-buffer) en weigert een gearchiveerde taak.
- Teruggedraaide voltooiing: was de taak daarna overgeslagen, dan blijft de
  datum van de overslag staan. Undo van een voltooiing waarna via snooze is
  overgeslagen, weigert met een nette melding.
- Afvinken, overslaan en terugdraaien zijn per taak geserialiseerd (twee
  apparaten tegelijk kruisen elkaar niet meer halverwege een ronde), en de
  instantiegrens vergelijkt tijdstippen, niet strings — ook rond de
  wintertijdwissel klopt de volgorde.
- Undo wist niet langer de "Ongedaan maken" van iemand die intussen op een
  ander apparaat iets afvinkte.
- Vandaag zegt niet meer "Mooi werk." als er vandaag alleen is overgeslagen
  ("Niets meer voor vandaag"); een rustige dag houdt "Alles gedaan".
- `chores-panel.js` gesplitst: de mutaties staan nu in `actions.js`.

## v2.4.0 (2026-07-29)

Fase 5 — polish en de doorgeschoven punten; hiermee is de refactor afgerond.

- De "Klaar"-knop in de ochtendmelding draagt de taaknaam.
- `sensor.chores_overview`: nieuw attribuut `tasks_today` (compacte
  weergavelijst mét toegewezen persoon) en `color` per persoon in `persons`,
  voor eigen Lovelace-kaarten.
- Kaartmodus raakt de URL niet meer aan: tabs werken in een Bubble
  Card-popup zonder hem te sluiten; het panel op /taken behoudt hash-routing
  en terugknop.
- Gearchiveerde taken zijn terug te zetten (sectie "Gearchiveerd" in Beheer,
  WS-commando `chore/restore`) met een verse vervaldatum.
- Checkliststappen zijn ook mét historie te bewerken:
  `completions.subtask_id` → ON DELETE SET NULL via een geteste
  tabel-rebuildmigratie; minuten en historie blijven staan.
- Rotatievolgorde herordenen met pijltjes in het taakformulier.
- De tijdelijke service `seed` en `seed.py` zijn verwijderd;
  `send_daily_summary`/`send_weekly_summary` blijven.

## v2.2.0 (2026-07-28)

De omschakeling (fase 3c): de oude React/CDN-app is volledig verwijderd; het
nieuwe native panel op `/taken` is de enige app.

- Panel met vier schermen (Vandaag, Alles, Activiteit, Beheer), WebSocket-push,
  optimistisch afvinken met ongedaan maken, credits los van toewijzing.
- Sensor `sensor.chores_overview` zonder polling, met `in_leaderboard`-vlag
  per persoon.
- Hamburger op smalle schermen; kaartmodus (`type: custom:chores-panel`);
  themakeuze per apparaat in Beheer.
- Versie in het statische pad in plaats van `?v=`-parameters.
- De twintig oude services vervangen door de WebSocket-API plus `seed`
  (tijdelijk) en `roll_forward`.

## v1.0.0 (2025-03-12)

Initial release of Chores Manager for Home Assistant

### Features
- Task creation and management with customizable frequencies
- Family member assignments with alternating feature
- Completion tracking and statistics
- Mobile-responsive dashboard interface
- User management with custom colors
- Support for various recurrence patterns (daily, weekly, monthly, etc.)
- Task descriptions and priority levels
- Home Assistant theme integration
- Home Assistant user integration for notifications
- Smart notification summaries for due tasks
- Automation support with `force_due` service