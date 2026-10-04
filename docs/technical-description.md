# Technical Description — Chores Manager 2.x

Stand: 29-07-2026, na fase 5 — de refactor is afgerond; bijgewerkt op
20-09-2026 voor de service `mark_done` en op 23-09-2026 voor `undo_last`,
`revert_completion` en het attribuut `recent_completions`, en op
03-10-2026 (v2.5.0) voor overslaan: tabel `skips`, de services `skip` en
`revert_skip`, de WS-commando's `chore/skip` en `skip/revert` en het
attribuut `recent_skips`. De oude app (1.x) is volledig verwijderd; dit
document beschrijft alleen wat er draait. Ontwerpmotivatie:
`REFACTOR_PLAN.md`.

## Database

`<config>/chores_v2.db` (SQLite; de naam stamt uit de migratieperiode). Vijf
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
  er bestaat geen aparte weektabel;
- `skips` (sinds v2.5) — overslaglog: `chore_id`, `assignee_id` (wie
  oversloeg; `NULL` = onbekend), `skipped_at` (ISO met offset),
  `previous_next_due` en `new_next_due`. Geen voltooiing: telt niet mee voor
  minuten, ranglijst, streak of weekhistorie.

Verwijderen is eerlijk: met historie wordt een taak of persoon gedeactiveerd
(`active = 0`, historie blijft), zonder historie echt verwijderd. Overslagen
tellen daarbij niet als historie: een taak met alleen overslagen gaat echt
weg en neemt zijn overslaglog mee (`skips.chore_id` is `ON DELETE CASCADE`);
bij een persoon die echt weg mag, wordt `skips.assignee_id` `NULL`
(`ON DELETE SET NULL`).
Gearchiveerde taken staan in Beheer onder "Gearchiveerd" en zijn terug te
zetten (`chore/restore`). Checkliststappen zijn ook mét historie te bewerken:
`completions.subtask_id` heeft sinds fase 5 `ON DELETE SET NULL`, dus een
geschrapte stap laat zijn voltooiingen (en minuten) staan. Kleine
schemamigraties draaien idempotent bij het opstarten (`db/schema.py`); een
nieuwe tabel zoals `skips` komt er via `CREATE TABLE IF NOT EXISTS` vanzelf
bij op een bestaande database, zonder migratiestap.

## Planning (`scheduling/`)

Vijf planningstypen: `interval`, `weekly` (weekdagen), `monthly_day`,
`yearly`, `flexible`. Pure functies zonder HA of sqlite:

- `initial_next_due` / `next_due_after_completion` — vooruit plannen gebeurt
  vanaf de *geplande* datum, niet vanaf het moment van afvinken;
- `next_due_after_skip` — overslaan: de eerstvolgende geplande keer, gerekend
  vanaf de laatste van `next_due` en vandaag, alsof de taak op die dag gedaan
  was (een achterstand slaat zo in één keer door tot na vandaag);
- `roll_forward` — achterstand loopt niet op (§4.2): voorbij de
  prioriteitsgrens schuift een taak naar zijn eerstvolgende logische datum;
- `overdue_days`, `urgency` (due/grace/urgent per prioriteit),
  `cycle_fraction` (achterstand genormaliseerd op de cycluslengte, voor de
  sortering);
- `current_assignee`, `advance_rotation` — de rotatie schuift vanaf wie de
  taak *echt* deed; een buitenstaander laat de beurt staan.

## Overslaan (`db/skips.py`, sinds v2.5)

Overslaan = deze keer doet niemand de taak. `skip_chore` zet `next_due` op
`next_due_after_skip` en schrijft een regel in `skips`, in één transactie:

- alleen voor een actieve taak die vandaag aan de beurt is of achterloopt
  (`next_due` op of vóór vandaag); een opgegeven persoon moet bestaan en
  actief zijn, zonder persoon wordt het `NULL`;
- geen voltooiing: geen minuten, geen invloed op ranglijst, streak of
  weekhistorie; `rotation_index` blijft staan, dus bij een roterende taak
  blijft dezelfde persoon aan de beurt;
