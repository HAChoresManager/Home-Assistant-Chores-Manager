# Chores Manager — Refactorplan

Status: vastgesteld 27-07-2026. Dit document is de bron van waarheid voor de
refactor. Wijk er niet van af zonder het bij te werken.

---

## 1. Doel

Een systeem dat helpt huishoudelijke taken daadwerkelijk te dóen. Concreet:

1. **Overzicht** — in één oogopslag zien wat er nu moet, zonder ruis.
2. **Zichtbaarheid** — laten zien hoeveel tijd ieder in het huishouden steekt.
3. **Motivatie** — die zichtbaarheid is zowel bewijs van eigen werk als een doel
   om in te halen. Wekelijks resetten zodat het relevant blijft.
4. **Herinnering** — het systeem tikt je op de schouder; je hoeft er niet aan te
   denken.

**Tijd is de eenheid.** Niet het aantal afgevinkte taakjes, maar de minuten die
iemand bijdraagt. Een vriezer ontdooien (30 min) telt zwaarder dan de vaatwasser
uitruimen (20 min), en dat hoort zo.

---

## 2. Architectuurbesluiten

### 2.1 Geen build-stap, geen externe dependencies

**Besluit:** vanilla ES-modules, Web Components, gewone CSS. Geen React, geen
Node, geen npm, geen CDN.

**Waarom niet React:** via een CDN is het een externe afhankelijkheid (afgewezen
randvoorwaarde). Lokaal meeleveren betekent 140 kB vendored code plus — zonder
build-stap — `React.createElement()` voor elk element, wat de huidige
onleesbaarheid veroorzaakt. Voor een app met ~20 taken en 4 personen is React
overhead zonder opbrengst.

**Wat er voor in de plaats komt:**

- Eén custom element `<chores-panel>` als entrypoint.
- Rendering via template literals met een `html`-helper die escapet.
- Event delegation op containerniveau, zodat opnieuw renderen geen listeners
  sloopt.
- Gerichte re-render per sectie, niet de hele boom.

Dit is precies wat de HA-frontend zelf doet (web components), dus het sluit aan
in plaats van er bovenop te liggen.

### 2.2 Native panel in plaats van iframe

**Besluit:** `panel_custom` met `module_url` en `embed_iframe: false`.

**Er zijn nu twee geneste iframes, niet één.** Beide moeten weg:

1. **De buitenste.** `panel.py` registreert het panel met `embed_iframe: True`
   (regel 28), dus HA zet er zelf een iframe omheen.
2. **De binnenste.** `chores-dashboard.js` — het webcomponent dat als `js_url`
   geregistreerd staat — bouwt in zijn `connectedCallback` een eigen
   `<iframe src="/local/chores-dashboard/index.html?v=${timestamp}">` (regels 11,
   17 en 77-83), inclusief een `Date.now()`-cachebuster.

`chores-dashboard.js` verdwijnt dus in zijn geheel en wordt vervangen door
`chores-panel.js`, dat rechtstreeks in de HA-DOM rendert. Dat het niet op de
oorspronkelijke verwijderlijst stond, was een omissie; zie §7.

**Gevolgen — allemaal winst:**

| Nu | Straks |
|---|---|
| Long-lived admin-token, localStorage, URL-parameters | HA injecteert `hass`; geen tokens |
| `auth-helper.js` (272 regels) | Weg |
| `theme-integration.js` + eigen theme-editor | Weg; HA-CSS-variabelen worden geërfd |
| Wit vlak in een donker thema | Frosted Glass Dark werkt vanzelf |
| Twee geneste iframes | Geen iframe |
| React + Tailwind vanaf CDN (`unpkg.com`, `cdn.tailwindcss.com`) | Geen externe requests |
| REST-calls met `Bearer`-header | `hass.connection` (WebSocket, al open) |

Het wordt een eigen item in de zijbalk: een losstaande app, geen Lovelace-kaarten.

### 2.3 WebSocket in plaats van een gepollde sensor

**Besluit:** de frontend praat via WS-commando's; de sensor wordt afgeslankt tot
een samenvatting voor HA-automations en -kaarten.

**Waarom:** de sensor pollt nu elke 30 seconden en leest daarbij de volledige
database plus streak-berekeningen die per persoon tot 30 losse queries doen — op
een container met 1 CPU. Push in plaats van poll haalt dat weg én maakt de
`homeassistant.update_entity`-automation met de 2-secondenvertraging overbodig.

**Commando's:**

| Commando | Doel |
|---|---|
| `chores_manager/state` | Volledige begintoestand: taken, personen, ranglijst, feed |
| `chores_manager/complete` | Taak of deeltaak afvinken |
| `chores_manager/undo` | Laatste voltooiing terugdraaien (binnen 5 min) |
| `chores_manager/chore/save` | Taak aanmaken of bijwerken |
| `chores_manager/chore/delete` | Taak verwijderen |
| `chores_manager/chore/snooze` | Naar morgen of naar volgende geplande keer |
| `chores_manager/assignee/save` | Persoon aanmaken of bijwerken |
| `chores_manager/assignee/delete` | Persoon verwijderen |
| `chores_manager/subscribe` | Abonneren op wijzigingen (push) |

De HA-services (`chores_manager.mark_done` etc.) blijven bestaan voor gebruik in
automations en voor de actieknop in notificaties.

### 2.4 Sensor

`sensor.chores_overview` wordt:

- **state** = `due_today` + `overdue`: alles wat openstaat. (De oude sensor
  toonde ten onrechte "vandaag afgerond", terwijl het icoon en de naam iets
  anders beloven.) Achterstallig werk verdwijnt niet vanzelf, dus het telt
  mee. Door het doorrollen uit §4.2 staat er per taak hoogstens één
  openstaande instantie, dus de teller kan nooit oplopen tot een onbruikbaar
  getal.
