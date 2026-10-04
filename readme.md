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
  voor eigen Lovelace-kaarten: `tasks_today` (compacte lijst mét wie het
  moet doen), `recent_completions` (de laatste acht voltooiingen),
  `recent_skips` (de laatste acht overslagen) en `persons` (weekstand per
  persoon, met kleur en streak).
  Zie `docs/technical-description.md` voor de velden.
- `chores_manager.mark_done` — vink een taak af vanaf een Lovelace-kaart
  (`chore_id` uit `tasks_today`; `assignee_id` optioneel, leeg = de
  aanroepende gebruiker via zijn koppeling).
- `chores_manager.undo_last` — draai de laatste voltooiing of overslag
  exact terug, binnen vijf minuten (zelfde venster als de undo-knop in het
  panel).
- `chores_manager.revert_completion` — haal een eerdere voltooiing weg, ook
  buiten dat venster (`completion_id` uit `recent_completions`). Was het de
  laatste volledige voltooiing van die taak, dan komt de taak vandaag terug
  (is hij daarna overgeslagen, dan blijft de datum van de overslag staan en
  gaat alleen de beurt terug); bij een oudere gaat alleen de regel weg.
- `chores_manager.skip` — sla een taak deze keer over: niemand doet hem, hij
  schuift door naar de eerstvolgende geplande keer, zonder minuten en zonder
  dat de beurt doorschuift (`chore_id` uit `tasks_today`; `assignee_id`
  optioneel, leeg = de aanroepende gebruiker via zijn koppeling, en anders
  "onbekend"). Alleen voor taken die vandaag aan de beurt zijn of
  achterlopen.
- `chores_manager.revert_skip` — toch niet overslaan, ook buiten het
  undo-venster (`skip_id` uit `recent_skips`). Kan alleen zolang er sinds
  het overslaan niets met de taak is gebeurd (niet afgevinkt, niet opnieuw
  overgeslagen, niet bewerkt).
- `chores_manager.roll_forward` — voer de nachtelijke doorrol (03:00) nu uit.
- `chores_manager.send_daily_summary` / `send_weekly_summary` — verstuur de
  ochtendmelding of weeksamenvatting nu.

## Documentatie

- `docs/developer-guide.md` — wegwijzer voor ontwikkeling.
- `docs/technical-description.md` — wat er draait en hoe.
- `REFACTOR_PLAN.md` — ontwerpbesluiten en fasering.
- `CLAUDE.md` — werkinstructies en randvoorwaarden.
