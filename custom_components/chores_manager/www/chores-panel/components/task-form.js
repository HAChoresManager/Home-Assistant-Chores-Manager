/**
 * Het taakformulier (3b) — de plek waar de oude app het slechtst was: acht
 * overlappende planningsvelden die elkaar tegenspraken.
 *
 * Nu heeft elk schedule_type precies één configuratievorm en weerspiegelt het
 * formulier dat: kies eerst het type, dan verschijnen alléén de velden die
 * daarbij horen. Nooit twee velden zichtbaar die hetzelfde regelen. Het
 * tonen/verbergen gebeurt in de DOM (data-switch in chores-panel.js), zonder
 * re-render, zodat ingevuld werk blijft staan.
 */
import { esc, html } from '../core/html.js?v=2.1.0-20260728-fase3b';

const WEEKDAY_OPTIONS = [
  [1, 'maandag'], [2, 'dinsdag'], [3, 'woensdag'], [4, 'donderdag'],
  [5, 'vrijdag'], [6, 'zaterdag'], [7, 'zondag'],
];
const MONTH_OPTIONS = [
  [1, 'januari'], [2, 'februari'], [3, 'maart'], [4, 'april'], [5, 'mei'],
  [6, 'juni'], [7, 'juli'], [8, 'augustus'], [9, 'september'],
  [10, 'oktober'], [11, 'november'], [12, 'december'],
];

