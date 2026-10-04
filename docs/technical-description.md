# Technical Description — Chores Manager 2.x

Stand: 29-07-2026, na fase 5 — de refactor is afgerond; bijgewerkt op
20-09-2026 voor de service `mark_done` en op 23-09-2026 voor `undo_last`,
`revert_completion` en het attribuut `recent_completions`, en op
03-10-2026 (v2.5.0) voor overslaan: tabel `skips`, de services `skip` en
`revert_skip`, de WS-commando's `chore/skip` en `skip/revert` en het
attribuut `recent_skips`, en op 04-10-2026 (v2.6.0) voor de
vakantiemodus: tabellen `vacations` en `vacation_frozen`, de schakelaar
`switch.chores_vakantiemodus`, de services `start_vacation` en
`end_vacation`, de WS-commando's `vacation/start|update|end` en het
attribuut `vacation`. De oude app (1.x) is volledig verwijderd; dit
document beschrijft alleen wat er draait. Ontwerpmotivatie:
`REFACTOR_PLAN.md`.

## Database

`<config>/chores_v2.db` (SQLite; de naam stamt uit de migratieperiode). Zeven
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
  minuten, ranglijst, streak of weekhistorie;
- `vacations` (sinds v2.6) — vakantiehistorie: `start_date` (de dag waarop
  de modus aanging), `until` (geplande laatste dag, tot en met; `NULL` =
  open einde), `ended_on` (de dag van terugkomst; `NULL` = loopt nog) en
  `created_at` (ISO-tijdstip van aanzetten). Een unieke gedeeltelijke
  index (`idx_vacations_one_active`) laat hooguit één actieve rij toe. De
  historie blijft staan: de streak heeft hem nodig;
- `vacation_frozen` (sinds v2.6) — momentopname van `next_due` per actieve
  taak bij het aanzetten (`vacation_id`, `chore_id`, `next_due`; beide
  verwijzingen `ON DELETE CASCADE`). Alleen nodig tot het einde van de
  vakantie, dan opgeruimd.

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
nieuwe tabel zoals `skips`, `vacations` of `vacation_frozen` komt er via
`CREATE TABLE IF NOT EXISTS` vanzelf bij op een bestaande database, zonder
migratiestap.

## Planning (`scheduling/`)

Vijf planningstypen: `interval`, `weekly` (weekdagen), `monthly_day`,
`yearly`, `flexible`. Pure functies zonder HA of sqlite:

- `initial_next_due` / `next_due_after_completion` — vooruit plannen gebeurt
  vanaf de *geplande* datum, niet vanaf het moment van afvinken;
- `next_due_after_skip` — overslaan: de eerstvolgende geplande keer, gerekend
  vanaf de laatste van `next_due` en vandaag, alsof de taak op die dag gedaan
  was (een achterstand slaat zo in één keer door tot na vandaag);
- `shift_after_vacation` — de nieuwe `next_due` bij het einde van een
  vakantie (zie Vakantiemodus);
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
toevallig op dezelfde datum uitkwam). Sinds v2.6 ook: er staat geen
vakantie aan en er is sinds het overslaan geen aangezet (zie
Vakantiemodus). Anders een Nederlandse foutmelding met de reden. Dezelfde voorwaarden bepalen `can_revert` in `skip_feed`, dus
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

## Vakantiemodus (`db/vacations.py`, sinds v2.6)

Aan = alle taken staan stil: er is niets aan de beurt, niets loopt achter en
er gaan geen meldingen uit. De taken houden intussen hun echte `next_due`;
pas bij het einde schuiven ze op.

- **Aanzetten** (`start_vacation`): `start_date` = vandaag, `until`
  optioneel (vandaag of later; `None` of `""` = open einde, elke ISO-datum
  wordt als `JJJJ-MM-DD` opgeslagen). Staat er al een vakantie aan, dan een
  fout ("Vakantiemodus staat al aan.") — ook bij twee gelijktijdige
  aanroepen, dankzij de unieke index. Bij het aanzetten komt de
  momentopname van alle actieve taken in `vacation_frozen`.
- **Einddatum wijzigen** (`update_vacation`): `until` wijzigen (op of na
  vandaag én de startdag) of wissen.
