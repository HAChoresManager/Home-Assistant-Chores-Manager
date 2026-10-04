/**
 * Losse bedieningselementen in Beheer, buiten de formulieren: de
 * vakantieschakelaar met zijn datumveld, en (sinds v2.7) per persoon de
 * schakelaar "Afwezig" met een datumveld "tot en met".
 *
 * Afgesplitst uit chores-panel.js toen dat tegen de 600 regels liep: het
 * element vangt de change-events (delegatie op de shadow root) en geeft ze
 * hier door; wat er met een schakelaar of datum gebeurt, staat hier.
 *
 * Dezelfde render-discipline voor beide:
 * - De schakelaar roept meteen de server aan (actions.js); zolang die
 *   aanroep loopt, staat de bedoeling in de store (vacationBusy,
 *   absenceBusy) en tonen schakelaar en datumveld die — uitgeschakeld —
 *   in plaats van terug te springen naar de oude serverstand.
 * - Een gekozen datum is eerst een concept, stil in de store
 *   (vacationDraft, absenceDrafts): Chromium vuurt change al bij elke
 *   geldige tussenstand tijdens het typen (de "2" van "24"), en een render
 *   zou het veld dan onder de vingers vervangen. Uitleg en "Datum opslaan"
 *   worden hier rechtstreeks in de DOM bijgewerkt; een latere render toont
 *   het concept uit de store. De server hoort de datum pas bij de
 *   schakelaar of bij "Datum opslaan".
 */
import { store } from './core/store.js';
import * as actions from './actions.js';
import { absenceExplain, vacationExplain } from './views/manage.js';

/**
 * Half ingevuld of half gewist (één segment leeg: value '' maar badInput)
 * is nog geen keuze, en een half getypt jaar (0002, 0020, 0202) ook niet:
 * dan blijft het laatste complete concept staan. Alleen een helemaal leeg
 * veld betekent "geen einddatum". Een complete datum vóór vandaag telt
 * wél — de uitleg zegt dan dat hij niet kan, en de server weigert hem.
 */
function draftValue(input) {
  if (input.validity?.badInput) return null;
  const { value } = input;
  if (value && value.slice(0, 4) < '1000') return null;
  return value;
}

/** Gekozen "tot en met" van de vakantie als concept; gelijk aan de
 * serverwaarde → geen concept meer (dan ook geen "Datum opslaan"). */
function setVacationDraft(input) {
  const value = draftValue(input);
  if (value === null) return;
  const { data } = store.get();
  const vacation = data?.vacation?.active ? data.vacation : null;
  const serverValue = vacation?.until ?? '';
  const vacationDraft = value === serverValue ? null : value;
  store.set({ vacationDraft }, { quiet: true });
  const section = input.closest('section');
  const hint = section?.querySelector('[data-vacation-hint]');
  if (hint) hint.textContent = vacationExplain(vacation, value, data?.today);
  const save = section?.querySelector('[data-action="vacation-save-until"]');
  if (save) save.hidden = !(vacation && vacationDraft !== null);
}

/** Hetzelfde per persoon: het concept staat in absenceDrafts[id]. */
function setAbsenceDraft(input, assigneeId) {
  const value = draftValue(input);
  if (value === null) return;
  const { data, absenceDrafts } = store.get();
  const absence = (data?.absences || []).find((a) => a.assignee_id === assigneeId) || null;
  const person = (data?.assignees || []).find((p) => p.id === assigneeId);
  const serverValue = absence?.until ?? '';
  const drafts = { ...absenceDrafts };
  if (value === serverValue) delete drafts[assigneeId];
  else drafts[assigneeId] = value;
  store.set({ absenceDrafts: drafts }, { quiet: true });
  const block = input.closest('[data-absence-block]');
  const hint = block?.querySelector('[data-absence-hint]');
  if (hint) hint.textContent = absenceExplain(person?.name || assigneeId, value, data?.today);
  const save = block?.querySelector('[data-action="absence-save-until"]');
  if (save) save.hidden = !(absence && assigneeId in drafts);
}

/**
 * Een change-event uit Beheer afhandelen; true als het hier hoorde. De
 * browser heeft een schakelaar al omgezet; de actie zet hem na de refresh
 * weer op de stand van de server, ook bij een fout.
 */
export async function handleControlChange(ctx, input) {
  if (!(input instanceof HTMLInputElement)) return false;
  if (input.name === 'vacation-toggle') {
    if (input.checked) await actions.vacationStart(ctx);
    else await actions.vacationEnd(ctx);
    return true;
  }
  if (input.name === 'vacation-until') {
    setVacationDraft(input);
    return true;
  }
  const assigneeId = input.dataset.absence;
  if (!assigneeId) return false;
  if (input.type === 'checkbox') {
    if (input.checked) await actions.absenceStart(ctx, assigneeId);
    else await actions.absenceEnd(ctx, assigneeId);
  } else {
    setAbsenceDraft(input, assigneeId);
  }
  return true;
}