- **attributen** = alleen een samenvatting: `due_today`, `overdue`,
  `completed_today`, `week_minutes_total`, en per persoon `{minutes, tasks,
  streak}`. Geen volledige takenlijst meer.

Dezelfde semantiek geldt op het scherm Vandaag: de kop toont het totaal
("8 taken"), daaronder twee secties — wat vandaag gepland staat en wat
achterloopt. Niet twee losse tellers bovenaan; dat suggereert twee lijstjes
terwijl het één stapel werk is.

Voor Lovelace komt er daarnaast één sensor per persoon
(`sensor.chores_bijdrage_martijn`, state = minuten deze week) zodat je er
gewone HA-kaarten en grafieken op kunt bouwen zonder templates.

---

## 3. Datamodel

De bestaande data heeft geen waarde en wordt niet gemigreerd. Verse database,
schoon schema. Maak vóór het weggooien wel een dump ter referentie.

### 3.1 `assignees`

```sql
CREATE TABLE assignees (
    id                     TEXT PRIMARY KEY,   -- stabiele slug, verandert nooit
    name                   TEXT NOT NULL,      -- weergavenaam, mag wijzigen
    color                  TEXT NOT NULL,
    ha_user_id             TEXT,               -- koppeling voor notificaties
    notify_service         TEXT,               -- bv. notify.mobile_app_martijn
    active                 INTEGER NOT NULL DEFAULT 1,
    include_in_leaderboard INTEGER NOT NULL DEFAULT 1,
    sort_order             INTEGER NOT NULL DEFAULT 0
);
```

Twee dingen die nu misgaan en hier opgelost worden:

- **Voltooiingen verwijzen naar `id`, niet naar `name`.** Nu staat er
  `assigned_to: 'Laura'` in de takentabel; hernoem je iemand, dan raakt de
  historie los.
- **"Wie kan" is geen persoon.** Dat wordt een toewijzingsregel
  (`assignment_type = 'anyone'`). Als nep-gebruiker vervuilde het de statistieken
  — twee van de acht taken telden nergens mee omdat "Wie kan" eruit gefilterd
  werd.

`include_in_leaderboard` bestaat zodat een kind wel taken en een eigen streak kan
hebben zonder in de tijdsranglijst van volwassenen mee te doen.

### 3.2 `chores`

```sql
CREATE TABLE chores (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    icon             TEXT NOT NULL DEFAULT '📋',
    active           INTEGER NOT NULL DEFAULT 1,

    -- planning
    schedule_type    TEXT NOT NULL,               -- zie 4.1
    schedule_config  TEXT NOT NULL DEFAULT '{}',  -- JSON, vorm hangt af van type
    next_due         DATE NOT NULL,

    -- inspanning en urgentie
    duration_minutes INTEGER NOT NULL DEFAULT 15,
    priority         TEXT NOT NULL DEFAULT 'normal',  -- low|normal|high|critical

    -- toewijzing
    assignment_type  TEXT NOT NULL DEFAULT 'anyone',  -- fixed|rotating|anyone
    assigned_to      TEXT REFERENCES assignees(id),   -- alleen bij 'fixed'
    rotation         TEXT NOT NULL DEFAULT '[]',      -- JSON: ["martijn","laura"]
    rotation_index   INTEGER NOT NULL DEFAULT 0,

    -- deeltaken
    subtask_mode     TEXT,        -- NULL | 'checklist' | 'counter'
    subtask_target   INTEGER,     -- alleen bij 'counter': hoeveel er nodig zijn

    created_at       TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP NOT NULL
);
```

**De grootste verbetering zit in `schedule_type` + `schedule_config`.** Nu zijn er
zes overlappende kolommen (`frequency_type`, `frequency_days`, `frequency_times`,
`weekday`, `monthday`, `active_days`) die elkaar tegenspreken. "Planten water
geven" staat op *1× per week*, *zondag* én *woensdag en zondag* tegelijk; de code
gebruikt alleen de laatste. Straks is er per type precies één configuratievorm en
geen dubbelingen.

### 3.3 `subtasks`

```sql
CREATE TABLE subtasks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);
```

Alleen nodig voor `subtask_mode = 'checklist'`. Bij `'counter'` is er niets om op
te slaan — je telt voltooiingen in de lopende periode tegen `subtask_target`.

### 3.4 `completions`

```sql
CREATE TABLE completions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id           TEXT NOT NULL REFERENCES chores(id),
    subtask_id         INTEGER REFERENCES subtasks(id),
    is_full_completion INTEGER NOT NULL DEFAULT 1,
    assignee_id        TEXT NOT NULL REFERENCES assignees(id),
    completed_at       TIMESTAMP NOT NULL,
    minutes            INTEGER NOT NULL,   -- momentopname, geen verwijzing
    note               TEXT
);
```

**`minutes` wordt vastgelegd op het moment van afvinken.** Pas je later de duur
van een taak aan, dan verandert de geschiedenis niet. Zonder dat is een ranglijst
niet geloofwaardig.

**Minuten tellen nooit dubbel.** De som over alle regels van een taakinstantie is
altijd gelijk aan `duration_minutes`:

| Situatie | Regels | Minuten per regel |
|---|---|---|
| Taak in één keer gedaan | 1 (`is_full = 1`) | `duration_minutes` |
| Checklist van 4 stappen | 4, laatste `is_full = 1` | `duration / 4` |
| Counter, 8 wasjes | 8, achtste `is_full = 1` | `duration / 8` |

Indexen op `(completed_at)`, `(assignee_id, completed_at)` en `(chore_id)`.

---

## 4. Planning en achterstand

### 4.1 Vijf planningstypen