- **Einde** (`end_vacation`): resume = de dag van terugkomst (handmatig:
  vandaag); dagen = resume − `start_date`. De eerste schrijfactie is de
  bewaking (`ended_on` alleen zetten als hij nog leeg is), zodat een
  tweede einde — dubbele tik, schakelaar en panel tegelijk, de nachtjob
  ernaast — een fout geeft en niets nog eens opschuift. Per actieve taak
  (`scheduling.shift_after_vacation`):
  - een vakantie van nul dagen (aan en uit op dezelfde dag) verschuift
    niets; per ongeluk aan-uit tikken wist zo geen achterstand;
  - `interval`, met `next_due` nog gelijk aan de momentopname:
    `next_due` + dagen — de taak staat er bij terugkomst precies zo voor als
    bij vertrek, ook een achterstand blijft even groot;
  - `interval`, tijdens de vakantie nieuw, bewerkt naar een andere datum,
    teruggezet uit het archief of teruggedraaid: de laatste van `next_due`
    en resume — wat tijdens de vakantie "nu" werd, is bij terugkomst aan de
    beurt, een bewust gekozen latere datum blijft;
  - kalendertypen (`daily`, `weekly`, `monthly`, `yearly`): ligt `next_due`
    vóór resume, dan de eerste geplande keer op of na resume (dezelfde
    semantiek als bij een nieuwe taak); anders ongewijzigd. Een
    kalenderachterstand van vóór de vakantie vervalt bewust.

  De beurt (`rotation_index`) blijft staan; gearchiveerde taken schuiven
  niet. De momentopname gaat daarna weg.
- **Automatisch einde** (`end_due_vacation`): een vakantie met een `until`
  die vóór vandaag ligt, eindigt met resume = `until` + 1 — ook als HA
  dagen uit stond; de dagen daarna waren gewone tijd, en de rol die erop
  volgt haalt ze in. Om 03:00 vóór de rol en bij het opstarten (zie
  Scheduler).

Tijdens de vakantie weigert de datalaag zelf, binnen de
schrijftransactie, met `VacationActiveError` ("Vakantiemodus staat aan;
afvinken en overslaan kan weer na de vakantie."): afvinken (ook een
deelstap of tik), overslaan, snoozen (beide modi), een overslag
terugdraaien en een voltooiing ongedaan maken (undo). Zo krijgt elk pad —
WS, service, "Klaar"-knop — hetzelfde gedrag. Een overslag van vóór een
vakantie kan ook ná de vakantie niet meer terug (anders kwam een bewust
vervallen kalenderachterstand terug); `can_revert` volgt. Een vakantie van
nul dagen telt daarbij niet: die heeft niets stilgezet. De nachtelijke rol
(`roll_all_forward`) doet niets; de vakantiecheck en de rol staan in één
schrijftransactie, zodat een vakantie die precies tijdens de rol aangaat er
helemaal vóór of helemaal ná valt. Niet geblokkeerd: `revert_completion` en
beheer (taken en personen opslaan, verwijderen, terugzetten) — datums die
daardoor tijdens de vakantie ontstaan, vangt de momentopname op (terugzetten
uit het archief haalt de taak uit de momentopname: de verse datum is een
nieuwe start). De undo-buffer wordt bij het aanzetten geleegd en kan
tijdens de vakantie niet opnieuw vullen.

Aanzetten, wijzigen en beëindigen lezen en schrijven in één
schrijftransactie (`BEGIN IMMEDIATE`), net als afvinken en overslaan: een
afvinktik van een ander apparaat valt helemaal vóór of helemaal ná het
aanzetten. Of een vakantie ná een overslag is aangezet, wordt op tijdstip
vergeleken (`julianday()` op `created_at` en `skipped_at`), niet als
string.

Streaks: een week die (deels) in een vakantie viel, is neutraal — hij
verlengt de streak niet en breekt hem niet, ook niet als er voltooiingen in
staan (`vacation_weeks`; een beëindigde vakantie beslaat `start_date` tot
en met de dag vóór `ended_on`, een actieve tot en met vandaag, of tot en
met `until` als die eerder ligt; aan en uit op dezelfde dag maakt geen week
neutraal).
Ranglijst, weektotalen en weekhistorie blijven gewoon wat er gedaan is.

## WebSocket-API (`websocket.py`, `vacation.py`)

Vijftien commando's onder `chores_manager/*`, standaard-auth (geen admin):
`state`, `complete`, `undo`, `chore/save`, `chore/delete`, `chore/snooze`,
`chore/restore` (gearchiveerde taak terug, met verse vervaldatum),
`chore/skip`, `skip/revert`, `assignee/save`, `assignee/delete`,
`vacation/start`, `vacation/update`, `vacation/end`, `subscribe`. De drie
vakantiecommando's en hun kernen staan in `vacation.py`; `websocket.py`
registreert ze mee.
Mutaties sturen `SIGNAL_UPDATED` over de dispatcher; `subscribe`-abonnees
krijgen een event met alleen de reden en halen zelf verse staat op via
`state`.

