/**
 * Mutaties van het panel met hun terugkoppeling (snackbar, formulierfout).
 *
 * Afgesplitst uit chores-panel.js: het element houdt lifecycle, routing,
 * render, delegatie, thema's en de snackbar zelf; hier staat wat er gebeurt
 * als iemand iets verandert. Elke actie krijgt een klein context-object
 * {refresh, showSnackbar, hideSnackbar} — bewust niet het hele element — en
 * leest en schrijft de toestand rechtstreeks in core/store.js (de enige plek
 * waar toestand woont).
 *
 * Staat naast de entrypoint en niet in core/: core/ bevat alleen
 * blad-modules, en dit bestand gebruikt components/ en views/ (isFinalAction,
 * de formulierlezers).
 *
 * Foutteksten komen van de server (Nederlands, zie de HA-laag) en gaan
 * ongewijzigd de snackbar in — altijd via textContent, nooit als markup.
 */
import { api } from './core/api.js';
import { store } from './core/store.js';
import { isFinalAction } from './components/task-card.js';
import { collectChoreForm } from './components/task-form.js';
import { collectAssigneeForm } from './views/manage.js';

function errorText(err) {
  return err?.message || String(err);
}

/** Taak-id optimistisch uit beeld halen, of hem terugzetten na een fout. */
function setPending(choreId, on, patch = {}) {
  const pending = new Set(store.get().pending);
  if (on) pending.add(choreId);
  else pending.delete(choreId);
  store.set({ ...patch, pending });
}

/**
 * Afvinken met optimistische update (B5): een afrondende actie haalt de
 * kaart meteen uit beeld; bevestigt de server, dan blijft dat zo en komt er
 * "Ongedaan maken" in de bevestiging. Faalt de aanroep, dan komt de kaart
 * terug en vertelt de snackbar waarom. De snackbar noemt wie de credits
 * kreeg, zodat een verkeerde toewijzing binnen het undo-venster opvalt.
 */
export async function complete(ctx, choreId, assigneeId, subtaskId) {
  const state = store.get();
  const chore = state.data?.chores.find((c) => c.id === choreId);
  if (!chore || !assigneeId) return;
  const person = state.data.assignees.find((a) => a.id === assigneeId);
  const personName = person ? person.name : assigneeId;

  if (isFinalAction(chore, subtaskId)) setPending(choreId, true);

  try {
    const result = await api.complete({ choreId, assigneeId, subtaskId });
    if (result.was_full) {
      const credits = { ...store.get().credits };
      delete credits[choreId];
      store.set({ credits });
      ctx.showSnackbar(`Afgevinkt: ${chore.name} · ${personName}`, { undo: true });
    } else {
      ctx.showSnackbar(`Stap afgevinkt · ${personName}`, { undo: true });
    }
    await ctx.refresh();
  } catch (err) {
    setPending(choreId, false);
    ctx.showSnackbar(
      `Afvinken is niet gelukt: ${err?.message || err}`, { error: true });
  }
}

/**
 * Overslaan vanuit de personenrij: deze keer doet niemand de taak, hij rolt
 * door naar de volgende geplande keer. Optimistisch zoals afvinken — de
 * keuzerij sluit en de kaart verdwijnt in één store-wijziging; bij een fout
 * komt de kaart terug. Wie oversloeg bepaalt de server via de koppeling van
 * de kijker, daarom stuurt het panel geen persoon mee. Terugdraaien kan met
 * dezelfde "Ongedaan maken" als na afvinken (de server kent beide).
 */
export async function skip(ctx, choreId) {
  const chore = store.get().data?.chores.find((c) => c.id === choreId);
  if (!chore) return;
  setPending(choreId, true, { chooser: null });

  try {
    await api.skip(choreId);
    ctx.showSnackbar(`Overgeslagen: ${chore.name}`, { undo: true });
    await ctx.refresh();
  } catch (err) {
    setPending(choreId, false);
    ctx.showSnackbar(
      `Overslaan is niet gelukt: ${err?.message || err}`, { error: true });
  }
}