| `schedule_type` | `schedule_config` | Voorbeeld |
|---|---|---|
| `daily` | `{"weekdays": [1,2,3,4,5,6,7]}` | Was draaien (elke dag), lunchtrommels (1–5) |
| `weekly` | `{"weekday": 3}` | Boodschappenlijst op woensdag |
| `monthly` | `{"monthday": 15}` | Maandelijkse klus |
| `interval` | `{"days": 180}` | Vriezer ontdooien |
| `yearly` | `{"month": 6, "day": 15}` | Jaarlijkse klus |

ISO-weekdagen: 1 = maandag, 7 = zondag. Alle acht bestaande taken passen hierin;
"planten water geven" wordt `daily` met `weekdays: [3, 7]`.

### 4.2 Achterstand loopt niet meer op

Dit is de belangrijkste inhoudelijke fix van het hele project.

**Nu:** `next_due = last_done + interval`, en verder niets. "Was draaien" is
dagelijks, voor het laatst gedaan op 18 oktober, en staat dus op **281 dagen te
laat**. Dat is geen informatie — het betekent dat je hem 281 keer hebt
overgeslagen. Alles is permanent rood en sorteren op vervaldatum sorteert op hoe
lang geleden je iets hebt losgelaten.

**Straks:** `next_due` is opgeslagen en rolt vooruit.

- Bij afvinken: `next_due` = eerstvolgende geplande keer ná vandaag —
  ongeacht wie de taak deed; wie de credits krijgt is een los gegeven
  (§4.4, §5.1).
- Elke nacht om 03:00: staat `next_due` in het verleden, dan wordt hij
  doorgerold naar de **meest recente** geplande keer op of vóór vandaag.

Gevolg per type:

- Dagelijkse taak, maanden niet gedaan → staat op **vandaag**. Niet 281 dagen te
  laat.
- Wekelijks op woensdag, vandaag is vrijdag → **2 dagen te laat**.
- Halfjaarlijks, 100 dagen over tijd → **100 dagen te laat**. Dat klopt en is
  betekenisvol.

Optioneel `missed_count` bijhouden voor het beheerscherm, buiten het dagelijkse
beeld.

### 4.3 Prioriteit doet iets

Je wilde prioriteit houden omdat sommige taken laten liggen grotere problemen
geeft. Dan moet het ook gedrag hebben in plaats van alleen een kleurtje:
prioriteit bepaalt hoe snel iets escaleert.

| Prioriteit | Coulance | Gedrag |
|---|---|---|
| `low` | 7 dagen | Rustig; pas na een week dringend |
| `normal` | 3 dagen | Standaard |
| `high` | 1 dag | Dag 1 gedempt, dag 2 dringend |
| `critical` | 0 dagen | Dringend zodra hij verloopt |

Visueel: neutraal tot de vervaldatum, gedempt gemarkeerd binnen de coulance,
nadrukkelijk daarna. Dringend betekent: méér dagen over tijd dan de coulance.
Met coulance 0 bestaat de gedempte toestand niet — dat is precies het verschil
tussen `critical` en `high`. Rood is dus zeldzaam en betekent iets — in plaats
van de huidige muur waarin 8 van de 8 taken rood zijn.

**Volgorde binnen de achterstand: cyclusfractie, geen absolute dagen.** Zes
dagen te laat op een weektaak (6/7 = 0,86) is proportioneel erger dan 115
dagen op een halfjaartaak (115/180 = 0,64); sorteren op dagen zet ze verkeerd
om. De achterstand sorteert daarom op achterstand gedeeld door cycluslengte
(`cycle_fraction` in de calculator). De urgentiedrempels hierboven blijven op
dagen — dit stuurt alleen de volgorde.

**Boven de 30 dagen toont het etiket een maand in plaats van een getal**:
"had in april gemoeten" in plaats van "115 dagen te laat". Grote getallen
lezen als verwijt.

### 4.4 Toewijzing

- `fixed` — altijd dezelfde persoon (`assigned_to`).
- `rotating` — `rotation` is een lijst; wie aan de beurt is, is
  `rotation[rotation_index]`. Werkt voor twee personen én meer.
- `anyone` — niemand specifiek; iedereen kan afvinken.

**Wie de credits krijgt staat los van wie de taak op zijn naam heeft.** Het
persoonschipje op de kaart staat standaard op de toewijzing en is tikbaar om
iemand anders te kiezen; de minuten (§5.1) gaan naar wie het écht deed. Bij
deeltaken en tellers geldt dat per tik — elke completions-regel draagt zijn
eigen `assignee_id`.

**De beurt schuift door vanaf wie de taak écht deed**, niet vanaf wie aan de
beurt stond. Staat Martijn aan de beurt en doet Laura het, dan is Martijn
opnieuw aan de beurt — niet Laura, die zou twee keer achter elkaar moeten.
Doet iemand het die niet in de rotatielijst staat, dan blijft de beurt staan
waar hij stond.

Op de kaart staat bij `rotating` zichtbaar wie aan de beurt is. Dat is nu de
onduidelijkste plek in het formulier: `alternate_with` is bij vijf taken
gevuld, maar bij vier daarvan staat `use_alternating` op 0, dus daar doet de
instelling niets. Alleen de AH-boodschappenlijst roteert echt (Martijn ↔
Laura); zie `docs/legacy-state.yaml` en `tests/test_legacy_tasks.py`.

### 4.5 Deeltaken

Twee smaken, allebei nodig:

**`counter`** — "de was doen": één taak die uit ~8 wasjes bestaat. Je tikt af tot
het doel bereikt is; dan is de hoofdtaak voor die periode klaar en hoef je er niet
meer aan te denken. De kaart toont voortgang (`5 / 8`) en een balk.

**`checklist`** — genoemde stappen die allemaal moeten. Het afzuigkapfilter is
hier een goed voorbeeld: de beschrijving bevat nu vier stappen als platte tekst
die net zo goed afvinkbare deeltaken kunnen zijn.

