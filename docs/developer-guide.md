# Developer Guide — Chores Manager

Voor de werkinstructies en randvoorwaarden: zie `CLAUDE.md` in de root. Voor
de ontwerpbesluiten en het datamodel: `REFACTOR_PLAN.md`. Dit document is de
praktische kaart: waar staat wat, hoe draai je de tests, hoe deploy je.

## Architectuur in één alinea

Eén custom integration (`custom_components/chores_manager/`) met een eigen
SQLite-database (`<config>/chores_v2.db`), vijftien WebSocket-commando's,
twee entiteiten (de overzichtssensor en de schakelaar voor de
vakantiemodus) en één frontend: het panel `<chores-panel>` op `/taken`,
vanilla ES-modules zonder build-stap, geserveerd rechtstreeks uit
`custom_components/`. Geen iframe, geen eigen auth, geen eigen themadata —
alles loopt via `hass` en HA's CSS-variabelen.

## Lagen

| Laag | Map/bestand | Regel |
|---|---|---|
| Pure planning | `scheduling/` | geen HA, geen sqlite; volledig door pytest gedekt |
| Datalaag | `db/` | alle SQL, geparameteriseerd; DDL alleen in `db/schema.py`; geen HA-imports |
| HA-koppeling | `websocket.py`, `vacation.py`, `sensor.py`, `switch.py`, `scheduler.py`, `__init__.py` | dun; roept db/-functies aan in een executor |
| Frontend | `www/chores-panel/` | ES-modules; één toestandsobject in `core/store.js`; mutaties met hun terugkoppeling in `actions.js` |

De datalaag en scheduling zijn bewust HA-vrij: `tests/conftest.py` plant een
lege oudermodule zodat de tests zonder homeassistant-installatie draaien.

## Tests

```bash
python3 -m pytest tests/ -q
```

Dekking: `scheduling/` volledig (typen, next_due, doorrollen, urgentie,
cyclusfractie, rotatie), rooktests op de datalaag (schema incl. migraties,
opslag, overzicht, weekhistorie, meldingsdata, overslaan en terugdraaien —
`tests/test_skip.py`, `tests/test_skip_revert.py` — en de vakantiemodus:
`tests/test_vacation.py`, `tests/test_vacation_shift.py` voor de
verschuiving per type, `tests/test_vacation_views.py` voor sensor, state
en neutrale streakweken). De frontend heeft geen testrunner; controleer
syntax met `node --check` (kopieer het bestand naar `.mjs`, anders weigert
node de ES-module).

## Deployment en versie

- Python gewijzigd → HA herstarten.
- Frontend gewijzigd → `PANEL_VERSION` in `panel.py` ophogen en HA herstarten.
  De versie zit in het statische pad; zie `CLAUDE.md` § Deployment voor het
  waarom en de valkuilen (Cloudflare!).
- Services voor de hand: `chores_manager.roll_forward` (nachtelijke rol nu
  draaien), `send_daily_summary` en `send_weekly_summary` (meldingen nu
  versturen, handig om ze te testen). Daarnaast `mark_done` — geen
  testservice maar de dunne laag waarmee een Lovelace-kaart afvinkt; hij
  gebruikt `notify.async_complete`, dezelfde drie stappen als de
  "Klaar"-knop en `ws_complete`. Het terugdraaien vanaf een kaart loopt
  via `undo_last` (dezelfde `websocket.async_undo_last` als `ws_undo`) en
  `revert_completion` (`db.completions.revert_completion`, voor
  voltooiingen buiten het undo-venster). Overslaan vanaf een kaart:
  `skip` (dezelfde `websocket.async_skip` als `ws_chore_skip`, dus ook
  dezelfde undo-buffer) en `revert_skip` (dezelfde
  `websocket.async_revert_skip` als `ws_skip_revert`). De vakantiemodus
  vanuit een automatisering: `start_vacation` en `end_vacation` (dezelfde
  `vacation.async_start_vacation`/`async_end_vacation` als
  `vacation/start` en `vacation/end`, maar idempotent: al aan of al uit is
  geen fout; de schakelaar in `switch.py` gebruikt dezelfde idempotente
  aanroep). Samen tien services; `SERVICES` in `__init__.py` is de lijst
  die de unload opruimt.

## Kaartgebruik (optioneel)

Het element werkt ook als Lovelace-kaart, zonder iframe:

1. Instellingen → Dashboards → Bronnen → toevoegen:
   URL `/chores_manager-panel/chores-panel.js`, type *JavaScript-module*.
2. Kaartconfiguratie:

   ```yaml
   type: custom:chores-panel
   ```

De resource-URL is bewust ongeversioneerd en niet gecachet, zodat hij nooit
breekt bij een versie-ophoging.

## Valkuilen die al eens pijn deden

- **hass-setter**: vuurt bij elke state-change in heel HA; nooit renderen in
  de setter (`chores-panel.js`, koptekst).
- **HA-router**: onderschept `<a>`-kliks en pushState't ze — geen
  `hashchange`. Tabnavigatie zet daarom zelf de hash met `preventDefault`.
- **Module naast gelijknamig pakket**: Python kiest altijd het pakket; het
  losse bestand wordt stille dode code. Drie keer gebeurd in de oude app.
- **Render tijdens typen**: een openstaand formulier wordt bij renders
  overgeslagen (`state.editing`-guard), anders wist een push-event je invoer.
