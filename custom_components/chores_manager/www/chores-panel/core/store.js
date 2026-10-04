/**
 * Eén toestandsobject met een subscribe-patroon.
 *
 * Dit is de enige plek waar toestand woont (CLAUDE.md) — precies wat er in de
 * vorige generatie misging met drie state-lagen naast elkaar. Views lezen via
 * get(), muteren via set(), en de renderlus luistert via subscribe().
 *
 * Vorm van de toestand:
 *   loading   eerste keer laden bezig
 *   connecting  wachten op een backend die nog niet klaar is (HA-herstart);
 *               rustige "Verbinden…"-melding, geen foutscherm — de retry in
 *               core/api.js herstelt dit vanzelf
 *   error     foutmelding (string) of null
 *   data      het volledige antwoord van chores_manager/state, of null
 *   pending   Set van chore-ids die optimistisch als afgevinkt of
 *             overgeslagen gelden (verdwenen uit de lijst vóór de server
 *             bevestigt)
 *   reverting Set van skip-ids waarvoor "Toch niet overslaan" loopt; de
 *             knop in Activiteit staat dan uit, zodat een dubbele tik geen
 *             tweede aanroep stuurt
 *   chooser   {choreId, subtaskId, mode} als de persoonskeuze openstaat;
 *             mode 'complete' vinkt af bij keuze, mode 'credit' zet alleen
 *             het chipje
 *   credits   per taak wie de credits krijgt als dat afwijkt van de
 *             toewijzing (§4.4); geleegd zodra de taak volledig is afgerond
 *   view      actieve weergave: vandaag | alles | activiteit | beheer
 *   expanded  Set van chore-ids waarvan de checklist op Alles openstaat
 *   editing   {kind, id, confirm} als er een beheersformulier openstaat
 *   narrow    HA verbergt de zijbalk (smal scherm) → hamburger tonen
 *   themes    {names, selected} voor de themakeuze in Beheer, of null
 *             zolang hass.themes nog niet gezien is
 *   currentUserId  hass.user.id van de kijker; voor de chip-default op
 *                  'anyone'-taken via de ha_user_id-koppeling (fase 4)
 *   haOptions {users, services} voor het personenformulier, vers gezet
 *             bij het openen ervan; null tot die tijd
 *   vacationDraft  gekozen "tot en met" in Beheer die nog niet bij de server
 *                  ligt: 'YYYY-MM-DD', '' (bewust leeggemaakt) of null (toon
 *                  de serverwaarde). Hier en niet in de DOM, zodat een
 *                  binnenkomende refresh de keuze niet wist
 *   vacationBusy   false, of de bedoeling van de vakantie-aanroep die nu
 *                  loopt: 'start' | 'end' | 'update'. Schakelaar, datumveld
 *                  en "Datum opslaan" staan dan uit, en de schakelaar toont
 *                  de bedoeling (niet de oude serverstand) tot de nieuwe
 *                  staat binnen is
 *
 * set(patch, { quiet: true }) werkt de toestand bij zonder de luisteraars
 * te wekken — dus zonder render. Alleen voor invoer die de DOM al toont
 * (het concept in het vakantiedatumveld): een render zou dat veld onder de
 * vingers van de typende gebruiker vervangen.
 */

let state = {
  loading: true,
  connecting: false,
  error: null,
  data: null,
  pending: new Set(),
  reverting: new Set(),
  chooser: null,
  credits: {},
  view: 'vandaag',
  expanded: new Set(),
  editing: null,
  narrow: false,
  themes: null,
  currentUserId: null,
  haOptions: null,
  vacationDraft: null,
  vacationBusy: false,
};

const listeners = new Set();

export const store = {
  get() {
    return state;
  },

  set(patch, { quiet = false } = {}) {
    state = { ...state, ...patch };
    if (quiet) return;
    for (const listener of listeners) listener(state);
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
