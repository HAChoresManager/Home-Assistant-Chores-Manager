/**
 * Taakkaart: icoon, naam, persoonschipje, duur en urgentie (§4.3), met één
 * duidelijke primaire actie: afvinken.
 *
 * Het chipje (§4.4) toont wie de credits krijgt en is tikbaar: standaard de
 * toewijzing, tikken opent de keuze uit alle actieve personen. Zo blijft het
 * gewone geval één tik en is "Laura deed Martijns taak" er twee. Bij 'anyone'
 * staat het chipje sinds fase 4 standaard op de persoon die via ha_user_id
 * aan de ingelogde HA-gebruiker gekoppeld is (ctx.defaultAssignee); zonder
 * koppeling blijft het neutraal ("wie kan") en opent Afvinken zelf de keuze.
 * De keuze blijft altijd aanpasbaar via het chipje.
 *
 * Twee keuzemodi lopen door dezelfde personenrij: mode 'complete' vinkt af
 * bij de keuze (de anyone-flow), mode 'credit' zet alleen het chipje.
 *
 * Overslaan (deze keer doet niemand het) staat uitsluitend achteraan in de
 * rij "Wie heeft het gedaan?" op kaartniveau, en alleen als de taak vandaag
 * aan de beurt is of achterloopt — niet bij de creditkeuze, niet bij een
 * losse deelstap, en nergens als losse knop op de kaart (besluit van de
 * gebruiker). Geen data-assignee: wie oversloeg bepaalt de server.
 *
 * Afwezigheid (v2.7): chore.current_assignee is al het effectieve resultaat
 * van de server. Een vaste taak van wie weg is, gedraagt zich als een
 * "wie kan"-taak (chipje op de kijker of neutraal) met de rustige
 * toevoeging "· voor Laura"; bij een rotatie staat de vervanger op het
 * chipje met "· Laura is weg" (chore.covering_for). In de rij "Wie heeft
 * het gedaan?" blijft de afwezige staan — afvinken mag — maar iets gedimd
 * (ctx.absent).
 *
 * Op het scherm Alles (ctx.view 'tasks') toont de kaart vervaldatum en
 * planningsetiket, en staat de checklist ingeklapt achter "0 / 4 stappen".
 *
 * Tijdens de vakantiemodus (ctx.paused, alleen op Alles) is er een eigen,
 * expliciete tak: een gedimde kaart zonder urgentie, zonder actie en zonder
 * keuzerij — ook niet als die nog openstond toen de vakantie begon. Alles
 * wat iets met de taak doet ontbreekt daar; alleen het in- en uitklappen
 * van de checklist blijft, want dat is weergave.
 */
import { html } from '../core/html.js';
import {
  dueLabel,
  formatDuration,
  overdueLabel,
  scheduleLabel,
} from '../core/format.js';

/**
 * Maakt deze actie de taak in één keer af? Bepaalt of we optimistisch mogen
 * doen alsof de kaart weg is (actions.js draait het terug bij een fout).
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

/** Wie krijgt de credits: het chipje als dat gezet is; bij "wie kan" — een
 * 'anyone'-taak, of (v2.7) een taak die door afwezigheid niemand op zijn
 * naam heeft — de aan de ingelogde gebruiker gekoppelde persoon (fase 4);
 * anders de (effectieve) toewijzing. */
export function creditAssignee(chore, ctx) {
  if (ctx.credits && ctx.credits[chore.id]) return ctx.credits[chore.id];
  if (chore.assignment_type === 'anyone' || !chore.current_assignee) {
    return ctx.defaultAssignee || null;
  }
  return chore.current_assignee;
}

/** "· voor Laura" (overgenomen vaste taak) of "· Laura is weg" (rotatie
 * met vervanger); leeg als er niets is overgenomen. */
function coverNote(chore, ctx) {
  if (!chore.covering_for) return '';
  const name = ctx.assigneesById[chore.covering_for]?.name || chore.covering_for;
  return html`<span class="cover-note">${chore.current_assignee
    ? `· ${name} is weg` : `· voor ${name}`}</span>`;
}