In beide gevallen mag de laatste deeltaak de hoofdtaak afronden en rolt
`next_due` door. Dat "het is nu even geregeld"-moment is de beloning; de UI moet
dat markeren met een duidelijke bevestiging.

---

## 5. Motivatielaag

### 5.1 De bijdragebalk

Bovenaan het scherm, boven de takenlijst: één horizontale gestapelde balk met de
totale huishoudtijd van deze week, verdeeld in segmenten per persoon in hun eigen
kleur, breedte naar rato.

Dit is het enige opvallende element van het ontwerp en het doet drie dingen
tegelijk:

- **Bewijs** — je eigen segment is zichtbaar werk.
- **Doel** — je ziet meteen of iemand voorloopt.
- **Samen** — de balk als geheel groeit, dus het is niet puur een wedstrijd.
  Zonder dat totaal wordt het al snel scorebordgedrag in plaats van samenwerking.

Eronder een rij per persoon, gesorteerd op minuten aflopend:

```
Laura       3u 10m    12 taken    🔥 7 weken
Martijn     2u 45m     9 taken    🔥 7 weken
```

De minuten tellen voor wie de taak écht deed (het chipje op de kaart, §4.4) —
niet voor wie hem op zijn naam had. Anders klopt de ranglijst niet, en tijd is
de eenheid van dit hele systeem. De balk telt iedereen mee (ook wie buiten de
ranglijst staat: het samen-element), de rijen tonen alleen personen met
`include_in_leaderboard = 1`. De weekhistorie op het Activiteit-scherm toont
wél iedereen die iets deed — dat zijn feiten, geen wedstrijd.

### 5.2 Periode

Maandag 00:00 tot en met zondag 23:59. **Er is geen aparte weektabel en geen
geplande reset-schrijfactie** — alles wordt afgeleid uit `completions`:
weekstand, minuten, taken en streak. Twee redenen om dat zo vast te leggen:

1. De minuten zijn al bij het afvinken bevroren (§3.4, `minutes` is een
   momentopname), dus er valt bij een weekwissel niets meer te bevriezen.
2. Een tabel die door een geplande taak gevuld wordt, mist een week zodra HA
   zondagavond uit staat. Een afleiding uit `completions` kan niet
   achterlopen.

De "reset" is dus niets meer dan de weekgrens zelf; de zondagavondsamenvatting
(§6) leest dezelfde afleiding.

### 5.3 Streak

**Aantal opeenvolgende weken waarin je minstens één taak hebt afgerond.**

Bewust wekelijks en niet dagelijks. De huidige dagelijkse streak staat op 0 voor
iedereen en dat blijft zo: één dag missen wist alles. Dat straft in plaats van
motiveert. "Zeven weken op rij" is haalbaar en blijft betekenen dat je het
volhoudt.

**Afleiding** (uit `completions`, geen aparte opslag): neem per persoon de
weken (maandag als start, §5.2) waarin minstens één voltooiing staat. Tel
terug vanaf de huidige week: elke aaneengesloten week met een voltooiing telt
mee. Is de huidige week nog leeg, dan begint het tellen bij vorige week — een
week die nog bezig is kan de streak niet breken; hij breekt pas als een week
écht leeg is afgesloten.

### 5.4 Activiteitenfeed

Chronologisch: wie deed wat wanneer, met tijdsduur. Dit ontbreekt nu volledig in
de interface, terwijl het letterlijk de kern van je doel is — er staan nu alleen
drie tellers en een rode lijst met wat je *niet* gedaan hebt.

Op het hoofdscherm de laatste paar regels; het volledige overzicht op het
tabblad Activiteit.

---

## 6. Herinneringen

De hele notificatielaag is nu code zonder aansluiting: `notify_when_due` staat op
0 bij alle acht taken, `ha_user_id` is `null` bij alle vier de personen, en de
enige automation die er is triggert op een entiteit die niet bestaat.

**Eerst koppelen, dan bouwen.** Zonder `ha_user_id` en `notify_service` per
persoon is er niets om naartoe te sturen.

| Wanneer | Wat |
|---|---|
| 03:00 dagelijks | Vervaldata doorrollen (4.2) |
| 08:00 dagelijks | Per persoon: wat er vandaag voor jou is. Alleen als er iets is. |
| Zondag 20:00 | Weeksamenvatting met de uitslag en de streaks |

Notificaties zijn **actionable**: een knop "Klaar" in de melding vinkt de taak af
via `mobile_app_notification_action` → `chores_manager.mark_done`. Dat is wat
"makkelijk te beheren" in de praktijk betekent — afvinken zonder de app te openen.

Aan/uit per persoon, niet per taak. De huidige `notify_when_due`-vlag per taak is
een instelling die niemand ooit aanzet.

---

## 7. Bestandsstructuur

Alles onder de 600 regels. Bij overschrijding: splitsen.

### Backend

```
custom_components/chores_manager/
├── __init__.py           # setup, config entry, services seed/roll_forward
├── manifest.json
├── const.py
├── config_flow.py        # één instantie, niets in te stellen
├── panel.py              # panel_custom, module_url, geen iframe; versie in pad
├── websocket.py          # WS-commando's (zie 2.3)
├── sensor.py             # overzichtssensor (§2.4), push via dispatcher
├── scheduler.py          # nachtelijke rol; meldingen (§6) komen in fase 4
├── seed.py               # TIJDELIJK; vervalt in fase 5
├── notify.py             # fase 4: actionable notificaties
├── db/
│   ├── __init__.py
│   ├── schema.py         # DDL op één plek
│   ├── connection.py
│   ├── errors.py
│   ├── chores.py
│   ├── assignees.py
│   ├── completions.py    # voltooiingen, ranglijst, feed, streaks
│   ├── subtasks.py
│   └── overview.py       # samengestelde leesweergaven voor sensor en WS
└── scheduling/
    ├── __init__.py
    ├── types.py          # definities van de vijf planningstypen
    └── calculator.py     # next_due, achterstand, urgentie, rotatie
```