/** Laatste voltooiing of overslag terugdraaien (venster: vijf minuten). */
export async function undo(ctx) {
  ctx.hideSnackbar();
  try {
    await api.undo();
    ctx.showSnackbar('Teruggedraaid');
    await ctx.refresh();
  } catch (err) {
    ctx.showSnackbar(err?.message || 'Terugdraaien is niet gelukt', { error: true });
  }
}

/**
 * "Toch niet overslaan" vanuit Activiteit. De knop blijft staan tot de
 * refresh, dus zolang de aanroep loopt staat het skip-id in `reverting` en
 * rendert de knop uitgeschakeld — een dubbele tik stuurt geen tweede
 * aanroep die met een fout over de bevestiging heen zou schrijven.
 */
export async function revertSkip(ctx, skipId) {
  const state = store.get();
  if (!Number.isInteger(skipId) || state.reverting.has(skipId)) return;
  const name = state.data?.skips
    ?.find((s) => s.id === skipId)?.chore_name || 'de taak';
  const reverting = new Set(state.reverting);
  reverting.add(skipId);
  store.set({ reverting });

  try {
    await api.revertSkip(skipId);
    ctx.showSnackbar(`Weer aan de beurt: ${name}`);
    await ctx.refresh();
  } catch (err) {
    ctx.showSnackbar(errorText(err), { error: true });
  } finally {
    const rest = new Set(store.get().reverting);
    rest.delete(skipId);
    store.set({ reverting: rest });
  }
}

/** Gearchiveerde taak terugzetten (E1); de server bepaalt de verse datum. */
export async function restore(ctx, choreId) {
  const name = store.get().data?.archived_chores
    ?.find((c) => c.id === choreId)?.name || choreId;
  try {
    await api.choreRestore(choreId);
    ctx.showSnackbar(`Teruggezet: ${name}`);
    await ctx.refresh();
  } catch (err) {
    ctx.showSnackbar(errorText(err), { error: true });
  }
}

/** Het openstaande beheersformulier: taak of persoon verwijderen. De server
 * kiest tussen echt verwijderen en archiveren (historie blijft). */
export async function deleteEditing(ctx) {
  const state = store.get();
  const editing = state.editing;
  if (!editing || !editing.id) return;
  try {
    let result;
    let name;
    if (editing.kind === 'chore') {
      name = state.data.chores.find((c) => c.id === editing.id)?.name || editing.id;
      result = (await api.choreDelete(editing.id)).result;
    } else {
      name = state.data.assignees.find((a) => a.id === editing.id)?.name || editing.id;
      result = (await api.assigneeDelete(editing.id)).result;
    }
    ctx.showSnackbar(result === 'deactivated'
      ? `Gearchiveerd: ${name} (historie blijft)`
      : `Verwijderd: ${name}`);
    store.set({ editing: null });
    await ctx.refresh();
  } catch (err) {
    ctx.showSnackbar(errorText(err), { error: true });
  }
}

function showFormError(ctx, form, message) {
  // Buiten de store om: een render zou het formulier wissen.
  const slot = form.querySelector('[data-form-error]');
  if (slot) {
    slot.textContent = message;
    slot.hidden = false;
  } else {
    ctx.showSnackbar(message, { error: true });
  }
}

/** Beheersformulier opslaan (taak of persoon). Een fout landt in het
 * foutvak van het formulier, zodat het getypte werk blijft staan. */
export async function submitForm(ctx, form) {
  try {
    if (form.dataset.form === 'chore') {
      const chore = collectChoreForm(form);
      await api.choreSave(chore);
      ctx.showSnackbar(`Opgeslagen: ${chore.name}`);
    } else {
      const assignee = collectAssigneeForm(form);
      await api.assigneeSave(assignee);
      ctx.showSnackbar(`Opgeslagen: ${assignee.name}`);
    }
    store.set({ editing: null });
    await ctx.refresh();
  } catch (err) {
    showFormError(ctx, form, errorText(err));
  }
}
