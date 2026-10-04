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
 *
 * De vakantie- en afwezigheidsacties onderaan zijn bewust níet
 * optimistisch: de schakelaar staat uit (vacationBusy, absenceBusy) tot de
 * server antwoordt en de verse staat er is.
 */
import { api } from './core/api.js';
import { store } from './core/store.js';
import { dayMonth, taskCount } from './core/format.js';
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

/**
 * Gemeenschappelijk verloop van de drie vakantie-aanroepen. Zolang de
 * aanroep loopt staat in vacationBusy de bedoeling ('start', 'end' of
 * 'update'): schakelaar en datumveld staan uit, zodat een snelle tweede
 * tik geen "uit" verstuurt terwijl "aan" nog loopt, en de schakelaar toont
 * die bedoeling in plaats van terug te springen naar de oude serverstand.
 * De refresh draait in beide gevallen en nog binnen de busy-periode; pas
 * daarna gaan busy en (na succes) het concept in één store-wijziging weg,
 * zodat datum en uitleg niet even terugvallen. Bij een fout blijft het
 * concept staan en toont de schakelaar na de refresh de serverstand.
 */
async function vacationCall(ctx, intent, call) {
  if (store.get().vacationBusy) return;
  store.set({ vacationBusy: intent });
  let done = false;
  try {
    try {
      const text = await call();
      done = true;
      ctx.showSnackbar(text);
    } catch (err) {
      ctx.showSnackbar(errorText(err), { error: true });
    }
    await ctx.refresh();
  } finally {
    store.set(done
      ? { vacationBusy: false, vacationDraft: null }
      : { vacationBusy: false });
  }
}

/** Schakelaar aan: vakantie starten, tot en met de gekozen datum of open. */
export async function vacationStart(ctx) {
  await vacationCall(ctx, 'start', async () => {
    const { vacationDraft, data } = store.get();
    const until = vacationDraft || null;
    await api.vacationStart(until);
    return until
      ? `Vakantiemodus aan · tot en met ${dayMonth(until, data?.today)}`
      : 'Vakantiemodus aan';
  });
}

/** "Datum opslaan": de "tot en met" van de lopende vakantie wijzigen of
 * wissen (een leeggemaakt veld betekent: geen einddatum meer). */
export async function vacationSaveUntil(ctx) {
  const { vacationDraft } = store.get();
  if (vacationDraft === null) return;
  await vacationCall(ctx, 'update', async () => {
    const until = vacationDraft || null;
    await api.vacationUpdate(until);
    return until
      ? `Opgeslagen: tot en met ${dayMonth(until, store.get().data?.today)}`
      : 'Opgeslagen: geen einddatum';
  });
}

/** Schakelaar uit: vakantie beëindigen; de server verschuift de taken en
 * de snackbar zegt hoeveel (enkelvoud/meervoud, "niets" bij nul). */
export async function vacationEnd(ctx) {
  await vacationCall(ctx, 'end', async () => {
    const result = await api.vacationEnd();
    const changed = Array.isArray(result?.changed)
      ? result.changed.length : Number(result?.changed) || 0;
    return changed > 0
      ? `Vakantiemodus uit · ${taskCount(changed)} verschoven`
      : 'Vakantiemodus uit · niets verschoven';
  });
}

/** Weergavenaam van een persoon uit de staat (anders het id). */
function personName(assigneeId) {
  return store.get().data?.assignees
    ?.find((p) => p.id === assigneeId)?.name || assigneeId;
}

/**
 * Hetzelfde verloop als vacationCall, maar per persoon (v2.7): de bedoeling
 * staat in absenceBusy[id], het concept in absenceDrafts[id]. Een aanroep
 * voor Laura houdt de schakelaar van Martijn dus niet tegen.
 */
async function absenceCall(ctx, assigneeId, intent, call) {
  if (store.get().absenceBusy[assigneeId]) return;
  store.set({ absenceBusy: { ...store.get().absenceBusy, [assigneeId]: intent } });
  let done = false;
  try {
    try {
      const text = await call();
      done = true;
      ctx.showSnackbar(text);
    } catch (err) {
      ctx.showSnackbar(errorText(err), { error: true });
    }
    await ctx.refresh();
  } finally {
    const { absenceBusy, absenceDrafts } = store.get();
    const busy = { ...absenceBusy };
    delete busy[assigneeId];
    const patch = { absenceBusy: busy };
    if (done) {
      const drafts = { ...absenceDrafts };
      delete drafts[assigneeId];
      patch.absenceDrafts = drafts;
    }
    store.set(patch);
  }
}

/** Schakelaar "Afwezig" aan: tot en met de gekozen datum, of open. */
export async function absenceStart(ctx, assigneeId) {
  await absenceCall(ctx, assigneeId, 'start', async () => {
    const { absenceDrafts, data } = store.get();
    const until = absenceDrafts[assigneeId] || null;
    await api.absenceStart(assigneeId, until);
    const name = personName(assigneeId);
    return until
      ? `${name} is afwezig · tot en met ${dayMonth(until, data?.today)}`
      : `${name} is afwezig`;
  });
}

/** "Datum opslaan" bij een lopende afwezigheid: wijzigen of wissen. */
export async function absenceSaveUntil(ctx, assigneeId) {
  if (!(assigneeId in store.get().absenceDrafts)) return;
  await absenceCall(ctx, assigneeId, 'update', async () => {
    const until = store.get().absenceDrafts[assigneeId] || null;
    await api.absenceUpdate(assigneeId, until);
    const name = personName(assigneeId);
    return until
      ? `Opgeslagen: ${name} tot en met ${dayMonth(until, store.get().data?.today)}`
      : `Opgeslagen: ${name} zonder einddatum`;
  });
}

/** Schakelaar "Afwezig" uit: de persoon is vandaag terug. */
export async function absenceEnd(ctx, assigneeId) {
  await absenceCall(ctx, assigneeId, 'end', async () => {
    await api.absenceEnd(assigneeId);
    return `${personName(assigneeId)} is weer terug`;
  });
}
