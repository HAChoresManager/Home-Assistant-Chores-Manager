# Werkinstructies — Chores Manager

Lees `REFACTOR_PLAN.md` voordat je iets aanraakt. Dat is de bron van waarheid.
Wijkt de code ervan af, dan is het plan leidend; blijkt het plan fout, werk het
plan dan bij in dezelfde wijziging.

---

## Werkwijze

**Lees eerst alles wat je gaat aanraken.** Niet alleen het bestand met de bug,
ook wat het aanroept en wat het aanroept. De helft van de problemen in dit project
kwam voort uit aanpassingen op basis van aannames over de rest van de code.

**Lever altijd het volledige bestand op.** Geen fragmenten, geen patches, geen
"…rest blijft hetzelfde". Bij grote bestanden liever twee kleinere.

**Verwijder niets zonder het te zeggen.** Als een aanpassing bestaande
functionaliteit laat vervallen, benoem dat expliciet en vraag om bevestiging.
Stilzwijgend weglaten is de ergste uitkomst.

**Maximaal 600 regels per bestand.** Zit je erboven, splits dan langs logische
grenzen — niet willekeurig halverwege.

**Meld ook wat je onderweg tegenkomt.** Zie je een bug die niet in de opdracht
staat, benoem hem. Los hem niet ongevraagd op in dezelfde wijziging.

**Vraag door bij onduidelijkheid.** Liever een vraag vooraf dan werk dat weg moet.

**Verifieer tegen de draaiende situatie, niet tegen documentatie.** Documentatie
in dit project is meermalen achterhaald gebleken. Entiteit-ID's, veldnamen en
sensorattributen controleer je in de echte state, niet in een README.

---

## Randvoorwaarden — niet onderhandelbaar

**Nul externe afhankelijkheden in de frontend.** Geen npm, geen Node, geen
build-stap, geen CDN. Geen React, geen Tailwind, geen bibliotheken. Vanilla
ES-modules, Web Components en gewone CSS. Als iets alleen met een dependency op
te lossen lijkt, is dat een signaal dat het eenvoudiger moet.

**Geen iframe.** De frontend is een native HA-panel dat `hass` geïnjecteerd
krijgt.

**Geen eigen authenticatie.** Geen tokens, geen `localStorage`, geen
`Authorization`-headers. Alles loopt via `hass.connection`.

**Geen eigen themasysteem.** Kleuren en vormen komen uit HA's CSS-variabelen.
Persoonskleuren uit de database zijn de enige uitzondering.

**Geen cache-busting met tijdstempels.** Versienummers wel, `Date.now()` nooit —
dat zet caching permanent uit.

**Geen kunstmatige vertragingen.** Geen `setTimeout` om race conditions te
verbergen. Los de oorzaak op.

---

## Backend

- Python 3.13, Home Assistant custom integration.
- Alle v2-databasetoegang via de datalaag: tijdens fase 2b heet die `store/`,
  vanaf fase 3 neemt hij met `git mv` de naam `db/` over (zie
  `REFACTOR_PLAN.md` §7). Nooit rechtstreeks SQL buiten die map. Het oude
  `db/`-pakket bedient tot fase 3 alleen nog de oude app.
- Alle queries geparameteriseerd.
- SQLite-werk in een executor (`hass.async_add_executor_job`), nooit blokkerend
  op de event loop.
- Nieuwe DDL staat alleen in `store/schema.py` (na fase 3: `db/schema.py`).
- Unit tests: `scheduling/` volledig — daar zit de logica die stilletjes fout
  kan gaan — plus rooktests op de datalaag (schema, verbindingslaag,
  opslagfuncties). De rest merk je meteen in gebruik.

## Frontend

- Eén custom element als entrypoint, ES-modules eronder.
- Rendering via template literals; **alles wat uit de database komt door de
  escape-helper**. Taaknamen en beschrijvingen zijn gebruikersinvoer.
- Event delegation op containerniveau, zodat opnieuw renderen geen listeners
  sloopt.
- Render gericht per sectie, niet de hele boom.
- Eén toestandsobject in `core/store.js`. Geen tweede plek waar toestand woont —
  dat is precies wat er in de vorige versie misging.
- Nederlands in de interface, actieve werkwoorden, geen systeemjargon.

---

## Deployment

### De draaiende frontend is een kopie — valkuil

`_setup_web_assets()` in `__init__.py` kopieert bij elke setup van de config
entry de volledige inhoud van

```
custom_components/chores_manager/www/chores-dashboard/
```

naar

```
<config>/www/chores-dashboard/
```

Het panel serveert die **kopie** via `/local/chores-dashboard/`. De bestanden
onder `custom_components/` worden nooit rechtstreeks aan de browser geserveerd.

**Gevolg: een harde refresh is niet genoeg om een frontendwijziging te zien.**
De kopieerstap draait alleen bij `async_setup_entry`, dus:

1. Wijzig het bestand in `custom_components/chores_manager/www/`.
2. **Herstart Home Assistant** (of herlaad de integratie) — pas dan wordt de
   kopie ververst.
3. Doe daarna een harde refresh in de browser.

Sla je stap 2 over, dan zie je de oude versie en lijkt je wijziging niets te
doen. Dat heeft al meerdere keren tot onterechte "de fix werkt niet"-conclusies
geleid.

Alternatief tijdens het ontwikkelen: kopieer het gewijzigde bestand handmatig
naar `<config>/www/chores-dashboard/`. Dan volstaat een harde refresh.