Geen `migrations.py` meer in de boom: v2 heeft een vers schema; migraties
komen pas terug zodra dat schema ná ingebruikname wijzigt. Geen los
`services.py`: de twee overgebleven services (seed, roll_forward) zijn klein
genoeg voor `__init__.py`; fase 4 voegt `notify.py` toe voor de meldingen.

**Tussentoestand (2b–3b): de v2-datalaag heette `store/`** omdat de oude app
het oude `db/`-pakket nog bezette. **Uitgevoerd in 3c (28-07-2026):** het oude
`db/` is verwijderd en `store/` heeft met een `git mv` de naam `db/`
overgenomen; alle imports en tests zijn omgelegd.

### Frontend

```
www/chores-panel/
├── chores-panel.js       # entrypoint, definieert <chores-panel>, krijgt hass
├── core/
│   ├── api.js            # dunne laag over hass.connection
│   ├── store.js          # één toestandsobject + subscribe
│   ├── html.js           # template literals met escaping
│   ├── format.js         # datums, duur, Nederlandse teksten
│   └── theme.js          # themakeuze per apparaat (3c); HA-thema's, localStorage
├── views/
│   ├── today.js          # bijdragebalk + wat er nu moet
│   ├── tasks.js          # alle taken, gegroepeerd
│   ├── activity.js       # feed + weekhistorie
│   └── manage.js         # taken en personen beheren + sectie Weergave
├── components/
│   ├── task-card.js      # incl. deeltaakweergave (subtask-tracker is nooit los geworden)
│   ├── contribution-bar.js
│   └── task-form.js
├── styles.css
└── styles-views.css
```

Het panel wordt rechtstreeks uit `custom_components/` geserveerd — géén
`/local`, geen kopieerstap. Sinds 3c zit de versie in het statische pad
(`/chores_manager-panel-<versie>/`, bron: `PANEL_VERSION` in `panel.py`);
relatieve imports erven dat pad, dus per-import `?v=`-parameters bestaan niet
meer. Hetzelfde element werkt ook als Lovelace-kaart via de stabiele,
ongecachete resource-URL `/chores_manager-panel/chores-panel.js`
(`type: custom:chores-panel`). Zie `CLAUDE.md` voor de deploymentdiscipline.
De oude map `www/chores-dashboard/` is in 3c in zijn geheel verwijderd.

### Te verwijderen

**Uitgevoerd in fase 3c op 28-07-2026** — alles hieronder is verwijderd, plus
de rest van de oude app (`www/chores-dashboard/` volledig, `database.py`,
`schemas.py`, de oude `sensor.py`, de pakketten `services/`, `utils/` en het
oude `db/`, en de tokenmachinerie in `__init__.py`). De tabellen blijven staan
als historische inventarisatie. Terugvalpunt: `v1-final` op main.

Gecontroleerd tegen de repo op 27-07-2026. Alle onderstaande bestanden
bestonden daadwerkelijk.

**Backend**

| Bestand | Regels | Waarom |
|---|---:|---|
| `services.py` | 21 | Compatibiliteitsvorm; onbereikbaar door het gelijknamige pakket `services/` |
| `utils.py` | 399 | Onbereikbaar door het gelijknamige pakket `utils/` |
| `theme_service.py` | 104 | Eigen themasysteem |
| de `theme_settings`-tabel | — | Idem |

**Frontend**

| Bestand | Regels | Waarom |
|---|---:|---|
| `css/styles.css` | 881 | Wordt nergens geladen — geen `<link>` in `index.html`, geen import |
| `js/utils.js` | 386 | Wordt geladen, maar `window.choreUtils` wordt nergens gebruikt |
| `js/app-handlers.js` | 366 | Wordt geladen, maar `useEventHandlers` wordt nergens aangeroepen |
| `js/auth-helper.js` | 272 | Eigen authenticatie |
| `js/app-init.js` | 223 | Gaat op in `chores-panel.js` |
| `js/state/store.js` | 213 | Nooit geladen; vervangen door `core/store.js` |
| `js/app-state.js` | 135 | Wordt geladen, maar `useAppState` wordt nergens aangeroepen |
| `chores-dashboard.js` | 126 | Bouwde de binnenste iframe (§2.2) — **verwijderd op 28-07-2026**, samen met `panel.py` en de route `/chores`; zie hieronder |
| `js/theme-integration.js` | 70 | Nooit geladen; eigen themasysteem |
| `js/components/fallback.js` | 65 | Staat niet in de componentmanifest; nooit geladen |
| `js/components.js` | 37 | Nooit geladen |
| de map `js/api/` | 1428 | REST met bearer-tokens |

**Documentatie**

- `TECHNICAL_DESCRIPTION.md` — dubbel.

**Lovelace-resources — opgeruimd op 28-07-2026.** In HA stonden twee
resource-registraties (buiten de repo) die naar deze map wezen:
`/local/chores-dashboard/js/components.js` en
`/local/chores-dashboard/js/utils.js`, beide als JavaScript-module. Daardoor
werden die twee bestanden ook in het **buitenste** HA-document geladen, op elk
dashboard. Beide registraties zijn verwijderd; `js/components.js` en
`js/utils.js` kunnen dus zonder 404-risico geschrapt worden. Zie
`docs/legacy-notes.md` voor de correctie op de oorspronkelijke classificatie.

