/**
 * Het scherm Beheer (3b): taken en personen aanmaken, bewerken, verwijderen.
 *
 * Verwijderen volgt het 2b-besluit en zegt vooraf wat er gebeurt: een taak
 * mét historie wordt gearchiveerd (de historie blijft zichtbaar bij
 * Activiteit), zonder historie gaat hij echt weg. Personen idem, inclusief
 * rotatielidmaatschap.
 */
import { html } from '../core/html.js';
import { scheduleLabel } from '../core/format.js';
import { FOLLOW_HA } from '../core/theme.js';
import { renderChoreForm, slugify } from '../components/task-form.js';

function choreRow(chore) {
  return html`
    <li class="manage-row">
      <span class="card-icon" aria-hidden="true">${chore.icon}</span>
      <span class="manage-text">
        <span class="manage-name">${chore.name}</span>
        <span class="manage-sub">${scheduleLabel(chore.schedule_type, chore.schedule_config)}</span>
      </span>
      <button type="button" class="secondary" data-action="edit-chore"
        data-chore="${chore.id}">Bewerken</button>
    </li>`;
}

function assigneeRow(person) {
  return html`
    <li class="manage-row">
      <span class="dot" style="--person-color: ${person.color}"></span>
      <span class="manage-text">
        <span class="manage-name">${person.name}</span>
        ${person.include_in_leaderboard ? '' : html`<span class="manage-sub">buiten de ranglijst</span>`}
      </span>
      <button type="button" class="secondary" data-action="edit-assignee"
        data-assignee="${person.id}">Bewerken</button>
    </li>`;
}

function themeSection(themes) {
  // Presentatie, geen data (3c): de keuze leeft in localStorage van dit
  // apparaat; de afhandeling zit in de panel-theme-handler van het element.
  if (!themes || !themes.names.length) return '';
  return html`
    <section>
      <h2 class="section-title">Weergave</h2>
      <label class="field">Thema van dit panel
        <select name="panel-theme">
          <option value="${FOLLOW_HA}">Volg Home Assistant</option>
          ${themes.names.map((name) => html`
            <option value="${name}" ${themes.selected === name ? 'selected' : ''}>${name}</option>`)}
        </select>
      </label>
      <p class="field-hint">Geldt alleen voor dit apparaat; andere schermen houden hun eigen keuze.</p>
    </section>`;
}

function deleteBlock(kind, subject, confirm) {
  // kind 'chore': has_history bepaalt archiveren/verwijderen; kind
  // 'assignee': in_use. De tekst zegt eerlijk wat er gebeurt (B4).
  const archives = kind === 'chore' ? subject.has_history : subject.in_use;
  const verb = archives ? 'Archiveren' : 'Verwijderen';
  const explain = kind === 'chore'
    ? (archives
      ? 'De taak verdwijnt uit alle lijsten; de historie blijft zichtbaar bij Activiteit.'
      : 'Deze taak heeft nog geen historie en wordt definitief verwijderd.')
    : (archives
      ? 'De persoon verdwijnt uit alle lijsten; historie en beurten blijven kloppen.'
      : 'Deze persoon heeft nog geen historie en wordt definitief verwijderd.');
  if (!confirm) {
    return html`
      <div class="danger-zone">
        <button type="button" class="danger" data-action="delete-ask">${verb}…</button>
      </div>`;
  }
  return html`
    <div class="danger-zone confirm">
      <p>${explain}</p>
      <button type="button" class="danger" data-action="delete-confirm">Ja, ${verb.toLowerCase()}</button>
      <button type="button" class="secondary" data-action="delete-cancel">Toch niet</button>
    </div>`;
}

