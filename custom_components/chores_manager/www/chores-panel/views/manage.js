/**
 * Het scherm Beheer (3b): taken en personen aanmaken, bewerken, verwijderen.
 *
 * Verwijderen volgt het 2b-besluit en zegt vooraf wat er gebeurt: een taak
 * mét historie wordt gearchiveerd (de historie blijft zichtbaar bij
 * Activiteit), zonder historie gaat hij echt weg. Personen idem, inclusief
 * rotatielidmaatschap.
 *
 * Bovenaan staat de vakantiemodus: een schakelaar en een optionele "tot en
 * met". Het datumveld schrijft alleen een concept in de store
 * (vacationDraft, stil: zonder render) — de server hoort er pas van bij de
 * schakelaar of bij "Datum opslaan". De afhandeling zit in controls.js en
 * actions.js.
 *
 * In de sectie Personen heeft sinds v2.7 iedereen een eigen schakelaar
 * "Afwezig" met een optioneel "tot en met", met precies dezelfde
 * discipline als de vakantie: concept stil in de store (absenceDrafts),
 * geen render onder je vingers, en tijdens de aanroep de bedoeling
 * (absenceBusy). Namen van de velden dragen het persoon-id, zodat de
 * focus na een render terugkomt op het goede veld.
 */
import { html } from '../core/html.js';
import {
  dayCount,
  dayMonth,
  daysBetween,
  scheduleLabel,
} from '../core/format.js';
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

/**
 * Wat een afwezigheid doet, kort. Een datum vóór vandaag (getypt, of een
 * concept dat over middernacht bleef staan) krijgt de vraag om een andere
 * datum. Geëxporteerd: controls.js werkt deze tekst bij het typen bij.
 */
export function absenceExplain(name, untilValue, todayIso) {
  if (untilValue && untilValue < todayIso) {
    return 'Die datum ligt vóór vandaag; kies vandaag of later als laatste dag.';
  }
  return `Vaste taken van ${name} worden 'wie kan'; in rotaties wordt ${name}`
    + ' overgeslagen. Meldingen en streak staan stil.';
}

/** Schakelaar "Afwezig" met datum, net als de vakantiesectie (v2.7). */
function absenceBlock(person, state) {
  const { data } = state;
  const absence = (data.absences || []).find((a) => a.assignee_id === person.id) || null;
  const busy = state.absenceBusy[person.id];
  // Tijdens een aanroep toont de schakelaar de bedoeling, niet de oude
  // serverstand — anders springt hij terug tot de refresh binnen is.
  let on = Boolean(absence);
  if (busy === 'start') on = true;
  else if (busy === 'end') on = false;
  // Het concept wint van de server; '' is "bewust leeggemaakt".
  const untilValue = person.id in state.absenceDrafts
    ? state.absenceDrafts[person.id] : (absence?.until ?? '');
  const unsaved = Boolean(absence) && untilValue !== (absence.until ?? '');
  // Schakelaar en datumveld in aparte labels: een tik op de datum mag de
  // afwezigheid niet aan- of uitzetten.
  return html`
    <div class="absence" data-absence-block>
      <label class="check standalone">
        <input type="checkbox" role="switch" name="absence-toggle-${person.id}"
          data-absence="${person.id}" aria-label="${person.name} afwezig"
          ${on ? 'checked' : ''} ${busy ? 'disabled' : ''}>
        Afwezig
      </label>
      <label class="field">Tot en met (optioneel)
        <input type="date" name="absence-until-${person.id}" data-absence="${person.id}"
          aria-label="${person.name} afwezig tot en met (optioneel)"
          min="${data.today}" value="${untilValue}" ${busy ? 'disabled' : ''}>
      </label>
      <button type="button" class="secondary absence-save" data-action="absence-save-until"
        data-assignee="${person.id}" ${unsaved ? '' : 'hidden'}
        ${busy ? 'disabled' : ''}>Datum opslaan</button>
      <p class="field-hint" data-absence-hint>${absenceExplain(person.name, untilValue, data.today)}</p>
    </div>`;
}