- `state` geeft naast taken, personen, ranglijst en `feed` (alleen
  voltooiingen; Vandaag gebruikt hem zo) sinds v2.5 ook `skips` (het
  overslaglog, nieuwste eerst, maximaal honderd, met `can_revert` per regel)
  en `activity_since`: het tijdstip vanaf waar de gemengde tijdlijn van
  voltooiingen en overslagen compleet is, of `null`. Activiteit laat oudere
  regels weg, zodat er geen gat in de menging zit. Sinds v2.6 ook
  `vacation`: `{active: true, start_date, until}` van de lopende vakantie,
  of `null`. De taken houden tijdens de vakantie hun echte velden (Alles
  toont de huidige, nog niet verschoven datum).
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
  `nothing_to_undo` (buffer leeg of verlopen), `invalid_input` (een
  overslag die niet meer terug kan, of een voltooiing waarna de taak via
  `chore/snooze` 'skip' is overgeslagen; de buffer vervalt dan) en
  `vacation_active`. Die laatste komt in de praktijk alleen voor bij een
  undo die al liep op het moment dat de vakantie aanging: het aanzetten
  leegt de buffer, en de datalaag weigert het terugzetten tijdens de
  vakantie ook zelf.
- `vacation/start` — optioneel `until` (`JJJJ-MM-DD` of `null`);
  resultaat `{vacation}` (de vorm uit `state`). Leegt de undo-buffer.
- `vacation/update` — `until` (verplicht; `null` wist de einddatum);
  resultaat `{vacation}`.
- `vacation/end` — zonder velden; resume is vandaag. Resultaat
  `{ended_on, days, changed}`.

  Alle drie strikt (het panel wil de fout zien): al aan, al uit of een
  `until` in het verleden geeft `invalid_input`. Signaal met reason
  `vacation`.

Een weigering uit de datalaag komt als `invalid_input` met de Nederlandse
reden terug, in een service als `ServiceValidationError` — nooit als kale
exceptie. De uitzondering: tijdens de vakantiemodus geven `complete`,
`chore/skip`, `skip/revert` en `chore/snooze` de eigen foutcode
`vacation_active`.

## Sensor (`sensor.py`)

`sensor.chores_overview` — state = openstaande taken vandaag (due +
achterstallig); tijdens de vakantiemodus 0. Geen polling: updates via de
dispatcher. Het unique_id is dat van de oude 1.x-sensor, zodat de entiteit
dezelfde naam behield.

Attributen, gedocumenteerd voor Lovelace-gebruik:

- `due_today`, `overdue`, `completed_today`, `week_minutes_total` — tellers
  (tijdens de vakantiemodus zijn `due_today` en `overdue` 0; wat er gedaan
  is, telt gewoon);
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
  `chores_manager.revert_skip` aan;
- `vacation` (sinds v2.6) — de lopende vakantie in dezelfde vorm als in de
  WS-state: `{active: true, start_date, until}` (`until` is `null` bij een
  open einde), of `null` als de vakantiemodus uitstaat. Tijdens de vakantie
  is `tasks_today` leeg; `persons`, `recent_completions` en `recent_skips`
  blijven gewoon gevuld.

## Schakelaar (`switch.py`, sinds v2.6)

`switch.chores_vakantiemodus` (naam "Chores Vakantiemodus", icoon
`mdi:palm-tree`) — aan = de vakantiemodus staat aan. Attributen
`start_date` en `until` (beide `null` als hij uitstaat). Geen polling: de
schakelaar leest zijn stand bij elk dispatchersignaal opnieuw uit de
database (in de executor), dus hij volgt ook een vakantie die via het
panel, een service of het automatische einde wijzigt.

Aanzetten start een vakantie zonder einddatum, uitzetten beëindigt hem met
vandaag als dag van terugkomst. Net als de services idempotent: aanzetten
terwijl hij al aanstaat of uitzetten terwijl hij al uitstaat doet niets.
Na het schakelen (ook na een weigering) leest de schakelaar zijn stand
meteen zelf opnieuw, vóórdat `switch.turn_on`/`turn_off` terugkeert: een
script dat direct daarna de stand controleert of togglet, ziet al de
nieuwe stand.

## Scheduler

Dagelijks 03:00 lokale tijd, in twee stappen die elkaar niet tegenhouden
(elk met een eigen foutafhandeling):

1. een verlopen vakantie beëindigen (`until` vóór vandaag; resume =
   `until` + 1, zie Vakantiemodus), met een eigen dispatchersignaal;