function assigneeForm(person, confirm, haOptions) {
  const isNew = !person;
  const users = haOptions?.users || [];
  const services = haOptions?.services || [];
  const linkedUser = person?.ha_user_id || '';
  const userKnown = users.some((u) => u.id === linkedUser);
  const service = person?.notify_service || '';
  const serviceKnown = services.includes(service);
  return html`
    <form data-form="assignee" class="manage-form" novalidate>
      <h2 class="section-title">${isNew ? 'Nieuwe persoon' : html`Bewerken: ${person.name}`}</h2>
      ${isNew ? '' : html`<input type="hidden" name="id" value="${person.id}">`}
      <label class="field">Naam
        <input type="text" name="name" required value="${person?.name || ''}">
      </label>
      <label class="field">Kleur
        <input type="color" name="color" value="${person?.color || '#7cb342'}">
      </label>
      <label class="check standalone">
        <input type="checkbox" name="include_in_leaderboard"
          ${!person || person.include_in_leaderboard ? 'checked' : ''}>
        Telt mee in de ranglijst
      </label>

      <h2 class="section-title">Koppeling en meldingen</h2>
      <label class="field">Home Assistant-gebruiker
        <select name="ha_user_id">
          <option value="">Niet gekoppeld</option>
          ${linkedUser && !userKnown
            ? html`<option value="${linkedUser}" selected>${linkedUser} (huidige koppeling)</option>` : ''}
          ${users.map((u) => html`
            <option value="${u.id}" ${u.id === linkedUser ? 'selected' : ''}>${u.name}</option>`)}
        </select>
      </label>
      <label class="field">Meldingen naar
        <select name="notify_service">
          <option value="">Geen meldingen</option>
          ${services.map((name) => html`
            <option value="${name}" ${name === service ? 'selected' : ''}>${name}</option>`)}
        </select>
      </label>
      <label class="field">Andere service (als hij hierboven niet staat)
        <input type="text" name="notify_service_custom" placeholder="notify.…"
          value="${service && !serviceKnown ? service : ''}">
      </label>
      <label class="check standalone">
        <input type="checkbox" name="notifications_enabled"
          ${!person || person.notifications_enabled ? 'checked' : ''}>
        Meldingen aan
      </label>

      <p class="form-error" data-form-error hidden></p>
      <div class="form-actions">
        <button type="submit" class="primary">Opslaan</button>
        <button type="button" class="secondary" data-action="form-cancel">Annuleren</button>
      </div>
      ${isNew ? '' : deleteBlock('assignee', person, confirm)}
    </form>`;
}

export function renderManage(state) {
  const data = state.data;
  const editing = state.editing;
  const ctx = { assignees: data.assignees };

  if (editing && editing.kind === 'chore') {
    const chore = editing.id ? data.chores.find((c) => c.id === editing.id) : null;
    if (editing.id && !chore) return html`<p class="status">Taak niet gevonden.</p>`;
    return html`
      ${renderChoreForm(chore, ctx)}
      ${chore ? deleteBlock('chore', chore, editing.confirm) : ''}`;
  }
  if (editing && editing.kind === 'assignee') {
    const person = editing.id ? data.assignees.find((a) => a.id === editing.id) : null;
    if (editing.id && !person) return html`<p class="status">Persoon niet gevonden.</p>`;
    return assigneeForm(person, editing.confirm, state.haOptions);
  }

  return html`
    <header class="page-header">
      <h1 class="page-count">Beheer</h1>
    </header>
    <section>
      <h2 class="section-title">Taken</h2>
      <ul class="manage-rows">${data.chores.map(choreRow)}</ul>
      <button type="button" class="secondary add" data-action="new-chore">+ Nieuwe taak</button>
    </section>
    <section>
      <h2 class="section-title">Personen</h2>
      <ul class="manage-rows">${data.assignees.map(assigneeRow)}</ul>
      <button type="button" class="secondary add" data-action="new-assignee">+ Nieuwe persoon</button>
    </section>
    ${archivedSection(data.archived_chores || [])}
    ${themeSection(state.themes)}`;
}

function archivedRow(chore) {
  return html`
    <li class="manage-row">
      <span class="card-icon" aria-hidden="true">${chore.icon}</span>
      <span class="manage-text">
        <span class="manage-name">${chore.name}</span>
        <span class="manage-sub">${scheduleLabel(chore.schedule_type, chore.schedule_config)}</span>
      </span>
      <button type="button" class="secondary" data-action="restore-chore"
        data-chore="${chore.id}">Terugzetten</button>
    </li>`;
}

function archivedSection(archived) {
  // Ingeklapt via <details>: geen state, geen render nodig voor open/dicht.
  if (!archived.length) return '';
  return html`
    <details class="archived">
      <summary class="section-title">Gearchiveerd (${archived.length})</summary>
      <p class="manage-sub">Terugzetten maakt de taak weer actief, met een verse
        vervaldatum volgens zijn eigen planning. De historie is nooit weggeweest.</p>
      <ul class="manage-rows">${archived.map(archivedRow)}</ul>
    </details>`;
}

/** Lees het personenformulier terug voor assignee/save. */
export function collectAssigneeForm(form) {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  if (!name) throw new Error('Geef de persoon een naam.');
  const id = String(data.get('id') || '') || slugify(name);
  if (!id) throw new Error('De naam moet minstens één letter of cijfer bevatten.');
  // het vrije veld wint van de select: dat is de fallback voor services
  // die niet in de mobile_app-lijst staan
  const custom = String(data.get('notify_service_custom') || '').trim();
  if (custom && !custom.startsWith('notify.')) {
    throw new Error('Een meldingsservice begint met "notify." — bv. notify.mobile_app_telefoon.');
  }
  const notifyService = custom || String(data.get('notify_service') || '');
  return {
    id,
    name,
    color: String(data.get('color') || '#7cb342'),
    include_in_leaderboard: data.get('include_in_leaderboard') ? 1 : 0,
    ha_user_id: String(data.get('ha_user_id') || '') || null,
    notify_service: notifyService || null,
    notifications_enabled: data.get('notifications_enabled') ? 1 : 0,
  };
}
