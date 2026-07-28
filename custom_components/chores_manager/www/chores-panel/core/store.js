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
 *   pending   Set van chore-ids die optimistisch als afgevinkt gelden
 *             (verdwenen uit de lijst vóór de server bevestigt)
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
 */

let state = {
  loading: true,
  connecting: false,
  error: null,
  data: null,
  pending: new Set(),
  chooser: null,
  credits: {},
  view: 'vandaag',
  expanded: new Set(),
  editing: null,
  narrow: false,
  themes: null,
  currentUserId: null,
  haOptions: null,
};

const listeners = new Set();

export const store = {
  get() {
    return state;
  },

  set(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
