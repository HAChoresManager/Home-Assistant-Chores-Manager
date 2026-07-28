# Legacy-notities — staat van de codebase vóór de refactor

Vastgesteld op 27-07-2026, op commit `66e889a` (git-tag `pre-refactor`).

Dit is een momentopname van wat er stond, wat er draaide en wat er alleen maar
lag. Het is bedoeld als referentiepunt: als er tijdens of na de refactor iets
blijkt te ontbreken, kun je hier terugzoeken of het ooit heeft bestaan en of het
ooit heeft gewerkt.

Alles hieronder is geverifieerd tegen de code, niet tegen documentatie.

---

## 1. Omvang

58 bestanden onder `custom_components/chores_manager/`, samen 13.433 regels.

| Regels | Bestand |
|---:|---|
| 881 | `www/chores-dashboard/css/styles.css` |
| 748 | `www/chores-dashboard/js/components/forms.js` |
| 512 | `www/chores-dashboard/js/api/base.js` |
| 461 | `www/chores-dashboard/index.html` |
| 456 | `www/chores-dashboard/js/app.js` |
| 438 | `www/chores-dashboard/js/components/index.js` |
| 435 | `www/chores-dashboard/js/components/tasks.js` |
| 399 | `utils.py` |
| 392 | `db/history.py` |
| 386 | `www/chores-dashboard/js/utils.js` |
| 385 | `www/chores-dashboard/js/components/dialogs.js` |
| 384 | `database.py` |
| 366 | `www/chores-dashboard/js/app-handlers.js` |
| 365 | `__init__.py` |
| 361 | `www/chores-dashboard/js/components/base.js` |
| 350 | `www/chores-dashboard/js/api/chores.js` |
| 326 | `www/chores-dashboard/js/api/theme.js` |
| 309 | `db/subtasks.py` |
| 305 | `db/chores.py` |
| 282 | `sensor.py` |
| 281 | `services/chore_services.py` |
| 279 | `www/chores-dashboard/js/components/tasks/task-card.js` |
| 272 | `www/chores-dashboard/js/auth-helper.js` |
| 264 | `utils/frequency_calculator.py` |
| 244 | `db/notifications.py` |
| 239 | `db/migrations.py` |
| 223 | `www/chores-dashboard/js/app-init.js` |
| 213 | `www/chores-dashboard/js/state/store.js` |
| 209 | `db/users.py` |
| 209 | `db/base.py` |
| 200 | `utils/date_utils.py` |
| 196 | `services.yaml` |
| 184 | `www/chores-dashboard/js/api/index.js` |
| 156 | `utils/notifications.py` |
| 139 | `services/theme_services.py` |
| 135 | `www/chores-dashboard/js/app-state.js` |
| 127 | `services/__init__.py` |
| 126 | `www/chores-dashboard/chores-dashboard.js` |
| 120 | `config_flow.py` |
| 106 | `services/user_services.py` |
| 105 | `services/notification_services.py` |
| 104 | `theme_service.py` |
| 88 | `schemas.py` |
| 78 | `services/base.py` |
| 70 | `www/chores-dashboard/js/theme-integration.js` |
| 69 | `db/__init__.py` |
| 68 | `const.py` |
| 65 | `www/chores-dashboard/js/components/fallback.js` |
| 56 | `www/chores-dashboard/js/api/users.js` |
| 55 | `www/chores-dashboard/js/components/stats.js` |
| 46 | `www/chores-dashboard/js/components/error-boundary.js` |
| 37 | `www/chores-dashboard/js/components.js` |
| 35 | `panel.py` |
| 32 | `strings.json` |
| 28 | `utils/__init__.py` |
| 21 | `services.py` |
| 10 | `manifest.json` |
| 3 | `www/chores-dashboard/config.json` |

Boven de 600-regelgrens uit `CLAUDE.md`: twee bestanden, `css/styles.css` (881)
en `js/components/forms.js` (748). Van die twee wordt `styles.css` nooit geladen.

---

## 2. Wat leeft en wat dood is

Het onderscheid dat telt is niet "staat het er" maar "draait het". Er zijn drie
categorieën, en de middelste is de verraderlijkste.

### 2.1 Python

**Bereikbaar en actief**

