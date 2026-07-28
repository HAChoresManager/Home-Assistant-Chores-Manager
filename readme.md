# Home Assistant Chores Manager

Huishoudelijke taken voor het hele gezin, als native Home Assistant-panel op
`/taken`. Vier schermen — Vandaag, Alles, Activiteit, Beheer — met afvinken
in één tik, een bijdragebalk per week, rotatie van beurten en een eerlijke
achterstandslogica (achterstand loopt niet eindeloos op).

Gebouwd zonder build-stap of externe dependencies: vanilla ES-modules, Web
Components en HA's eigen CSS-variabelen, dus elk thema klopt vanzelf.

## Installatie

1. Kopieer `custom_components/chores_manager/` naar
   `<config>/custom_components/`.
2. Herstart Home Assistant.
3. Instellingen → Apparaten en diensten → Integratie toevoegen →
   "Chores Manager". Er valt niets in te stellen; het panel verschijnt in de
   zijbalk als **Huishoudelijke Taken**.

Er is geen `configuration.yaml`-configuratie. De database staat in
`<config>/chores_v2.db`.

## Gebruik als Lovelace-kaart (optioneel)

Het panel werkt ook als kaart in een bestaand dashboard:

1. Instellingen → Dashboards → Bronnen → URL
   `/chores_manager-panel/chores-panel.js`, type *JavaScript-module*.
2. Voeg een kaart toe:

   ```yaml
   type: custom:chores-panel
   ```

## Sensor en services

- `sensor.chores_overview` — openstaande taken vandaag, met attributen
  (`due_today`, `overdue`, `completed_today`, `week_minutes_total`,
  `persons` incl. `in_leaderboard`-vlag per persoon).
- `chores_manager.roll_forward` — voer de nachtelijke doorrol (03:00) nu uit.
- `chores_manager.seed` — tijdelijk: vult de database met de starttaken.

## Documentatie

- `docs/developer-guide.md` — wegwijzer voor ontwikkeling.
- `docs/technical-description.md` — wat er draait en hoe.
- `REFACTOR_PLAN.md` — ontwerpbesluiten en fasering.
- `CLAUDE.md` — werkinstructies en randvoorwaarden.
