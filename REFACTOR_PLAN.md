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
- Alle databasetoegang via `db/`. Nooit rechtstreeks SQL buiten die map.
- Alle queries geparameteriseerd.
- SQLite-werk in een executor (`hass.async_add_executor_job`), nooit blokkerend
  op de event loop.
- DDL staat alleen in `db/schema.py`.
- Unit tests alleen voor `scheduling/`. Daar zit de logica die stilletjes fout
  kan gaan; de rest merk je meteen in gebruik.

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

## Deployment

- Versienummer in `manifest.json` bij elke wijziging aan frontendbestanden.
- Cloudflare cachet; gebruik developer mode bij het testen.
- Herstart HA na wijzigingen in de Python-code; een harde refresh volstaat voor
  alleen frontend.

---

## Wat er niet meer in hoort

Deze bestanden komen uit eerdere generaties en zijn dood, dubbel of vervangen.
Voeg er niets aan toe en maak ze niet opnieuw:

`database.py` · `services.py` (compatibiliteitsvorm) · `components.js` ·
`js/state/store.js` · `app-state.js` · `app-handlers.js` · `app-init.js` ·
`auth-helper.js` · `theme-integration.js` · `theme_service.py` · de
`theme_settings`-tabel · de map `js/api/` · `TECHNICAL_DESCRIPTION.md`

Twee Python-valkuilen uit het verleden: er stonden zowel `services.py` als een map
`services/`, en zowel `database.py` als een map `db/`. Python kiest in dat geval
de map, dus de losse bestanden waren onbereikbare code die er wel echt uitzag.
Laat die situatie niet opnieuw ontstaan.