export function slugify(name) {
  return name.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function options(pairs, selected) {
  return pairs.map(([value, label]) => html`
    <option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`);
}

function scheduleFields(chore) {
  const type = chore?.schedule_type || 'daily';
  const cfg = chore?.schedule_config || {};
  const weekdays = new Set(cfg.weekdays || [1, 2, 3, 4, 5, 6, 7]);
  return html`
    <label class="field">Planning
      <select name="schedule_type" data-switch="schedule">
        ${options([['daily', 'dagelijks (kies dagen)'], ['weekly', 'wekelijks'],
    ['monthly', 'maandelijks'], ['interval', 'om de zoveel dagen'],
    ['yearly', 'jaarlijks']], type)}
      </select>
    </label>
    <div class="field-group" data-switch-group="schedule" data-switch-value="daily"
      ${type === 'daily' ? '' : 'hidden'}>
      <span class="field-label">Op welke dagen</span>
      <div class="checks">
        ${WEEKDAY_OPTIONS.map(([value, label]) => html`
          <label class="check"><input type="checkbox" name="weekdays" value="${value}"
            ${weekdays.has(value) ? 'checked' : ''}>${label.slice(0, 2)}</label>`)}
      </div>
    </div>
    <div class="field-group" data-switch-group="schedule" data-switch-value="weekly"
      ${type === 'weekly' ? '' : 'hidden'}>
      <label class="field">Op welke dag
        <select name="weekday">${options(WEEKDAY_OPTIONS, cfg.weekday || 1)}</select>
      </label>
    </div>
    <div class="field-group" data-switch-group="schedule" data-switch-value="monthly"
      ${type === 'monthly' ? '' : 'hidden'}>
      <label class="field">Op de hoeveelste
        <input type="number" name="monthday" min="1" max="31" value="${cfg.monthday || 1}">
      </label>
    </div>
    <div class="field-group" data-switch-group="schedule" data-switch-value="interval"
      ${type === 'interval' ? '' : 'hidden'}>
      <label class="field">Om de hoeveel dagen
        <input type="number" name="interval_days" min="1" max="3650" value="${cfg.days || 30}">
      </label>
    </div>
    <div class="field-group" data-switch-group="schedule" data-switch-value="yearly"
      ${type === 'yearly' ? '' : 'hidden'}>
      <label class="field">Maand
        <select name="year_month">${options(MONTH_OPTIONS, cfg.month || 1)}</select>
      </label>
      <label class="field">Dag
        <input type="number" name="year_day" min="1" max="31" value="${cfg.day || 1}">
      </label>
    </div>`;
}

function assignmentFields(chore, assignees) {
  const type = chore?.assignment_type || 'anyone';
  const rotation = chore?.rotation || [];
  const inRotation = new Set(rotation);
  const currentTurn = chore && type === 'rotating' && rotation.length
    ? rotation[chore.rotation_index % rotation.length] : null;
  return html`
    <label class="field">Wie
      <select name="assignment_type" data-switch="assignment">
        ${options([['anyone', 'wie kan'], ['fixed', 'altijd dezelfde persoon'],
    ['rotating', 'om de beurt']], type)}
      </select>
    </label>
    <div class="field-group" data-switch-group="assignment" data-switch-value="fixed"
      ${type === 'fixed' ? '' : 'hidden'}>
      <label class="field">Persoon
        <select name="assigned_to">
          ${options(assignees.map((p) => [p.id, p.name]), chore?.assigned_to || assignees[0]?.id)}
        </select>
      </label>
    </div>
    <div class="field-group" data-switch-group="assignment" data-switch-value="rotating"
      ${type === 'rotating' ? '' : 'hidden'}
      data-rotation-original="${esc(JSON.stringify(rotation))}">
      <span class="field-label">Wie doen er mee</span>
      <div class="checks">
        ${assignees.map((person) => html`
          <label class="check"><input type="checkbox" name="rotation" value="${person.id}"
            ${inRotation.has(person.id) ? 'checked' : ''}>${person.name}</label>`)}
      </div>
      ${rotation.length
    ? html`<p class="field-hint">Volgorde: ${rotation.join(' → ')}.
          ${currentTurn ? html`Nu aan de beurt: <strong>${currentTurn}</strong>.` : ''}</p>`
    : html`<p class="field-hint">Nieuwe leden komen achteraan in de volgorde.</p>`}
    </div>`;
}

function subtaskFields(chore) {
  const mode = chore?.subtask_mode || '';
  const steps = (chore?.subtasks || []).map((s) => s.name).join('\n');
  return html`
    <label class="field">Deeltaken
      <select name="subtask_mode" data-switch="subtasks">
        ${options([['', 'geen'], ['checklist', 'checklist (vaste stappen)'],
    ['counter', 'teller (x keer per ronde)']], mode)}
      </select>
    </label>
    <div class="field-group" data-switch-group="subtasks" data-switch-value="checklist"
      ${mode === 'checklist' ? '' : 'hidden'}>
      <label class="field">Stappen (één per regel)
        <textarea name="subtask_steps" rows="4">${steps}</textarea>
      </label>
    </div>
    <div class="field-group" data-switch-group="subtasks" data-switch-value="counter"
      ${mode === 'counter' ? '' : 'hidden'}>
      <label class="field">Hoe vaak per ronde
        <input type="number" name="subtask_target" min="1" value="${chore?.subtask_target || 8}">
      </label>
    </div>`;
}

export function renderChoreForm(chore, ctx) {
  const isNew = !chore;
  return html`
    <form data-form="chore" class="manage-form" novalidate>
      <h2 class="section-title">${isNew ? 'Nieuwe taak' : html`Bewerken: ${chore.name}`}</h2>
      ${isNew ? '' : html`<input type="hidden" name="id" value="${chore.id}">`}
      <label class="field">Naam
        <input type="text" name="name" required value="${chore?.name || ''}">
      </label>
      <label class="field">Icoon
        <input type="text" name="icon" class="short" maxlength="4" value="${chore?.icon || '📋'}">
      </label>
      <label class="field">Beschrijving
        <textarea name="description" rows="2">${chore?.description || ''}</textarea>
      </label>
      <label class="field">Duur (minuten)
        <input type="number" name="duration_minutes" min="1" value="${chore?.duration_minutes || 15}">
      </label>
      <label class="field">Prioriteit
        <select name="priority">
          ${options([['low', 'laag'], ['normal', 'normaal'], ['high', 'hoog'],
    ['critical', 'kritiek']], chore?.priority || 'normal')}
        </select>
      </label>
      ${scheduleFields(chore)}
      ${assignmentFields(chore, ctx.assignees)}
      ${subtaskFields(chore)}
      <label class="field">Eerstvolgende keer
        <input type="date" name="next_due" value="${chore?.next_due || ''}">
        <span class="field-hint">${isNew ? 'Leeg laten = automatisch op de eerstvolgende geplande dag.' : 'De huidige vervaldatum; aanpassen mag.'}</span>
      </label>
      <p class="form-error" data-form-error hidden></p>
      <div class="form-actions">
        <button type="submit" class="primary">Opslaan</button>
        <button type="button" class="secondary" data-action="form-cancel">Annuleren</button>
      </div>
    </form>`;
}

/** Lees het formulier terug naar één taakobject voor chore/save. */
export function collectChoreForm(form) {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  if (!name) throw new Error('Geef de taak een naam.');
  const id = String(data.get('id') || '') || slugify(name);
  if (!id) throw new Error('De naam moet minstens één letter of cijfer bevatten.');

  const scheduleType = String(data.get('schedule_type'));
  let config;
  if (scheduleType === 'daily') {
    const weekdays = data.getAll('weekdays').map(Number);
    if (!weekdays.length) throw new Error('Kies minstens één dag.');
    config = { weekdays };
  } else if (scheduleType === 'weekly') {
    config = { weekday: Number(data.get('weekday')) };
  } else if (scheduleType === 'monthly') {
    config = { monthday: Number(data.get('monthday')) };
  } else if (scheduleType === 'interval') {
    config = { days: Number(data.get('interval_days')) };
  } else {
    config = { month: Number(data.get('year_month')), day: Number(data.get('year_day')) };
  }

  const assignmentType = String(data.get('assignment_type'));
  const chore = {
    id,
    name,
    icon: String(data.get('icon') || '📋').trim() || '📋',
    description: String(data.get('description') || '').trim(),
    duration_minutes: Number(data.get('duration_minutes')) || 15,
    priority: String(data.get('priority')),
    schedule_type: scheduleType,
    schedule_config: config,
    assignment_type: assignmentType,
  };

  if (assignmentType === 'fixed') {
    chore.assigned_to = String(data.get('assigned_to') || '');
  } else if (assignmentType === 'rotating') {
    const checked = data.getAll('rotation').map(String);
    if (checked.length < 2) throw new Error('Een rotatie heeft minstens twee personen nodig.');
    // bestaande volgorde behouden; nieuwe leden achteraan
    const group = form.querySelector('[data-rotation-original]');
    const original = JSON.parse(group?.dataset.rotationOriginal || '[]');
    chore.rotation = [
      ...original.filter((pid) => checked.includes(pid)),
      ...checked.filter((pid) => !original.includes(pid)),
    ];
  }

  const subtaskMode = String(data.get('subtask_mode') || '');
  if (subtaskMode === 'counter') {
    chore.subtask_mode = 'counter';
    chore.subtask_target = Number(data.get('subtask_target')) || 1;
    chore.subtasks = [];
  } else if (subtaskMode === 'checklist') {
    chore.subtask_mode = 'checklist';
    const steps = String(data.get('subtask_steps') || '')
      .split('\n').map((s) => s.trim()).filter(Boolean);
    if (!steps.length) throw new Error('Een checklist heeft minstens één stap nodig.');
    chore.subtasks = steps;
  } else {
    chore.subtask_mode = null;
    chore.subtasks = [];
  }

  const nextDue = String(data.get('next_due') || '');
  if (nextDue) chore.next_due = nextDue;
  return chore;
}