function chip(chore, ctx) {
  const creditId = creditAssignee(chore, ctx);
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
  // Wie weg is blijft kiesbaar (afvinken mag altijd), maar staat gedimd.
  const buttons = ctx.assignees.map((person) => {
    const away = Boolean(ctx.absent && ctx.absent.has(person.id));
    return html`
    <button type="button" class="person ${away ? 'away' : ''}" data-action="${action}"
      data-chore="${chore.id}" data-assignee="${person.id}"
      ${away ? html`aria-label="${person.name}, is weg" title="${person.name} is weg"` : ''}
      ${subtaskId !== undefined ? html`data-subtask="${subtaskId}"` : ''}>
      <span class="dot" style="--person-color: ${person.color}"></span>${person.name}
    </button>`;
  });
  // Laatste keuze ná de personen, vóór "Toch niet" (dat is annuleren).
  const skip = action === 'pick' && subtaskId === undefined
    && chore.urgency !== 'upcoming'
    ? html`<button type="button" class="person skip" data-action="skip"
        data-chore="${chore.id}">Overslaan</button>`
    : '';
  // Met Overslaan erbij is de rij meer dan een antwoord op de vraag; een
  // schermlezer hoort dat in de groepsnaam (de zichtbare vraag blijft).
  const groupLabel = skip ? `${label} Of sla deze keer over.` : label;
  return html`
    <div class="chooser" role="group" aria-label="${groupLabel}">
      <span class="chooser-label">${label}</span>
      ${buttons}
      ${skip}
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

/**
 * Kaart tijdens de vakantiemodus: de taak staat stil. Geen urgentieklasse
 * (de server levert de echte urgentie, maar er loopt niets achter), geen
 * badge maar het label "staat stil", het chipje als gewone tekst, de
 * huidige (nog niet verschoven) datum, en checkliststappen als platte
 * tekst. Counter-voortgang mag blijven: dat is een feit, geen actie.
 */
function pausedCard(chore, ctx) {
  const creditId = creditAssignee(chore, ctx);
  const person = creditId ? ctx.assigneesById[creditId] : null;
  const who = creditId
    ? html`<span class="chip static"><span class="dot" style="--person-color: ${person ? person.color : 'var(--divider-color)'}"></span>${person ? person.name : creditId}</span>`
    : html`<span class="chip static neutral">wie kan</span>`;
  return html`
    <article class="card paused" data-chore-card="${chore.id}">
      <span class="card-icon" aria-hidden="true">${chore.icon}</span>
      <div class="card-body">
        <h3 class="card-name">${chore.name}</h3>
        <p class="card-meta">
          ${who}
          <span class="meta-text">· ${formatDuration(chore.duration_minutes)}
            · ${dueLabel(chore.next_due, ctx.todayIso)}
            · ${scheduleLabel(chore.schedule_type, chore.schedule_config)}</span>
          <span class="paused-label">staat stil</span>
        </p>
        ${chore.description ? html`<p class="card-description">${chore.description}</p>` : ''}
        ${chore.subtask_mode === 'counter' ? counterBlock(chore) : ''}
        ${chore.subtask_mode === 'checklist' ? pausedSteps(chore, ctx) : ''}
      </div>
    </article>`;
}

/** Checklist van een stilstaande taak: dezelfde in-/uitklapknop als op
 * Alles, maar de stappen zijn tekst — niets om af te vinken. */
function pausedSteps(chore, ctx) {
  const done = new Set(chore.subtasks_done || []);
  const total = (chore.subtasks || []).length;
  const open = ctx.expanded.has(chore.id);
  const toggle = html`<button type="button" class="steps-toggle" data-action="toggle-steps"
    data-chore="${chore.id}" aria-expanded="${open ? 'true' : 'false'}">${done.size} / ${total} stappen<span class="chip-caret">${open ? '▾' : '▸'}</span></button>`;
  if (!open) return toggle;
  const rows = (chore.subtasks || []).map((step) => (done.has(step.id)
    ? html`<li class="step done"><span class="step-mark">✓</span>${step.name}</li>`
    : html`<li class="step plain"><span class="step-mark open"></span>${step.name}</li>`));
  return html`
    <div class="checklist">
      ${toggle}
      <ul class="steps">${rows}</ul>
    </div>`;
}

export function renderTaskCard(chore, ctx) {
  if (ctx.paused) return pausedCard(chore, ctx);
  const days = chore.overdue_days || 0;
  const badge = days > 0
    ? html`<span class="badge ${chore.urgency}">${overdueLabel(days, chore.next_due, ctx.todayIso)}</span>`
    : '';
  const creditId = creditAssignee(chore, ctx);
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

  // Een open keuzerij krijgt een eigen regel onder de kaarttekst
  // (chooser-open): naast de tekst drukt hij de taaknaam samen tot nul.
  return html`
    <article class="card ${chore.urgency} ${cardChooser ? 'chooser-open' : ''}"
      data-chore-card="${chore.id}">
      <span class="card-icon" aria-hidden="true">${chore.icon}</span>
      <div class="card-body">
        <h3 class="card-name">${chore.name}</h3>
        <p class="card-meta">
          ${chip(chore, ctx)}
          ${coverNote(chore, ctx)}
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