### Versiediscipline — één bron

Er is **één** versieconstante voor de frontend. Die staat in `index.html`:

```html
window.CHORES_APP_VERSION = '<versie>';
```

Elke andere plek die een versie noemt, spiegelt die waarde en blijft eraan
gelijk:

| Plek | Wat er staat |
|---|---|
| `www/chores-dashboard/index.html` | `window.CHORES_APP_VERSION` — **de bron** |
| `www/chores-dashboard/index.html` | de `?v=` in de drie statische `<script src>`-tags (`js/utils.js`, `js/auth-helper.js`, `js/components/index.js`) |
| `www/chores-dashboard/js/components/index.js` | de fallbackwaarde in `COMPONENT_CONFIG.version` |
| `panel.py` | de `?v=`-parameter achter `js_url` |
| `manifest.json` | het `version`-veld (alleen het `x.y.z`-deel) |

De drie statische script-tags staan in de HTML zelf en kunnen
`window.CHORES_APP_VERSION` niet interpoleren; die moet je met de hand
meenemen. De rest van de bestanden wordt dynamisch geladen en pikt de constante
vanzelf op.

**Hoog dit op bij elke wijziging aan een frontendbestand.** Sinds
`&t=${Date.now()}` uit de componentlader is, is dit versienummer het enige dat
caching invalideert. Vergeet je het, dan krijgen browser en Cloudflare de oude
bestanden terug en lijkt je wijziging niet aangekomen.

Vorm: `<x.y.z>-<jjjjmmdd>-<korte aanduiding>`, bijvoorbeeld
`1.5.0-20260727-fase1`. In `manifest.json` staat alleen `1.5.0`.

Er stonden hiervoor vier tegenstrijdige waarden verspreid door de repo. Laat die
situatie niet terugkomen.

### Overig

- Cloudflare cachet; gebruik developer mode bij het testen.
- Herstart HA na wijzigingen in de Python-code.

---

## Wat er niet meer in hoort

Deze bestanden komen uit eerdere generaties en zijn dood, dubbel of vervangen.
Voeg er niets aan toe en maak ze niet opnieuw:

**Backend**

| Bestand | Regels | Waarom |
|---|---:|---|
| `services.py` | 21 | Compatibiliteitsvorm; onbereikbaar door het gelijknamige pakket `services/` |
| `utils.py` | 399 | Onbereikbaar door het gelijknamige pakket `utils/` |
| `theme_service.py` | 104 | Eigen themasysteem; vervalt met de HA-CSS-variabelen |
| de `theme_settings`-tabel | — | Idem |

**Frontend**

| Bestand | Regels | Waarom |
|---|---:|---|
| `css/styles.css` | 881 | Wordt door niets geladen — geen `<link>`, geen import |
| `js/utils.js` | 386 | Wordt geladen, maar `window.choreUtils` wordt nergens gebruikt |
| `js/app-handlers.js` | 366 | Wordt geladen, maar `useEventHandlers` wordt nergens aangeroepen |
| `js/auth-helper.js` | 272 | Eigen authenticatie; vervalt met `hass.connection` |
| `js/app-init.js` | 223 | Gaat op in het nieuwe entrypoint |
| `js/state/store.js` | 213 | Nooit geladen; vervangen door `core/store.js` |
| `js/app-state.js` | 135 | Wordt geladen, maar `useAppState` wordt nergens aangeroepen |
| `chores-dashboard.js` | 126 | Bouwt de binnenste iframe; vervangen door `chores-panel.js` |
| `js/theme-integration.js` | 70 | Nooit geladen; eigen themasysteem |
| `js/components/fallback.js` | 65 | Staat niet in de componentmanifest; nooit geladen |
| `js/components.js` | 37 | Nooit geladen; vervangen door de modulaire componenten |
| de map `js/api/` | 1428 | REST met bearer-tokens; vervangen door `hass.connection` |

**Documentatie**

- `TECHNICAL_DESCRIPTION.md` — dubbel.

**Let op: `database.py` staat hier bewust niet bij.** Het is geen dode
compatibiliteitslaag maar een levende facade over `db/`, geïmporteerd vanuit acht
plekken, met vier functies die nergens anders bestaan. Het verdwijnt pas in fase
2, samen met het omleggen van die imports. Zie `REFACTOR_PLAN.md` §7 en §9.

### Python-valkuil: module naast gelijknamig pakket

Staat er een `naam.py` naast een map `naam/`, dan kiest Python **altijd** het
pakket. Het losse bestand wordt dan onbereikbare code die er wel echt uitziet —
imports slagen, maar de inhoud draait nooit.

Dit speelt nu op drie plekken:

| Module | Map | Wat wint | Gevolg |
|---|---|---|---|
| `services.py` | `services/` | `services/` | `services.py` is dood |
| `utils.py` | `utils/` | `utils/` | `utils.py` is dood |
| `database.py` | `db/` | *geen conflict* | Andere naam, dus **beide leven** |

De derde is de verraderlijkste: `database.py` en `db/` botsen niet, dus
`database.py` is gewoon bereikbaar en actief. Wie het over één kam scheert met de
eerste twee en het weggooit, breekt de integratie meteen.

Controleer dit met:

```bash
python3 -c "import importlib.util,sys; sys.path.insert(0,'custom_components/chores_manager'); \
print(importlib.util.find_spec('services').origin)"
```

Laat deze situatie niet opnieuw ontstaan.
