# Changelog

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