`__init__.py`, `const.py`, `config_flow.py`, `panel.py`, `sensor.py`,
`schemas.py`, `database.py`, `theme_service.py`, `services/` (5 bestanden),
`db/` (7 bestanden), `utils/` (4 bestanden), plus `manifest.json`,
`services.yaml` en `strings.json`.

**Onbereikbaar — geschaduwd door een gelijknamig pakket**

| Bestand | Regels |
|---|---:|
| `services.py` | 21 |
| `utils.py` | 399 |

Zie §4.

### 2.2 Frontend

De laadvolgorde begint bij `panel.py:31`, dat `chores-dashboard.js` registreert
als `js_url`. Dat webcomponent bouwt een iframe naar
`/local/chores-dashboard/index.html`. Alles daaronder wordt vanuit `index.html`
geladen.

**Geladen en gebruikt**

| Bestand | Geladen door |
|---|---|
| `chores-dashboard.js` | `panel.py:31` |
| `index.html` | de iframe uit `chores-dashboard.js:17` |
| `js/auth-helper.js` | `index.html:180` |
| `js/components/index.js` | `index.html:183` |
| `js/components/error-boundary.js` | componentmanifest |
| `js/components/base.js` | componentmanifest |
| `js/components/dialogs.js` | componentmanifest |
| `js/components/tasks/task-card.js` | componentmanifest |
| `js/components/tasks.js` | componentmanifest |
| `js/components/forms.js` | componentmanifest |
| `js/components/stats.js` | componentmanifest |
| `js/api/base.js` `chores.js` `users.js` `theme.js` `index.js` | `index.html:193-197` |
| `js/app-init.js` | `index.html:241` |
| `js/app.js` | `index.html:242` |

**Wel geladen, maar de exports worden nergens aangeroepen**

Deze drie gaan bij elke pageload over de lijn en worden geparsed, zonder dat er
ooit iets uit gebruikt wordt. `app.js` heeft zijn eigen inline state en handlers
(regels 128-284).

| Bestand | Regels | Definieert | Consument |
|---|---:|---|---|
| `js/utils.js` | 386 | `window.choreUtils` | geen |
| `js/app-state.js` | 135 | `useAppState`, `useComputedValues` | geen |
| `js/app-handlers.js` | 366 | `useEventHandlers` | geen |

Samen 887 regels.

**Nooit geladen**

| Bestand | Regels |
|---|---:|
| `css/styles.css` | 881 |
| `js/state/store.js` | 213 |
| `js/theme-integration.js` | 70 |
| `js/components/fallback.js` | 65 |
| `js/components.js` | 37 |

Samen 1266 regels. `css/styles.css` is het grootste bestand van de hele repo en
heeft geen enkele `<link>` of import.

**Correctie 28-07-2026 — Lovelace-resources.** De twee tabellen hierboven
beschrijven het **binnenste** document (de iframe met `index.html`). In HA zelf
stonden daarnaast twee resource-registraties, buiten de repo om:

| Resource | Type |
|---|---|
| `/local/chores-dashboard/js/components.js` | JavaScript-module |
| `/local/chores-dashboard/js/utils.js` | JavaScript-module |

Daardoor werden die twee bestanden ook in het **buitenste** HA-document geladen,
op élk dashboard. `js/components.js` was dus niet "nooit geladen" maar
buiten-wel/binnen-niet, en `js/utils.js` werd dubbel geladen: binnen via
`index.html` én buiten als resource. Voor de classificatie binnen het eigen
document blijven de tabellen kloppen. Beide registraties zijn op 28-07-2026
verwijderd; sindsdien geldt de oorspronkelijke lezing alsnog, en kunnen beide
bestanden zonder 404-risico weg.

---

## 3. Bekende gebreken op het moment van vastleggen

Vastgelegd zodat later te zien is wat de refactor moest oplossen en wat er al
kapot was.

**Dubbele initialisatie.** `index.html:277` definieert een inline
`initializeApp()`, aangeroepen op regel 251, die op regel 327 een `createRoot()`
doet. `app-init.js:149` heeft daarnaast een auto-init die via regel 161 uitkomt
op een tweede `createRoot()` op regel 99 — op dezelfde `#root`-node. De inline
versie wint de race; app-init.js volgt circa 100 ms later. Beide monteren
`ChoresApp`, dus de `useEffect` op `app.js:147` draait twee keer en de sensor
wordt twee keer opgehaald.

