/**
 * Taakkaart: icoon, naam, persoonschipje, duur en urgentie (§4.3), met één
 * duidelijke primaire actie: afvinken.
 *
 * Het chipje (§4.4) toont wie de credits krijgt en is tikbaar: standaard de
 * toewijzing, tikken opent de keuze uit alle actieve personen. Zo blijft het
 * gewone geval één tik en is "Laura deed Martijns taak" er twee. Bij 'anyone'
 * is het chipje neutraal ("wie kan") en opent Afvinken zelf de keuze.
 *
 * Twee keuzemodi lopen door dezelfde personenrij: mode 'complete' vinkt af
 * bij de keuze (de anyone-flow), mode 'credit' zet alleen het chipje.
 *
 * Op het scherm Alles (ctx.view 'tasks') toont de kaart vervaldatum en
 * planningsetiket, en staat de checklist ingeklapt achter "0 / 4 stappen".
 */
import { html } from '../core/html.js?v=2.1.1-20260728-fase3b';
import {
  dueLabel,
  formatDuration,
  overdueLabel,
  scheduleLabel,
} from '../core/format.js?v=2.1.1-20260728-fase3b';

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

/** Wie krijgt de credits: het chipje als dat gezet is, anders de toewijzing. */
export function creditAssignee(chore, credits) {
  if (credits && credits[chore.id]) return credits[chore.id];
  return chore.assignment_type === 'anyone' ? null : chore.current_assignee;
}

function chip(chore, ctx) {
  const creditId = creditAssignee(chore, ctx.credits);
  if (!creditId) {
    return html`<button type="button" class="chip neutral" data-action="choose-credit"
      data-chore="${chore.id}" title="Kies wie het doet">wie kan<span class="chip-caret">▾</span></button>`;
  }
  const person = ctx.assigneesById[creditId];
  return html`<button type="button" class="chip" data-action="choose-credit"
    data-chore="${chore.id}" title="Kies wie de credits krijgt">
    <span class="dot" style="--person-color: ${person ? person.color : 'var(--divider-color)'}"></span>${person ? person.name : creditId}<span class="chip-caret">▾</span></button>`;
}

function personButtons(chore, ctx, subtaskId, action) {
  const label = action === 'set-credit' ? 'Wie krijgt de credits?' : 'Wie heeft het gedaan?';
  const buttons = ctx.assignees.map((person) => html`
    <button type="button" class="person" data-action="${action}" data-chore="${chore.id}"
      data-assignee="${person.id}"
      ${subtaskId !== undefined ? html`data-subtask="${subtaskId}"` : ''}>
      <span class="dot" style="--person-color: ${person.color}"></span>${person.name}
    </button>`);
  return html`
    <div class="chooser" role="group" aria-label="${label}">
      <span class="chooser-label">${label}</span>
      ${buttons}
      <button type="button" class="person cancel" data-action="cancel-choose">Toch niet</button>
    </div>`;
}

function completeButton(chore, subtaskId, creditId) {
  if (!creditId) {
    return html`<button type="button" class="primary" data-action="choose"
      data-chore="${chore.id}"
      ${subtaskId !== undefined ? html`data-subtask="${subtaskId}"` : ''}>Afvinken</button>`;
  }
  return html`<button type="button" class="primary" data-action="complete"
    data-chore="${chore.id}" data-assignee="${creditId}"
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

function checklistBlock(chore, ctx, creditId) {
  const done = new Set(chore.subtasks_done || []);
  const total = (chore.subtasks || []).length;

  if (ctx.view === 'tasks' && !ctx.expanded.has(chore.id)) {
    return html`
      <button type="button" class="steps-toggle" data-action="toggle-steps" data-chore="${chore.id}"
        aria-expanded="false">${done.size} / ${total} stappen<span class="chip-caret">▸</span></button>`;
  }

  const rows = (chore.subtasks || []).map((step) => {
    if (done.has(step.id)) {
      return html`<li class="step done"><span class="step-mark">✓</span>${step.name}</li>`;
    }
    const chooserOpen = ctx.chooser
      && ctx.chooser.choreId === chore.id && ctx.chooser.subtaskId === step.id;
    if (chooserOpen) {
      return html`<li class="step">${personButtons(chore, ctx, step.id,
        ctx.chooser.mode === 'credit' ? 'set-credit' : 'pick')}</li>`;
    }
    return html`<li class="step">
      <button type="button" class="step-button"
        data-action="${creditId ? 'complete' : 'choose'}"
        data-chore="${chore.id}" data-subtask="${step.id}"
        ${creditId ? html`data-assignee="${creditId}"` : ''}>
        <span class="step-mark open"></span>${step.name}
      </button>
    </li>`;
  });
  const toggle = ctx.view === 'tasks'
    ? html`<button type="button" class="steps-toggle" data-action="toggle-steps"
        data-chore="${chore.id}" aria-expanded="true">${done.size} / ${total} stappen<span class="chip-caret">▾</span></button>`
    : html`<span class="progress-count">${done.size} / ${total} stappen</span>`;
  return html`
    <div class="checklist">
      ${toggle}
      <ul class="steps">${rows}</ul>
    </div>`;
}

export function renderTaskCard(chore, ctx) {
  const days = chore.overdue_days || 0;
  const badge = days > 0
    ? html`<span class="badge ${chore.urgency}">${overdueLabel(days, chore.next_due, ctx.todayIso)}</span>`
    : '';
  const creditId = creditAssignee(chore, ctx.credits);
  const isChecklist = chore.subtask_mode === 'checklist';
  const cardChooser = ctx.chooser
    && ctx.chooser.choreId === chore.id && ctx.chooser.subtaskId === undefined;

  const planning = ctx.view === 'tasks'
    ? html` · ${dueLabel(chore.next_due, ctx.todayIso)}
        · ${scheduleLabel(chore.schedule_type, chore.schedule_config)}`
    : '';

  // De keuzerij vervangt de plek waar hij vandaan komt: de kaartactie bij
  // 'complete'-modus, en (visueel hetzelfde) bij 'credit'-modus.
  let action = '';
  if (cardChooser) {
    action = personButtons(chore, ctx, undefined,
      ctx.chooser.mode === 'credit' ? 'set-credit' : 'pick');
  } else if (!isChecklist) {
    action = completeButton(chore, undefined, creditId);
  }

  return html`
    <article class="card ${chore.urgency}" data-chore-card="${chore.id}">
      <span class="card-icon" aria-hidden="true">${chore.icon}</span>
      <div class="card-body">
        <h3 class="card-name">${chore.name}</h3>
        <p class="card-meta">
          ${chip(chore, ctx)}
          <span class="meta-text">· ${formatDuration(chore.duration_minutes)}${planning}</span>
          ${badge}
        </p>
        ${chore.description ? html`<p class="card-description">${chore.description}</p>` : ''}
        ${chore.subtask_mode === 'counter' ? counterBlock(chore) : ''}
        ${isChecklist ? checklistBlock(chore, ctx, creditId) : ''}
      </div>
      ${action ? html`<div class="card-action">${action}</div>` : ''}
    </article>`;
}