**De route `/chores` — verwijderd op 28-07-2026.** De panelroute was altijd al
kapot (zie `docs/legacy-notes.md`) en is niet gerepareerd maar geschrapt:
`panel.py` en `chores-dashboard.js` zijn weg, en de
`async_setup_panel`-aanroep is uit `__init__.py` gehaald.
`_setup_web_assets()` blijft wél bestaan — het Lovelace-dashboard
`/dashboard-chores/taken` serveert `/local/chores-dashboard/index.html` uit de
kopie die die functie maakt, en dat is tot fase 3 de enige ingang. Het nieuwe
panel van fase 3 krijgt een nieuw `panel.py` en wordt op **`/taken`**
geregistreerd, niet op `/chores`.

### `database.py` verhuist, het verdwijnt niet

**Achterhaald door 3c:** de geplande ontmanteling (functies verhuizen, acht
importplekken omleggen) is nooit los uitgevoerd — in plaats daarvan is
`database.py` op 28-07-2026 samen met al zijn afnemers (oude sensor,
`services/`, `utils/`) verwijderd. De analyse hieronder blijft staan als
verklaring waarom het bestand tot dat moment niet weg mocht.

`database.py` (384 regels) stond eerder op deze lijst. Dat was onjuist.

`database.py` en `db/` hebben **verschillende namen**, dus er is geen
pakketschaduwing zoals bij `services.py` en `utils.py`. `database.py` is een
levende facade over `db/` en wordt vanuit acht plekken geïmporteerd:

| Plek | Wat |
|---|---|
| `__init__.py:46` | `init_database`, `verify_database` bij setup |
| `sensor.py:15` | chore- en statistiekfuncties |
| `services/__init__.py:39` | `get_database_stats`, `vacuum_database`, `export_database_to_dict`, `import_database_from_dict` |
| `services/chore_services.py:17` | chorefuncties |
| `services/chore_services.py:249` | `get_ha_user_id_for_assignee` |
| `services/user_services.py:9` | `add_user`, `delete_user` |
| `services/notification_services.py:9` | notificatiefuncties |
| `utils/notifications.py:13` | `get_pending_notifications`, `mark_notifications_sent` |

Vier functies bestaan **alleen** in `database.py` en niet in `db/`:
`get_database_stats`, `vacuum_database`, `export_database_to_dict` en
`import_database_from_dict`. Die verhuizen naar `db/` — de eerste twee naar
`db/connection.py`, de laatste twee naar een nieuwe `db/backup.py`. Pas als alle
acht importplekken zijn omgelegd, gaat `database.py` weg. Dit is fase 2-werk;
zie §9.

### Derde naamconflict

Naast `services.py`/`services/` staat er ook `utils.py` naast `utils/`. Zelfde
mechanisme, zelfde gevolg: `utils.py` (399 regels) is onbereikbare code. Zie
`CLAUDE.md` voor de controle.

---

## 8. Ontwerprichting

**Native aanvoelen, niet opvallen.** De app leeft in Home Assistant, dus alle
kleuren en vormen komen uit HA's eigen CSS-variabelen: `--primary-text-color`,
`--secondary-text-color`, `--card-background-color`, `--ha-card-border-radius`,
`--divider-color`, `--primary-color`. Frosted Glass Dark werkt dan vanzelf, en
elk ander thema ook. Geen eigen palet, geen eigen thema-editor.

De enige plek waar het ontwerp een eigen stem heeft is de bijdragebalk. Daar mag
het opvallen; overal elders blijft het rustig. Persoonskleuren komen uit de
database en worden alleen daar en als accent op de kaart gebruikt.

**Telefoon eerst.** Dit is een huishoudapp; hij wordt op een telefoon gebruikt,
staand, vaak met één hand. Grote raakvlakken, één duidelijke primaire actie per
kaart (afvinken), bewerken achter een secundaire actie.

**Kwaliteitsondergrens:** werkt tot 360 px breed, zichtbare toetsenbordfocus,
`prefers-reduced-motion` gerespecteerd, geen layout shift bij laden.

**Taal en toon.** Nederlands, actieve werkwoorden, geen systeemjargon. Een knop
zegt wat er gebeurt: "Afvinken", niet "Bevestigen". De naam blijft gelijk door de
hele flow — wat "Afvinken" heet, geeft een melding "Afgevinkt". Lege schermen
zijn een uitnodiging, geen mededeling: niet "Geen taken gevonden" maar "Alles
gedaan deze week. Mooi werk."

---

## 9. Fasering

### Fase 0 — Vastleggen (½ dag)

- Git-tag `pre-refactor` op de huidige staat.
- `docs/legacy-state.yaml` als referentie van de huidige data. **Geen SQL-dump** —
  de database staat niet in de repo en de bestaande data wordt toch niet
  gemigreerd (§3); een leesbare YAML-momentopname is genoeg om later te kunnen
  nakijken hoe iets bedoeld was.
- `docs/legacy-notes.md` met de inventarisatie van de huidige codebase:
  regelaantallen, wat er bij het opstarten écht laadt, wat er alleen maar ligt, en
  de drie naamconflicten.
- Dit plan en `CLAUDE.md` in de repo.

**Klaar wanneer:** je kunt terug naar de oude situatie.

### Fase 1 — Quick wins op de bestaande app (1 uur)

Losstaand van de rest, zodat het ding bruikbaar is terwijl de refactor loopt.
Wordt later weggegooid, maar is zo goedkoop dat het dat waard is.

- `&t=${Date.now()}` uit `js/components/index.js` (regel 147) → caching werkt
  weer. De `v=`-parameter blijft staan.
- De `setTimeout(resolve, 100)` uit de componentlader → 700 ms winst. Het is
  **één** aanroep (regel 186) die zeven keer draait, één keer per component in de
  manifest — niet zeven aanroepen.