**Cache permanent uit.** `js/components/index.js:147` hangt `&t=${Date.now()}`
achter elke componenturl, dus elke pageload haalt alles opnieuw op.

**700 ms kunstmatige vertraging.** `js/components/index.js:186` wacht 100 ms na
elke componentload; met zeven componenten in de manifest is dat 700 ms per
pageload. De wachttijd is niet nodig: alle zeven componentbestanden zijn
synchrone IIFE's die hun exports zetten vóór `script.onload` vuurt.

**Dode eventlistener.** `app-init.js:194` luistert op `chores-components-ready`,
terwijl de loader `choreComponentsReady` dispatcht (`js/components/index.js:370`).
Die listener heeft nooit gevuurd.

**Vier tegenstrijdige versienummers.** `index.html:10` =
`1.4.2-20250915-corrected-api-fix`, `js/components/index.js:14` fallback =
`1.4.2-20250915-comprehensive-fix`, `panel.py:31` = `?v=20250405`,
`manifest.json` = `1.0.0`.

**Twee geneste iframes.** `panel.py:28` staat op `embed_iframe: True`, en
`chores-dashboard.js:77` bouwt daarbinnen nog een eigen iframe.

**De panelroute `/chores` is kapot en was dat altijd al.** (Vastgesteld
28-07-2026.) De binnenste iframe in `chores-dashboard.js` is een direct kind
van de shadow root (regel 24, `this.shadowRoot.innerHTML`), en voor een direct
kind van een ShadowRoot is `parentElement` **null** — dat geeft alleen
Element-ouders terug, en een ShadowRoot is een DocumentFragment. De inline
handlers gebruiken hem toch:

- regel 81, `onload`: `this.parentElement.querySelector('#loading')…` gooit
  `TypeError: can't access property querySelector, this.parentElement is null`.
  Het tweede statement — `this.style.display='block'` — draait daardoor nooit,
  dus de iframe blijft op zijn inline `display: none` van regel 80 staan.
- regel 82, `onerror`: identieke bug.

Gevolg: de app laadt en draait volledig, maar onzichtbaar. De laadindicator
wordt nooit opgeruimd, dus de timeout op regels 91-102 vuurt na 15 seconden en
toont "Dashboard is taking longer than expected to load". Ironisch genoeg doen
regels 87-88 het in dezelfde functie wél goed (`this.shadowRoot.querySelector`);
`parentNode` had in de handlers ook gewerkt.

Niet gerepareerd maar geschrapt: op 28-07-2026 zijn `panel.py` en
`chores-dashboard.js` verwijderd en is de `async_setup_panel`-aanroep uit
`__init__.py` gehaald. `/chores` geeft sindsdien een 404.
`_setup_web_assets()` bleef staan — het Lovelace-dashboard
`/dashboard-chores/taken` draait op de kopie die die functie maakt en is tot
fase 3 de enige ingang. Let op: de kopieerstap verwijdert geen bestanden uit
`<config>/www/chores-dashboard/`, dus daar blijft een wees-exemplaar van
`chores-dashboard.js` liggen; onschadelijk, niets verwijst ernaar.

**Externe afhankelijkheden.** `index.html:15` laadt Tailwind van
`cdn.tailwindcss.com`, `index.html:150-151` laden React en ReactDOM van
`unpkg.com`. Zonder internet start de app niet.

**Themawaarden komen nergens aan.** `theme_settings` staat in de database en in
de sensorattributen, maar niets past ze toe bij het laden:
`js/api/theme.js:167 applyTheme()` draait alleen vanuit `save()` (regel 128), en
`js/app-handlers.js:111-114` doet het wel maar wordt nergens aangeroepen. De
zichtbare vlakken zijn hardgecodeerde Tailwind-klassen (`bg-gray-50`, `bg-white`)
die niet naar `--theme-*` kijken, en `css/styles.css` — het enige bestand dat die
variabelen met `!important` op elementen legt — wordt niet geladen.

**Dode tokenketen.** `__init__.py:249` schrijft een gegenereerd token naar
`www/chores-dashboard/config.json`, maar geen enkel frontendbestand leest dat
bestand. De tokens komen via `js/auth-helper.js` uit `localStorage` en
`hassConnection`.

