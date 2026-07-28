# Changelog

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