2. `roll_forward` over alle taken, daarna een dispatchersignaal. Tijdens
   de vakantiemodus verschuift de rol niets.

Hetzelfde einde wordt bij het opstarten van de integratie gecontroleerd
(HA kan over de einddatum heen uit hebben gestaan); is er daarbij een
vakantie beëindigd, dan draait meteen ook de rol, anders bleven
kalendertaken tot 03:00 op een verouderde achterstand staan. Een fout
daarbij wordt gelogd en houdt het opstarten niet tegen. Handmatig
triggeren kan met de service `chores_manager.roll_forward` (dezelfde twee
stappen).

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

Tijdens de vakantiemodus gaat er niets uit: de ochtendmelding heeft niets
te melden (de meldingsdata zijn dan leeg) en de weeksamenvatting slaat
over. Een tik op "Klaar" in een oudere melding vinkt niets af en wordt
alleen op info-niveau gelogd; die melding zelf blijft op de telefoon staan.

Tijden staan als constanten in `const.py` (fase 5 kan ze instelbaar maken).

## Frontend (`www/chores-panel/`)

Eén web component `<chores-panel>` (shadow DOM), als panel op `/taken` en als
Lovelace-kaart. Vier weergaven achter tabs, actieve weergave in de URL-hash.
Kernmechanieken:

- één toestandsobject (`core/store.js`) met subscribe; elke set() is één
  render, behalve als er een formulier openstaat, of bij een stille set
  (`{quiet: true}`): die werkt alleen de toestand bij, voor invoer die de
  DOM al toont (het concept in het vakantiedatumveld);
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
- vakantiemodus (sinds v2.6): bovenaan Beheer een sectie "Vakantie" met een
  schakelaar "Vakantiemodus", een optioneel datumveld "Tot en met" (met
  "Datum opslaan" zolang een gekozen datum afwijkt van een lopende
  vakantie) en een uitleg wat er bij terugkomst gebeurt. Een gekozen datum
  die nog niet bij de server ligt, staat in de store als `vacationDraft`.
  Uitzetten meldt hoeveel taken er verschoven. Vandaag toont tijdens de
  vakantie een rustige banner ("Vakantiemodus sinds 3 oktober — tot en met
  17 oktober") in plaats van taken; bijdragebalk en laatste activiteit
  blijven. Alles toont één sectie "Staat stil", op datum, met gedimde
  kaarten zonder afvinkknoppen en het label "staat stil";
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

- `chores_manager.roll_forward` — de nachtelijke rol nu (eerst een
  verlopen vakantie beëindigen, dan de rol; zie Scheduler). Tijdens de
  vakantiemodus verschuift er niets.
- `chores_manager.send_daily_summary` — de ochtendmelding nu.
- `chores_manager.send_weekly_summary` — de weeksamenvatting nu. Beide
  meldingsservices versturen tijdens de vakantiemodus niets.
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
- `chores_manager.start_vacation` (sinds v2.6) — vakantiemodus aan, met
  vandaag als startdag. Veld: `until` (optioneel, een datum: de laatste
  vakantiedag, vandaag of later; leeg of `null` = geen einddatum, handig
  voor een getemplatete automatisering). Idempotent voor automatiseringen: staat
  de modus al aan, dan past een opgegeven `until` de einddatum aan en
  gebeurt er verder niets. Aanzetten leegt de undo-buffer. Dunne laag om
  `async_start_vacation` in `vacation.py`, de kern van `vacation/start`;
  signaal met reason `vacation`.
- `chores_manager.end_vacation` (sinds v2.6) — vakantiemodus uit, met
  vandaag als dag van terugkomst; de taken schuiven op (zie
  Vakantiemodus). Zonder velden. Staat de modus al uit, dan gebeurt er
  niets (info-log). Dunne laag om `async_end_vacation`, de kern van
  `vacation/end`.

Tijdens de vakantiemodus weigeren `mark_done`, `skip` en `revert_skip` met
een `ServiceValidationError` ("Vakantiemodus staat aan; …"); `undo_last`
heeft dan niets terug te draaien, `revert_completion` werkt gewoon.

Meer services zijn er niet; alle overige bediening loopt via de
WebSocket-API — `mark_done`, `undo_last`, `revert_completion`, `skip` en
`revert_skip` zijn de uitzonderingen, omdat Lovelace alleen services kan
aanroepen, en `start_vacation` en `end_vacation`, voor automatiseringen
(bijvoorbeeld bij vertrek en thuiskomst). De tijdelijke `seed` is in fase 5
verwijderd, met `seed.py` erbij.