- **Dubbele initialisatie weg.** `index.html` heeft een eigen inline
  `initializeApp()` (definitie regel 277, aanroep regel 251, `createRoot` regel
  327) én `app-init.js` heeft een auto-init (regel 149, `createRoot` regel 99);
  beide draaien op dezelfde `#root`-node, dus er staan twee React-bomen op elkaar
  en de sensor wordt twee keer opgehaald. De inline versie schrappen,
  `app-init.js` laten winnen.
- **Versies consolideren.** Er staan vier tegenstrijdige waarden in de repo:
  `index.html` (`CHORES_APP_VERSION`), de fallback in `js/components/index.js`,
  de `?v=` in `panel.py` en het `version`-veld in `manifest.json`. Die worden
  gelijkgetrokken. Vanaf nu is dat versienummer het enige dat caching
  invalideert, dus het moet omhoog bij elke frontendwijziging — zie `CLAUDE.md`.

*Vervallen:* `theme_settings` op donker zetten. Dat lost het witte vlak niet op.
Niets past `theme_settings` toe bij het laden (`api/theme.js:167` draait alleen
vanuit `save()`; `app-handlers.js` wordt nergens aangeroepen), de zichtbare
vlakken zijn hardgecodeerde Tailwind-klassen die niet naar `--theme-*` kijken, en
het enige bestand dat die variabelen wél zou doorvoeren — `css/styles.css` —
wordt nergens geladen. Het wit verdwijnt pas in fase 3, met de HA-CSS-variabelen.

**Klaar wanneer:** één initialisatie in de console, en een tweede pageload haalt
bestanden uit de cache.

### Fase 2 — Backend (2–3 dagen, branch `refactor/v2`)

**Branchstrategie.** Fase 2 en 3 leven samen op één branch, `refactor/v2`, en
gaan pas sámen naar main. Reden: fase 2 vervangt het schema en slankt de sensor
af, en daarmee breekt de huidige frontend — die leest `overdue_tasks` uit de
sensorattributen — vóórdat fase 3 hem vervangt. Main houdt dus de werkende oude
app tot het geheel af is.

**Wat er in fase 2 wél en niet verdwijnt.** Alleen de twee onbereikbare
Python-bestanden gaan weg: `services.py` en `utils.py`. Alles onder `www/`
blijft staan tot fase 3; de overige verwijderingen uit §7 schuiven mee naar
fase 3.

#### Fase 2a — Schema en planningslogica (zelfstandig verifieerbaar)

- Nieuw schema (§3) in `db/schema.py`, verbindingslaag in `db/connection.py`.
  De bestaande DDL in `db/base.py`, `theme_service.py` en `db/migrations.py`
  blijft in 2a onaangeroerd; die wordt in 2b ontmanteld.
- `scheduling/` met de vijf types (§4.1), de doorrollogica (§4.2), urgentie
  (§4.3) en rotatie (§4.4).
- **Unit tests, alleen hier.** De planningslogica is de enige plek waar tests
  echt lonen: `next_due` bij elk type, doorrollen over maand- en jaargrenzen,
  schrikkeljaar, achterstandsberekening per prioriteit, rotatie-index.
- Sluit nog nergens op HA aan.

**Klaar wanneer:** de tests slagen met pytest, zonder draaiende Home Assistant.

#### Fase 2b — Aansluiten op HA

- WS-commando's (§2.3).
- Afgeslankte sensor + sensor per persoon (§2.4).
- `scheduler.py` met de nachtelijke rol.
- **`database.py` ontmantelen** (§7). Verhuis eerst de vier functies die alleen
  daar bestaan — `get_database_stats` en `vacuum_database` naar
  `db/connection.py`, `export_database_to_dict` en `import_database_from_dict`
  naar een nieuwe `db/backup.py`. Leg daarna de acht importplekken om naar `db/`:
  `__init__.py:46`, `sensor.py:15`, `services/__init__.py:39`,
  `services/chore_services.py:17`, `services/chore_services.py:249`,
  `services/user_services.py:9`, `services/notification_services.py:9` en
  `utils/notifications.py:13`. Pas als die alle acht om zijn, mag het bestand weg.
- Oude DDL ontmantelen; alle DDL staat daarna alleen nog in `db/schema.py`. De
  oude staat nu op drie plekken: `db/base.py:77-176`, `theme_service.py:18` en
  `db/migrations.py:117`.
- `services.py` en `utils.py` (onbereikbaar, §7) verwijderen.

**Klaar wanneer:** je kunt via Developer Tools → Services een taak aanmaken,
afvinken en zien dat `next_due` correct doorrolt; de tests slagen; de sensor toont
kloppende samenvattingen.

### Fase 3 — Frontend (3–5 dagen, branch `refactor/v2`)

- Doorwerken op `refactor/v2`; aan het einde van deze fase gaat de branch als
  geheel naar main.
- **De oude ingang blijft tot het einde staan.** Het Lovelace-dashboard
  `/dashboard-chores/taken` is de enige werkende ingang (de kapotte panelroute
  `/chores` is op 28-07-2026 al verwijderd, zie §7). Het Lovelace-dashboard mag
  pas verdwijnen als het nieuwe panel aantoonbaar draait — en daarmee ook
  `_setup_web_assets()` in `__init__.py`, dat de kopie serveert waar dat
  dashboard op draait.
- Nieuw `panel.py`: `panel_custom` met `module_url` en `embed_iframe: false`,
  **geregistreerd op `/taken`** — niet op `/chores`; die route is weg en komt
  niet terug.
- `chores-panel.js` met `hass`-setter en WS-abonnement.
- `core/` (api, store, html, format).
- Weergaven Vandaag → Alles → Activiteit → Beheer, in die volgorde.
- Optimistisch afvinken met terugdraaien bij fout, plus "Ongedaan maken" in de
  bevestiging.
