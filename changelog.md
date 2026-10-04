# Changelog

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