function assigneeRow(person, state) {
  const absence = (state.data.absences || []).find((a) => a.assignee_id === person.id);
  const sub = [];
  if (!person.include_in_leaderboard) sub.push('buiten de ranglijst');
  if (absence) sub.push(`afwezig sinds ${dayMonth(absence.start_date, state.data.today)}`);
  return html`
    <li class="manage-person">
      <div class="manage-row">
        <span class="dot" style="--person-color: ${person.color}"></span>
        <span class="manage-text">
          <span class="manage-name">${person.name}</span>
          ${sub.length ? html`<span class="manage-sub">${sub.join(' · ')}</span>` : ''}
        </span>
        <button type="button" class="secondary" data-action="edit-assignee"
          data-assignee="${person.id}">Bewerken</button>
      </div>
      ${absenceBlock(person, state)}
    </li>`;
}

/**
 * Wat er bij terugkomst gebeurt, eerlijk en concreet. De verschuiving van
 * intervaltaken is de vakantieduur: laatste dag + 1 − eerste dag. Die
 * eerste dag is de start van een lopende vakantie, of vandaag als hij nog
 * aan moet. Zonder einddatum staat er "net zoveel dagen", bij een lopende
 * vakantie met de stand van nu erbij (uit op vandaag = zoveel dagen). Een
 * datum vóór vandaag (getypt, of een concept dat over middernacht bleef
 * staan) krijgt geen rekensom maar de vraag om een andere datum.
 * Geëxporteerd: het element werkt deze tekst bij het typen in de DOM bij.
 */
export function vacationExplain(vacation, untilValue, todayIso) {
  if (untilValue && untilValue < todayIso) {
    return 'Die datum ligt vóór vandaag; kies vandaag of later als laatste vakantiedag.';
  }
  let shift;
  if (untilValue) {
    const first = vacation ? vacation.start_date : todayIso;
    shift = `${dayCount(daysBetween(first, untilValue) + 1)} op`;
  } else if (vacation) {
    const sofar = dayCount(Math.max(0, daysBetween(vacation.start_date, todayIso)));
    shift = `net zoveel dagen op als de vakantie duurt (nu ${sofar})`;
  } else {
    shift = 'net zoveel dagen op als de vakantie duurt';
  }
  return `Taken staan stil. Bij terugkomst schuiven intervaltaken ${shift}; `
    + 'taken op vaste dagen gaan naar de eerstvolgende keer.';
}

function vacationSection(state) {
  const data = state.data;
  const vacation = data.vacation?.active ? data.vacation : null;
  const busy = state.vacationBusy;
  // Tijdens een aanroep toont de schakelaar de bedoeling, niet de oude
  // serverstand — anders springt hij terug tot de refresh binnen is.
  let on = Boolean(vacation);
  if (busy === 'start') on = true;
  else if (busy === 'end') on = false;
  // Het concept wint van de server; '' is "bewust leeggemaakt".
  const untilValue = state.vacationDraft ?? vacation?.until ?? '';
  const unsaved = Boolean(vacation) && untilValue !== (vacation.until ?? '');
  // Schakelaar en datumveld bewust in aparte labels: een tik op de datum
  // mag de vakantie niet aan- of uitzetten.
  return html`
    <section class="vacation">
      <h2 class="section-title">Vakantie</h2>
      <label class="check standalone">
        <input type="checkbox" role="switch" name="vacation-toggle"
          ${on ? 'checked' : ''} ${busy ? 'disabled' : ''}>
        Vakantiemodus
      </label>
      <label class="field">Tot en met (optioneel)
        <input type="date" name="vacation-until" min="${data.today}"
          value="${untilValue}" ${busy ? 'disabled' : ''}>
      </label>
      <button type="button" class="secondary vacation-save" data-action="vacation-save-until"
        ${unsaved ? '' : 'hidden'} ${busy ? 'disabled' : ''}>Datum opslaan</button>
      <p class="field-hint" data-vacation-hint>${vacationExplain(vacation, untilValue, data.today)}</p>
    </section>`;
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
    ${vacationSection(state)}
    <section>
      <h2 class="section-title">Taken</h2>
      <ul class="manage-rows">${data.chores.map(choreRow)}</ul>
      <button type="button" class="secondary add" data-action="new-chore">+ Nieuwe taak</button>
    </section>
    <section>
      <h2 class="section-title">Personen</h2>
      <ul class="manage-rows">${data.assignees.map((person) => assigneeRow(person, state))}</ul>
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
