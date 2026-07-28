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

**Geen eigen authenticatie.** Geen tokens, geen `Authorization`-headers. Alles
loopt via `hass.connection`.

**Geen eigen themasysteem.** Kleuren en vormen komen uit HA's CSS-variabelen.
Persoonskleuren uit de database zijn de ene uitzondering; de andere is de
themakeuze in Beheer (fase 3c), die bestaande **HA-thema's** als inline custom
properties op de host zet — geen eigen palet, geen eigen tabel of service. Die
keuze is presentatie en staat per apparaat in `localStorage`; dat is de enige
toegestane localStorage-gebruiker (voor auth blijft hij verboden).

**Geen cache-busting met tijdstempels.** Versienummers wel, `Date.now()` nooit —
dat zet caching permanent uit.

**Geen kunstmatige vertragingen.** Geen `setTimeout` om race conditions te
verbergen. Los de oorzaak op.

---

## Backend

- Python 3.13, Home Assistant custom integration.
- Alle databasetoegang via de datalaag `db/` (tot fase 3c heette die `store/`).
  Nooit rechtstreeks SQL buiten die map.
- Alle queries geparameteriseerd.
- SQLite-werk in een executor (`hass.async_add_executor_job`), nooit blokkerend
  op de event loop.
- DDL staat alleen in `db/schema.py`.
- Unit tests: `scheduling/` volledig — daar zit de logica die stilletjes fout
  kan gaan — plus rooktests op de datalaag (schema, verbindingslaag,
  opslagfuncties). De rest merk je meteen in gebruik.

## Frontend

- Eén custom element als entrypoint (`www/chores-panel/chores-panel.js`),
  ES-modules eronder. Hetzelfde element dient als panel op `/taken` én als
  Lovelace-kaart (`type: custom:chores-panel`).
- Rendering via template literals; **alles wat uit de database komt door de
  escape-helper**. Taaknamen en beschrijvingen zijn gebruikersinvoer.
- Event delegation op containerniveau, zodat opnieuw renderen geen listeners
  sloopt.
- Render gericht per sectie, niet de hele boom.
- Eén toestandsobject in `core/store.js`. Geen tweede plek waar toestand woont —
  dat is precies wat er in de vorige versie misging.
- Nederlands in de interface, actieve werkwoorden, geen systeemjargon.

### Twee bekende valkuilen in `chores-panel.js`

**De hass-setter.** HA zet de `hass`-property bij elke state-change, mogelijk
vele keren per seconde. Nooit renderen in de setter; renderen gebeurt bij de
start en via de storeluisteraar.

**De HA-router.** De HA-frontend onderschept elke klik op een `<a>` (ook door
shadow DOM heen) en vertaalt hem naar `history.pushState()` — en pushState
vuurt géén `hashchange`. Tabnavigatie werkt daarom met `preventDefault` plus
zelf de hash zetten, en één window-handler op `hashchange` én `location-changed`.

---

## Deployment

Het panel wordt **rechtstreeks uit `custom_components/` geserveerd** — er is
geen kopieerstap en geen `/local`. Een wijziging aan een bestand onder
`www/chores-panel/` staat meteen op de server; een HA-herstart is alleen nodig
voor Python-wijzigingen en voor een versie-ophoging.

### Versiediscipline — de versie zit in het pad

Er is **één** versiebron: `PANEL_VERSION` in `panel.py`. Het panel laadt van
`/chores_manager-panel-<versie>/chores-panel.js`; relatieve imports erven dat
pad vanzelf, dus er staan **geen** `?v=`-parameters in de JS-bestanden. Ophogen
is één regel in `panel.py` wijzigen en HA herstarten. Het geversioneerde pad
wordt agressief gecachet (zelfde versie = zelfde inhoud, ook door Cloudflare);
vergeet je de ophoging bij een frontendwijziging, dan serveert de cache de
oude module en lijkt je wijziging niet aangekomen.

Daarnaast is dezelfde map bereikbaar op `/chores_manager-panel` (zonder versie,
zonder cache-headers). Dat pad is er **uitsluitend** als stabiele resource-URL
voor kaartgebruik in Lovelace. Zet er nooit een versie achter en laat het panel
er nooit van laden.

Vorm van de versie: `<x.y.z>-<jjjjmmdd>-<korte aanduiding>`, bijvoorbeeld
`2.2.0-20260728-fase3c`. In `manifest.json` staat alleen het `x.y.z`-deel.

### Overig

- Cloudflare cachet; gebruik developer mode bij het testen.
- Herstart HA na wijzigingen in de Python-code.
- De oude database `chores_manager.db` en de kopie `<config>/www/chores-dashboard/`
  kunnen op de HA-host als wees achterblijven; ze worden door niets meer gebruikt.

---

## Wat er niet meer in hoort

De oude app (React/CDN-dashboard onder `www/chores-dashboard/`, eigen
tokenmachinerie, twintig services, `database.py`-facade met het oude
`db/`-pakket, `theme_settings`) is in fase 3c (28-07-2026) **volledig
verwijderd**. Het terugvalpunt is `v1-final` (tag/branch op main). Voeg niets
van die generatie opnieuw toe: geen REST-met-tokens, geen kopieerstap naar
`/local`, geen eigen themadata, geen los `services.py`/`utils.py`.

### Python-valkuil: module naast gelijknamig pakket

Staat er een `naam.py` naast een map `naam/`, dan kiest Python **altijd** het
pakket. Het losse bestand wordt dan onbereikbare code die er wel echt uitziet —
imports slagen, maar de inhoud draait nooit. Dit project heeft er drie gehad
(`services.py`/`services/`, `utils.py`/`utils/`, en het verraderlijke
`database.py` náást `db/` dat juist wél leefde). Alle drie zijn in 3c
opgeruimd. Laat deze situatie niet opnieuw ontstaan; controle:

```bash
python3 -c "import importlib.util,sys; sys.path.insert(0,'custom_components/chores_manager'); \
print(importlib.util.find_spec('db').origin)"
```
