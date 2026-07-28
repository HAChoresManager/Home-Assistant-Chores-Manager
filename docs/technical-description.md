# Technical Description — Chores Manager 2.x

Stand: 28-07-2026, na fase 3c. De oude app (1.x) is volledig verwijderd; dit
document beschrijft alleen wat er draait. Ontwerpmotivatie: `REFACTOR_PLAN.md`.

## Database

`<config>/chores_v2.db` (SQLite; de naam stamt uit de migratieperiode). Vier
tabellen, DDL in `db/schema.py`:

- `assignees` — id, naam, kleur, `include_in_leaderboard`, `active`,
  `ha_user_id`/`notify_service` (fase 4);
- `chores` — planning als `schedule_type` + `schedule_config` (JSON), losse
  toewijzing (`assignment_type`: fixed/rotating/anyone, `rotation`,
  `rotation_index`), deeltaakmodus (none/checklist/counter), `next_due`,
  `active`;
- `subtasks` — checkliststappen per taak;
- `completions` — feiten: wie, wat (taak of deeltaak), wanneer, minuten.
  Ranglijst, feed, streaks en weekhistorie zijn hier allemaal uit afgeleid;
  er bestaat geen aparte weektabel.

Verwijderen is eerlijk: met historie wordt een taak of persoon gedeactiveerd
(`active = 0`, historie blijft), zonder historie echt verwijderd.

## Planning (`scheduling/`)

Vijf planningstypen: `interval`, `weekly` (weekdagen), `monthly_day`,
`yearly`, `flexible`. Pure functies zonder HA of sqlite:

- `initial_next_due` / `next_due_after_completion` — vooruit plannen gebeurt
  vanaf de *geplande* datum, niet vanaf het moment van afvinken;
- `roll_forward` — achterstand loopt niet op (§4.2): voorbij de
  prioriteitsgrens schuift een taak naar zijn eerstvolgende logische datum;
- `overdue_days`, `urgency` (due/grace/urgent per prioriteit),
  `cycle_fraction` (achterstand genormaliseerd op de cycluslengte, voor de
  sortering);
- `current_assignee`, `advance_rotation` — de rotatie schuift vanaf wie de
  taak *echt* deed; een buitenstaander laat de beurt staan.

## WebSocket-API (`websocket.py`)

Negen commando's onder `chores_manager/*`, standaard-auth (geen admin):
`state`, `complete`, `undo`, `chore/save`, `chore/delete`, `chore/snooze`,
`assignee/save`, `assignee/delete`, `subscribe`. Mutaties sturen
`SIGNAL_UPDATED` over de dispatcher; `subscribe`-abonnees krijgen een event
met alleen de reden en halen zelf verse staat op via `state`. Undo werkt op
een geheugenbuffer met een venster van vijf minuten.

## Sensor (`sensor.py`)

`sensor.chores_overview` — state = openstaande taken vandaag (due +
achterstallig). Attributen: `due_today`, `overdue`, `completed_today`,
`week_minutes_total` en `persons` (per persoon: naam, minuten, taken, streak
en `in_leaderboard` — de sensor toont iedereen; filteren op de ranglijstvlag
is aan de afnemer). Geen polling: updates via de dispatcher. Het unique_id is
dat van de oude 1.x-sensor, zodat de entiteit dezelfde naam behield.

## Scheduler

Dagelijks 03:00 lokale tijd: `roll_forward` over alle taken, daarna een
dispatchersignaal. Handmatig triggeren kan met de service
`chores_manager.roll_forward`.

## Frontend (`www/chores-panel/`)

Eén web component `<chores-panel>` (shadow DOM), als panel op `/taken` en als
Lovelace-kaart. Vier weergaven achter tabs, actieve weergave in de URL-hash.
Kernmechanieken:

- één toestandsobject (`core/store.js`) met subscribe; elke set() is één
  render, behalve als er een formulier openstaat;
- alle rendering via de escapende `html`-helper (`core/html.js`);
- event delegation op de shadow root; opnieuw renderen sloopt geen listeners;
- optimistisch afvinken met "Ongedaan maken"; credits los van toewijzing;
- bij smal scherm (`narrow` van HA) een hamburger die `hass-toggle-menu`
  dispatcht;
- themakeuze per apparaat (`core/theme.js`): variabelen van een HA-thema als
  inline custom properties op de host, keuze in `localStorage`, met
  ondersteuning voor `modes`-thema's via `hass.themes.darkMode`.

Serveren: `/chores_manager-panel-<versie>/` (immutable, versie in het pad,
bron `PANEL_VERSION` in `panel.py`) voor het panel;
`/chores_manager-panel/` (ongecachet, stabiel) uitsluitend als
Lovelace-resource-URL.

## Services

- `chores_manager.seed` — TIJDELIJK; acht legacy-taken en drie personen.
- `chores_manager.roll_forward` — de nachtelijke rol nu.

Meer services zijn er niet; alle bediening loopt via de WebSocket-API.