- het doorschuiven is een compare-and-set op de net gelezen `next_due`: een
  dubbele tik of een tweede apparaat geeft een nette fout ("De taak is net
  gewijzigd; probeer het opnieuw.") in plaats van twee keer doorschuiven;
- een overslag sluit de lopende instantie af: `completions._instance_start`
  is het laatste van de laatste volledige voltooiing en de laatste overslag.
  Een half afgevinkte checklist of counter begint daarna opnieuw (met de
  volle `duration_minutes` te verdelen); de oude deelstappen blijven in feed
  en ranglijst staan.

`revert_skip` ("Toch niet overslaan") zet `previous_next_due` terug en
verwijdert de regel, maar alleen als er sinds het overslaan niets met de
taak is gebeurd: de taak is actief, er is geen latere overslag van dezelfde
taak, er is geen voltooiingsregel (ook geen losse deelstap of tik) vanaf
`skipped_at`, `next_due` staat nog op `new_next_due` en de taak is
sindsdien niet gewijzigd (`updated_at` niet later dan `skipped_at`: geen
bewerking, snooze of terugzetten uit het archief, ook niet als die
toevallig op dezelfde datum uitkwam). Anders een Nederlandse foutmelding
met de reden. Dezelfde voorwaarden bepalen `can_revert` in `skip_feed`, dus
hooguit de nieuwste overslag per taak kan terug; na het terugdraaien krijgt
`updated_at` het tijdstip van de vorige overslag, zodat die op zijn beurt
ook terug kan.

Afvinken, overslaan en terugdraaien lezen en schrijven in één
schrijftransactie (`BEGIN IMMEDIATE`), zodat twee apparaten elkaar niet
halverwege de instantie kunnen kruisen. Rond de instantiegrens worden
tijdstippen als tijdstip vergeleken (`julianday()`), niet als string: in het
teruggezette uur van de wintertijdwissel sorteren de strings verkeerd om.

`revert_completion` houdt rekening met een latere overslag: is de taak ná de
laatste volledige voltooiing overgeslagen, dan blijft `next_due` staan (die
komt van de overslag); de beurt gaat wél terug.

`chore/snooze` met mode `skip` loopt sinds v2.5 via `skip_chore` (zonder
persoon) en wordt dus ook gelogd. Hij accepteert, zoals altijd, ook een nog
komende keer (en sluit dan ook de ronde van een komende checklist af),
weigert nu een gearchiveerde taak, en vult de undo-buffer niet — snooze bood
nooit undo; terugdraaien kan via `skip/revert`.

## WebSocket-API (`websocket.py`)

Twaalf commando's onder `chores_manager/*`, standaard-auth (geen admin):
`state`, `complete`, `undo`, `chore/save`, `chore/delete`, `chore/snooze`,
`chore/restore` (gearchiveerde taak terug, met verse vervaldatum),
`chore/skip`, `skip/revert`, `assignee/save`, `assignee/delete`,
`subscribe`. Mutaties sturen `SIGNAL_UPDATED` over de dispatcher;
`subscribe`-abonnees krijgen een event met alleen de reden en halen zelf
verse staat op via `state`.

- `state` geeft naast taken, personen, ranglijst en `feed` (alleen
  voltooiingen; Vandaag gebruikt hem zo) sinds v2.5 ook `skips` (het
  overslaglog, nieuwste eerst, maximaal honderd, met `can_revert` per regel)
  en `activity_since`: het tijdstip vanaf waar de gemengde tijdlijn van
  voltooiingen en overslagen compleet is, of `null`. Activiteit laat oudere
  regels weg, zodat er geen gat in de menging zit.
- `chore/skip` — `chore_id`, optioneel `assignee_id`. Zonder `assignee_id`
  bepaalt de server wie oversloeg via de koppeling (`ha_user_id`) van de
  ingelogde gebruiker; is die aan niemand gekoppeld, dan blijft het
  onbekend. Resultaat `{chore_id, skip_id, next_due, undo_available}`;
  signaal met reason `skip`.
- `skip/revert` — `skip_id`; resultaat `{chore_id, next_due}`, signaal met
  reason `skip_revert`. Wijst de undo-buffer naar deze overslag, dan
  vervalt hij.
- Undo werkt op één geheugenbuffer met een venster van vijf minuten, voor de
  laatste voltooiing óf overslag (`{"kind": "completion" | "skip", ...}` in
  `const.py`). Een voltooiing gaat terug via de momentopname van vóór het
  afvinken, een overslag via `revert_skip` met dezelfde bewakingen. De kern
  (`async_undo_last`) deelt `undo` met de service `undo_last`. Foutcodes:
  `nothing_to_undo` (buffer leeg of verlopen) en `invalid_input` (een
  overslag die niet meer terug kan, of een voltooiing waarna de taak via
  `chore/snooze` 'skip' is overgeslagen; de buffer vervalt dan).

Een weigering uit de datalaag komt als `invalid_input` met de Nederlandse
reden terug, in een service als `ServiceValidationError` — nooit als kale
exceptie.

## Sensor (`sensor.py`)

`sensor.chores_overview` — state = openstaande taken vandaag (due +
achterstallig). Geen polling: updates via de dispatcher. Het unique_id is
dat van de oude 1.x-sensor, zodat de entiteit dezelfde naam behield.

Attributen, gedocumenteerd voor Lovelace-gebruik:

- `due_today`, `overdue`, `completed_today`, `week_minutes_total` — tellers;
- `persons` — dict per persoon-id: `name`, `minutes`, `tasks`, `streak`,
  `in_leaderboard`, `color`. De sensor toont iedereen die iets deed;
  filteren op de ranglijstvlag is aan de afnemer, de kleur is er om namen
  in persoonskleur te tonen;
- `tasks_today` — maximaal acht items, compact (geen beschrijvingen):
  `id`, `name`, `icon`, `status` (`today` | `overdue` | `done`),
  `assignee_id`, `assignee_name` (bij 'anyone': "wie kan"),
  `assignee_color` (bij 'anyone' zijn `assignee_id` en `assignee_color`
  `null`). De ids zijn er zodat een kaart met één tik
  `chores_manager.mark_done` kan aanroepen. Eerst vandaag (prioriteit, dan
  naam), dan achterstand op cyclusfractie. Een taak met een volledige
  voltooiing van minder dan twee minuten oud (`RECENT_DONE_SECONDS` = 120 in
  `const.py`) die niet opnieuw openstaat, blijft staan met status `done` en
  vier extra velden: `completion_id` (voor
  `chores_manager.revert_completion`), `completed_at` (ISO), `done_by` en
  `done_by_color` (wie afvinkte). Done-rijen sorteren mee in de
  vandaag-groep, zodat een afgevinkte taak niet verspringt, en tellen mee
  voor de limiet van acht, maar niet voor `open_today`, `due_today` en
  `overdue`. Omdat er na twee minuten geen mutatie volgt, plant de sensor
  zelf een verversing (`async_call_later`) voor het moment dat de oudste
  done-rij verloopt;
- `recent_completions` — de laatste acht voltooiingen, nieuwste eerst,
  uit dezelfde feed-query als het panel. Per item precies: `id`,
  `chore_id`, `chore_name`, `icon`, `assignee_id`, `assignee_name`,
  `assignee_color`, `completed_at` (ISO, lokale tijd met offset),
  `minutes`, `is_full` (bool; `false` bij een deelstap of counter-tik) en
  `subtask_name` (of `null`). Geen notities. Met `id` roept een kaart
  `chores_manager.revert_completion` aan. Overslagen staan hier niet in;
- `recent_skips` (sinds v2.5) — de laatste acht overslagen, nieuwste eerst.
  Per item precies: `skip_id`, `chore_id`, `name`, `icon`, `skipped_by`
  (weergavenaam, of `null` als niet bekend is wie oversloeg) en
  `skipped_at` (ISO, lokale tijd met offset). Met `skip_id` roept een kaart
  `chores_manager.revert_skip` aan.

## Scheduler

Dagelijks 03:00 lokale tijd: `roll_forward` over alle taken, daarna een
dispatchersignaal. Handmatig triggeren kan met de service
`chores_manager.roll_forward`.

## Meldingen (`notify.py`, fase 4)

Alleen naar personen met een `notify_service` én `notifications_enabled`.

- **08:00** per persoon, alleen als er iets te doen is: "3 voor vandaag,
  1 loopt achter" met taaknamen, plus één "Klaar"-knop voor de belangrijkste
  taak (zwaarste achterstand op cyclusfractie; anders hoogste prioriteit,
  dan kortste); de knop draagt de taaknaam ("✓ Planten wat…", afgekapt op
  ~22 tekens voor iOS). De rol van 03:00 draait hier bewust vóór.
- **Zondag 20:00** de weeksamenvatting: samen eerst, dan de verdeling met
  tijd, taken en reeksen. Feiten, geen ranglijsttaal.
- **"Klaar"** loopt via `mobile_app_notification_action`; de action-string is
  `chores_manager_complete:<chore_id>:<assignee_id>`. De listener vinkt af
  met dezelfde db-functie, undo-buffer en push als het panel.

Tijden staan als constanten in `const.py` (fase 5 kan ze instelbaar maken).

## Frontend (`www/chores-panel/`)

Eén web component `<chores-panel>` (shadow DOM), als panel op `/taken` en als
Lovelace-kaart. Vier weergaven achter tabs, actieve weergave in de URL-hash.
Kernmechanieken:

- één toestandsobject (`core/store.js`) met subscribe; elke set() is één
  render, behalve als er een formulier openstaat;
- alle rendering via de escapende `html`-helper (`core/html.js`);
- event delegation op de shadow root; opnieuw renderen sloopt geen listeners;
- optimistisch afvinken met "Ongedaan maken"; credits los van toewijzing;
- overslaan: de knop "Overslaan" staat uitsluitend achteraan in de rij "Wie
  heeft het gedaan?" op kaartniveau, alleen voor een taak die vandaag aan de
  beurt is of achterloopt (niet bij de creditkeuze, niet bij een losse
  deelstap). Optimistisch zoals afvinken, met dezelfde "Ongedaan maken";
- Activiteit mengt voltooiingen en overslagen tot één tijdlijn; een
  overslag is een rustigere regel ("⏭ Laura sloeg Badkamer over") met
  "Toch niet overslaan" waar de server `can_revert` meegeeft;
- de mutaties (afvinken, overslaan, terugdraaien, opslaan, verwijderen)
  staan met hun terugkoppeling in `actions.js`; het element zelf houdt
  lifecycle, routing, render, delegatie, thema's en de snackbar;
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

- `chores_manager.roll_forward` — de nachtelijke rol nu.
- `chores_manager.send_daily_summary` — de ochtendmelding nu.
- `chores_manager.send_weekly_summary` — de weeksamenvatting nu.
- `chores_manager.mark_done` — taak afvinken vanaf een Lovelace-dashboard,
  zonder het panel te openen. Velden: `chore_id` (verplicht, uit
  `tasks_today`) en `assignee_id` (optioneel; leeg of `null` = de
  aanroepende HA-gebruiker, opgezocht via `ha_user_id`; geen koppeling
  geeft een `ServiceValidationError` en dus een toast. Vanuit een
  automatisering of script zonder gebruiker is er geen aanroeper, dus daar
  is `assignee_id` verplicht). Dunne laag zonder eigen
  logica: dezelfde `async_complete` in `notify.py` als de "Klaar"-knop,
  dus dezelfde undo-buffer en dezelfde push. Een checklist wordt in één
  keer afgerond, een counter krijgt één tik.
- `chores_manager.undo_last` — de laatste voltooiing of overslag exact
  terugdraaien, zonder velden. Dunne laag om `async_undo_last` in
  `websocket.py`, de kern van het WS-commando `undo`: zelfde buffer, zelfde
  venster van vijf minuten, zelfde signaal (reason `undo`). Niets (meer) om
  terug te draaien, of een overslag die niet meer terug kan (al aan
  gewerkt, datum gewijzigd), geeft een `ServiceValidationError`.
- `chores_manager.revert_completion` — een eerdere voltooiing weghalen, ook
  buiten het undo-venster ("toch niet gedaan"). Veld: `completion_id`
  (verplicht, het `id` uit `recent_completions`). De regel verdwijnt (en
  daarmee de minuten uit de weekstand); was het de laatste volledige
  voltooiing van de taak (op `completed_at`, bij gelijke tijd het hoogste
  `id`), dan komt de taak vandaag terug (`next_due` = vandaag, tenzij die
  al op of vóór vandaag lag) en gaat bij een roterende taak de beurt terug
  naar wie de regel had (staat die niet in de rotatie, dan blijft de beurt
  staan). Bij een oudere volledige voltooiing gaat alleen de regel weg:
  `next_due` en de beurt komen dan van een latere voltooiing. Wijst de
  undo-buffer naar dezelfde regel, dan vervalt hij.
  Signaal met reason `revert`; een onbekend id geeft een
  `ServiceValidationError`. Is de taak ná die voltooiing overgeslagen, dan
  blijft `next_due` staan (zie Overslaan).
- `chores_manager.skip` (sinds v2.5) — taak deze keer overslaan vanaf een
  dashboard. Velden: `chore_id` (verplicht, uit `tasks_today`) en
  `assignee_id` (optioneel; leeg of `null` = de aanroepende HA-gebruiker
  via `ha_user_id`). Bewust anders dan `mark_done`: lukt dat niet — een
  automatisering zonder gebruiker, of een ongekoppeld account zoals een
  tablet — dan wordt het "onbekend" (`NULL`) in plaats van een fout;
  overslaan heeft geen persoon nodig. Dunne laag om `async_skip` in
  `websocket.py`, de kern van `chore/skip`: zelfde regels, dezelfde
  undo-buffer, signaal met reason `skip`. Een weigering (bijvoorbeeld een
  taak die nog niet aan de beurt is of gearchiveerd is) geeft een
  `ServiceValidationError`.
- `chores_manager.revert_skip` (sinds v2.5) — toch niet overslaan, ook
  buiten het undo-venster. Veld: `skip_id` (verplicht, het `skip_id` uit
  `recent_skips`). Dunne laag om `async_revert_skip`, de kern van
  `skip/revert`; weigert met een `ServiceValidationError` als terugdraaien
  niet (meer) kan (zie Overslaan).

Meer services zijn er niet; alle overige bediening loopt via de
WebSocket-API — `mark_done`, `undo_last`, `revert_completion`, `skip` en
`revert_skip` zijn de uitzonderingen, omdat Lovelace alleen services kan
aanroepen. De tijdelijke `seed` is in fase 5 verwijderd, met
`seed.py` erbij.
