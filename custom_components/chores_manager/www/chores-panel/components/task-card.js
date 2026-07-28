/**
 * Taakkaart: icoon, naam, wie aan de beurt is, duur en urgentie (§4.3), met
 * één duidelijke primaire actie: afvinken.
 *
 * Bij 'anyone' klapt de kaart een wie-deed-het-keuze open; bij 'fixed' en
 * 'rotating' is de persoon bekend en vragen we niets. Counter-taken tonen
 * voortgang met een balk; checklist-taken tonen hun stappen als afvinkbare
 * rijen. Bewerken komt in fase 3b — de kaart houdt er ruimte voor, maar
 * bouwt het niet.
 */
import { html } from '../core/html.js?v=2.0.0-20260728-fase3a';
import { formatDuration, overdueLabel } from '../core/format.js?v=2.0.0-20260728-fase3a';

/**
 * Maakt deze actie de taak in één keer af? Bepaalt of we optimistisch mogen
 * doen alsof de kaart weg is (chores-panel.js draait het terug bij een fout).
 */
export function isFinalAction(chore, subtaskId) {
  if (chore.subtask_mode === 'counter') {
    return (chore.counter_ticks || 0) + 1 >= (chore.subtask_target || 1);
  }
  if (chore.subtask_mode === 'checklist') {
    if (subtaskId === undefined) return true; // "rest in één keer afronden"
    return (chore.subtasks_done || []).length + 1 >= (chore.subtasks || []).length;
  }
  return true;
}

function assigneeName(chore, assigneesById) {
  if (chore.assignment_type === 'anyone') return 'wie kan';
  const person = assigneesById[chore.current_assignee];
  return person ? person.name : chore.current_assignee;
}

function personButtons(chore, assignees, subtaskId) {
  const buttons = assignees.map((person) => html`
    <button class="person" data-action="pick" data-chore="${chore.id}"
      data-assignee="${person.id}"
      ${subtaskId !== undefined ? html`data-subtask="${subtaskId}"` : ''}>
      <span class="dot" style="--person-color: ${person.color}"></span>${person.name}
    </button>`);
  return html`
    <div class="chooser" role="group" aria-label="Wie heeft het gedaan?">
      <span class="chooser-label">Wie heeft het gedaan?</span>
      ${buttons}
      <button class="person cancel" data-action="cancel-choose">Toch niet</button>
    </div>`;
}

function primaryButton(chore, subtaskId) {
  const anyone = chore.assignment_type === 'anyone';
  if (anyone) {
    return html`<button class="primary" data-action="choose"
      data-chore="${chore.id}"
      ${subtaskId !== undefined ? html`data-subtask="${subtaskId}"` : ''}>Afvinken</button>`;
  }
  return html`<button class="primary" data-action="complete"
    data-chore="${chore.id}" data-assignee="${chore.current_assignee}"
    ${subtaskId !== undefined ? html`data-subtask="${subtaskId}"` : ''}>Afvinken</button>`;
}

function counterBlock(chore) {
  const target = chore.subtask_target || 1;
  const ticks = Math.min(chore.counter_ticks || 0, target);
  const percent = Math.round((ticks / target) * 100);
  return html`
    <div class="progress" role="progressbar" aria-valuenow="${ticks}"
      aria-valuemin="0" aria-valuemax="${target}"
      aria-label="Voortgang: ${ticks} van ${target}">
      <span class="progress-count">${ticks} / ${target}</span>
      <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
    </div>`;
}

function checklistBlock(chore, ctx) {
  const done = new Set(chore.subtasks_done || []);
  const anyone = chore.assignment_type === 'anyone';
  const rows = (chore.subtasks || []).map((step) => {
    if (done.has(step.id)) {
      return html`<li class="step done"><span class="step-mark">✓</span>${step.name}</li>`;
    }
    const chooserOpen = ctx.chooser
      && ctx.chooser.choreId === chore.id && ctx.chooser.subtaskId === step.id;
    if (chooserOpen) {
      return html`<li class="step">${personButtons(chore, ctx.assignees, step.id)}</li>`;
    }
    return html`<li class="step">
      <button class="step-button"
        data-action="${anyone ? 'choose' : 'complete'}"
        data-chore="${chore.id}" data-subtask="${step.id}"
        ${anyone ? '' : html`data-assignee="${chore.current_assignee}"`}>
        <span class="step-mark open"></span>${step.name}
      </button>
    </li>`;
  });
  const total = (chore.subtasks || []).length;
  return html`
    <div class="checklist">
      <span class="progress-count">${done.size} / ${total} stappen</span>
      <ul class="steps">${rows}</ul>
    </div>`;
}

export function renderTaskCard(chore, ctx) {
  const days = chore.overdue_days || 0;
  const badge = days > 0
    ? html`<span class="badge ${chore.urgency}">${overdueLabel(days)}</span>`
    : '';
  const chooserOpen = ctx.chooser
    && ctx.chooser.choreId === chore.id && ctx.chooser.subtaskId === undefined;
  const isChecklist = chore.subtask_mode === 'checklist';

  // De checklist is het actiegebied van de kaart en staat op volle breedte in
  // de body; de andere vormen krijgen één knop (of de wie-deed-het-keuze) in
  // het actieslot.
  let action = '';
  if (!isChecklist) {
    action = chooserOpen
      ? personButtons(chore, ctx.assignees, undefined)
      : primaryButton(chore, undefined);
  }

  return html`
    <article class="card ${chore.urgency}" data-chore-card="${chore.id}">
      <span class="card-icon" aria-hidden="true">${chore.icon}</span>
      <div class="card-body">
        <h3 class="card-name">${chore.name}</h3>
        <p class="card-meta">
          ${assigneeName(chore, ctx.assigneesById)}
          · ${formatDuration(chore.duration_minutes)}
          ${badge}
        </p>
        ${chore.description ? html`<p class="card-description">${chore.description}</p>` : ''}
        ${chore.subtask_mode === 'counter' ? counterBlock(chore) : ''}
        ${isChecklist ? checklistBlock(chore, ctx) : ''}
      </div>
      ${action ? html`<div class="card-action">${action}</div>` : ''}
    </article>`;
}