- `styles.css` op HA-variabelen.
- De uitgestelde verwijderingen uit §7 (alles onder `www/`, `theme_service.py`,
  de `theme_settings`-tabel) alsnog doorvoeren zodra het nieuwe panel draait.

**Klaar wanneer:** koude pageload onder een seconde, één enkel JS-bestand per
module, geen externe requests, thema klopt automatisch, werkt op de telefoon.

**Status: uitgevoerd.** 3a (kern + Vandaag) en 3b (correcties + Alles,
Activiteit, Beheer) op 28-07-2026; 3c (de omschakeling) eveneens op
28-07-2026: terugvalpunt `v1-final`, oude app en oude backend volledig weg,
`store/` → `db/`, `sensor_v2.py` → `sensor.py` (entiteit weer
`sensor.chores_overview`), `panel_v2.py` → `panel.py`, versie in het statische
pad in plaats van 26 `?v=`-literals, hamburger bij smal scherm
(`hass-toggle-menu`), kaartmodus (`setConfig`/`getCardSize` + stabiele
resource-URL), themakeuze per apparaat in Beheer, `manifest.json` 2.2.0 met
`websocket_api` als dependency.

**Bewust doorgeschoven uit 3:**

- *Naar fase 4:* meldingen (§6) en persoonskoppeling; de vier kapotte
  automations opruimen (zie fase 4); de chip-default op de ingelogde
  gebruiker zodra `ha_user_id` gekoppeld is.
- *Naar fase 5:* gearchiveerde taken terughalen in de UI (reactiveren kan nu
  alleen via `chore/save` met `active: 1`); checkliststappen bewerken bij
  taken mét historie (het schema mist daarvoor `ON DELETE SET NULL`);
  rotatievolgorde herordenen in het taakformulier (de volgorde blijft nu de
  oorspronkelijke); `seed.py` en de service `seed` verwijderen zodra de taken
  definitief zijn ingevoerd.

### Fase 4 — Motivatie en herinnering (2 dagen)

- Personen koppelen: `ha_user_id` en `notify_service` invullen voor Laura,
  Martijn en Noud. **Eerst dit, dan de rest.**
- Bijdragebalk en ranglijst (§5.1).
- Wekelijkse streaks (§5.3).
- Activiteitenfeed (§5.4).
- Dagelijkse en wekelijkse meldingen met actieknop (§6).
- De kapotte automations in `automations.yaml` opruimen:
  `overdue_chores_notification` (verwijst naar een niet-bestaande entiteit),
  `initialize_chores_config` (restant van een oudere opzet), `daily_chore_check`
  (doet niets zinvols) en `Force Chores Sensor Update` (overbodig bij push).

**Klaar wanneer:** je krijgt 's ochtends een melding, kunt vanuit die melding
afvinken, en ziet zondagavond de weekuitslag.

### Fase 5 — Aanscherpen (1–2 dagen)

- Lege staten, foutmeldingen, bevestiging bij afvinken.
- Toegankelijkheid: focus, contrast, `prefers-reduced-motion`.
- ~~`Developer_Guide` en `Technical_Description` herschrijven~~ — al gedaan in
  3c: `docs/developer-guide.md` en `docs/technical-description.md` beschrijven
  de nieuwe werkelijkheid; het dubbele `TECHNICAL_DESCRIPTION.md` is weg.
- Acht taken opnieuw invoeren met kloppende planning; daarna `seed.py` en de
  service `seed` verwijderen.
- De doorgeschoven punten uit fase 3 (zie daar): gearchiveerde taken
  terughalen, checkliststappen bewerken bij historie, rotatie-herordening.

**Klaar wanneer:** je gebruikt het een week zonder je aan iets te storen.

---

## 10. Open punten

1. **Doet Noud mee?** Hij staat in de database maar heeft geen taken. Aanname:
   wel taken en een eigen streak, maar `include_in_leaderboard = 0` zodat hij niet
   in de tijdsranglijst van volwassenen staat.
2. **Snooze-gedrag.** Voorstel: "naar morgen" of "sla deze keer over" (rolt door
   naar de volgende geplande keer). Nog te bevestigen.
3. **Weekstart.** Aanname maandag.
4. **Handmatige tijdcorrectie.** Als een taak veel langer duurde dan geschat, wil
   je dat dan kunnen bijstellen bij het afvinken? Voegt eerlijkheid toe aan de
   ranglijst, maar ook wrijving. Voorstel: niet in de eerste versie.
5. **Vier HACS-kaarten geven een 404** (`weather-card`, `power-flow-card-plus`,
   `ha-card-weather-conditions`). Staat los van dit project, maar het zijn vier
   mislukte requests bij elke pageload.
6. **`services.yaml` documenteert 8 van de 22 geregistreerde services.** Niet
   gedocumenteerd: `delete_chore`, `complete_subtask`, `add_subtask`,
   `delete_subtask`, `save_theme`, `get_theme`, `reset_theme`,
   `check_due_notifications`, `send_notification`, `get_pending_notifications`,
   `get_database_stats`, `vacuum_database`, `check_database_integrity` en
   `run_migrations`. Die verschijnen zonder velden in Developer Tools → Acties.
   Bij het herschrijven van de services in fase 2 moet `services.yaml` compleet
   worden — of de overbodige services verdwijnen, wat waarschijnlijker is.
7. **Twee services worden geregistreerd maar niet opgeruimd.**
   `async_unregister_services` (`services/__init__.py:107-122`) noemt twintig
   namen, maar `get_pending_notifications` (`services/notification_services.py:101`)
   en `reset_theme` (`services/theme_services.py:108`) staan er niet bij. Bij het
   herladen van de integratie blijven ze achter. Klein, maar nu vastgelegd zodat
   het niet opnieuw ontstaat als de servicelijst in fase 2 verandert.
