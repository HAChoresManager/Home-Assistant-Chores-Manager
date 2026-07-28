/**
 * Eén toestandsobject met een subscribe-patroon.
 *
 * Dit is de enige plek waar toestand woont (CLAUDE.md) — precies wat er in de
 * vorige generatie misging met drie state-lagen naast elkaar. Views lezen via
 * get(), muteren via set(), en de renderlus luistert via subscribe().
 *
 * Vorm van de toestand:
 *   loading  eerste keer laden bezig
 *   error    foutmelding (string) of null
 *   data     het volledige antwoord van chores_manager/state, of null
 *   pending  Set van chore-ids die optimistisch als afgevinkt gelden
 *            (verdwenen uit de lijst vóór de server bevestigt)
 *   chooser  {choreId, subtaskId} als de wie-deed-het-keuze openstaat, anders null
 */

let state = {
  loading: true,
  error: null,
  data: null,
  pending: new Set(),
  chooser: null,
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