**DDL op drie plekken.** `db/base.py:77-176` (zeven tabellen),
`theme_service.py:18` en `db/migrations.py:117` (beide `theme_settings`).

**`services.yaml` documenteert 8 van de 22 geregistreerde services**, en
`async_unregister_services` (`services/__init__.py:107-122`) vergeet er twee:
`get_pending_notifications` en `reset_theme`.

---

## 4. De drie naamconflicten

Staat er een `naam.py` naast een map `naam/`, dan kiest Python altijd het
pakket. Het losse bestand wordt dan onbereikbare code die er wel echt uitziet.

Geverifieerd met `importlib.util.find_spec`:

```
services   module=True   package=True    -> services/__init__.py
utils      module=True   package=True    -> utils/__init__.py
database   module=True   package=False   -> database.py
db         module=False  package=True    -> db/__init__.py
```

| Module | Map | Wat wint | Gevolg |
|---|---|---|---|
| `services.py` (21) | `services/` | `services/` | `services.py` is dood |
| `utils.py` (399) | `utils/` | `utils/` | `utils.py` is dood |
| `database.py` (384) | `db/` | *geen conflict* | Andere naam, dus **beide leven** |

De derde is de belangrijkste. `database.py` en `db/` botsen niet, dus
`database.py` is gewoon bereikbaar en wordt vanuit acht plekken geïmporteerd:

| Plek | Wat |
|---|---|
| `__init__.py:46` | `init_database`, `verify_database` |
| `sensor.py:15` | chore- en statistiekfuncties |
| `services/__init__.py:39` | `get_database_stats`, `vacuum_database`, `export_database_to_dict`, `import_database_from_dict` |
| `services/chore_services.py:17` | chorefuncties |
| `services/chore_services.py:249` | `get_ha_user_id_for_assignee` |
| `services/user_services.py:9` | `add_user`, `delete_user` |
| `services/notification_services.py:9` | notificatiefuncties |
| `utils/notifications.py:13` | `get_pending_notifications`, `mark_notifications_sent` |

Vier functies bestaan alleen in `database.py` en niet in `db/`:
`get_database_stats`, `vacuum_database`, `export_database_to_dict` en
`import_database_from_dict`.

Extra detail bij `services.py`: als het bereikbaar wás geweest, zou regel 12
(`from .services import async_register_services as register_services_new`)
zichzelf importeren.

---

## 5. Terug naar deze staat

```bash
git checkout pre-refactor
```

De tag staat op `66e889a`. De databasedump ontbreekt bewust: de bestaande data
wordt niet gemigreerd (zie `REFACTOR_PLAN.md` §3). `docs/legacy-state.yaml` is de
inhoudelijke referentie.

---

## 6. Slot: de oude app is verwijderd (28-07-2026, fase 3c)

Alles wat dit document beschrijft, is op 28-07-2026 uit de repo verwijderd:

- `www/chores-dashboard/` volledig (React/CDN-dashboard, ~7.800 regels),
  inclusief de bestanden die al dood waren én de bestanden die nog draaiden;
- de tokenmachinerie in `__init__.py` (`_generate_dashboard_token`, de
  2-uurs-refresh, `config.json`) en de kopieerstap `_setup_web_assets`;
- de oude backend: `database.py`, `sensor.py`, `schemas.py`,
  `theme_service.py`, de onbereikbare `services.py` en `utils.py`, en de
  pakketten `services/`, `utils/` en het oude `db/` (inclusief
  `migrations.py`);
- de twintig oude services en de oude sensor (het nieuwe `sensor.py` — de
  voormalige `sensor_v2.py` — neemt via het oude unique_id de naam
  `sensor.chores_overview` over).

De v2-datalaag `store/` heet sindsdien `db/`. Het terugvalpunt vóór deze
sloop is **`v1-final`** (branch op de remote; de gelijknamige tag bestaat
alleen lokaal omdat de git-proxy geen tags doorlaat). De tag `pre-refactor`
uit §5 hierboven (66e889a, alleen lokaal) blijft het terugvalpunt van vóór de
hele refactor. Op de HA-host blijven `<config>/www/chores-dashboard/` en
`<config>/chores_manager.db` als wezen achter; handmatig te verwijderen.
