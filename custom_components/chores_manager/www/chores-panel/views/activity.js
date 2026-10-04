/**
 * Het scherm Activiteit (3b): de volledige feed plus de weekhistorie.
 *
 * De feed is één gemengde tijdlijn van voltooiingen (data.feed) en
 * overslagen (data.skips). Beide lijsten komen met een eigen limiet van de
 * server; data.activity_since zegt vanaf wanneer de menging compleet is, en
 * alles wat ouder is valt weg — anders zit er een gat in de tijdlijn waar
 * één lijst al ophield. Sorteren gebeurt op Date.parse, niet op de
 * ISO-string: rond de wintertijdwissel staan +02:00 en +01:00 door elkaar.
 * Een overslag is een rustigere regel (geen duur, geen persoonskleur), met
 * "Toch niet overslaan" alleen waar de server zegt dat dat nog kan.
 *
 * De weekhistorie komt uit completions (§5.2): geen aparte weektabel, dus
 * dit kan nooit achterlopen. Hij toont iedereen die iets deed — feiten; het
 * ranglijstfilter geldt alleen de lopende week op Vandaag. Overslagen tellen
 * daar niet mee (geen voltooiing, geen minuten).
 */
import { html } from '../core/html.js';
import {
  feedWhen,
  formatDuration,
  taskCount,
  weekTitle,
} from '../core/format.js';

function feedRow(row, todayIso) {
  return html`
    <li class="feed-row">
      <span class="dot" style="--person-color: ${row.color}"></span>
      <span class="feed-text">
        <strong>${row.assignee_name}</strong>
        · ${row.chore_name}${row.subtask_name ? html` — ${row.subtask_name}` : ''}
      </span>
      <span class="feed-when">${feedWhen(row.completed_at, todayIso)} · ${formatDuration(row.minutes)}</span>
    </li>`;
}

/** Overslag: rustiger dan een voltooiing. Het pictogram is versiering —
 * een schermlezer zou anders "volgend nummer" voorlezen. */
function skipRow(row, todayIso, reverting) {
  const text = row.assignee_name
    ? html`<strong>${row.assignee_name}</strong> sloeg ${row.chore_name} over`
    : html`${row.chore_name} overgeslagen`;
  const busy = reverting.has(row.id);
  const revert = row.can_revert
    ? html`<button type="button" class="secondary revert-skip" data-action="revert-skip"
        data-skip="${row.id}" aria-label="Toch niet overslaan: ${row.chore_name}"
        ${busy ? html`disabled` : ''}>Toch niet overslaan</button>`
    : '';
  return html`
    <li class="feed-row skip">
      <span class="dot skip-dot"></span>
      <span class="feed-text"><span aria-hidden="true">⏭</span> ${text}</span>
      <span class="feed-when">${feedWhen(row.skipped_at, todayIso)}</span>
      ${revert}
    </li>`;
}

/** Tijdstip in ms. Python's isoformat() kan microseconden geven; niet elke
 * browser leest meer dan drie decimalen, dus die worden eerst afgekapt. */
function parseMoment(iso) {
  return Date.parse(String(iso).replace(/(\.\d{3})\d+/, '$1'));
}

/**
 * Eén lijst {kind, at, row}, nieuwste eerst; bij gelijk tijdstip het
 * hoogste id eerst. Regels ouder dan activityIso vallen weg (zie de kop).
 */
function mergeActivity(feed, skips, activityIso) {
  const since = activityIso ? parseMoment(activityIso) : null;
  const items = [
    ...feed.map((row) => ({ kind: 'completion', at: parseMoment(row.completed_at), row })),
    ...skips.map((row) => ({ kind: 'skip', at: parseMoment(row.skipped_at), row })),
  ];
  return items
    .filter((item) => since === null || item.at >= since)
    .sort((a, b) => (b.at - a.at) || (b.row.id - a.row.id));
}

function weekCard(week, todayIso) {
  const rows = week.persons.map((person) => html`
    <li class="person-row">
      <span class="dot" style="--person-color: ${person.color}"></span>
      <span class="person-name">${person.name}</span>
      <span class="person-stats">${formatDuration(person.minutes)} · ${taskCount(person.tasks)}</span>
    </li>`);
  return html`
    <article class="week-card">
      <header class="week-head">
        <h3 class="week-title">${weekTitle(week.week_start, todayIso)}</h3>
        <span class="week-total">samen ${formatDuration(week.total_minutes)}</span>
      </header>
      <ul class="person-rows">${rows}</ul>
    </article>`;
}

export function renderActivity(state) {
  const data = state.data;
  const items = mergeActivity(
    data.feed || [], data.skips || [], data.activity_since || null);
  const history = data.week_history || [];
  const reverting = state.reverting || new Set();

  const rows = items.map((item) => (item.kind === 'skip'
    ? skipRow(item.row, data.today, reverting)
    : feedRow(item.row, data.today)));

  return html`
    <header class="page-header">
      <h1 class="page-count">Activiteit</h1>
    </header>

    <section>
      <h2 class="section-title">Wie deed wat</h2>
      ${items.length
        ? html`<ul class="feed-rows">${rows}</ul>`
        : html`<p class="status">Nog niets afgevinkt of overgeslagen. De eerste activiteit verschijnt hier.</p>`}
    </section>

    ${history.length
      ? html`
        <section>
          <h2 class="section-title">Eerdere weken</h2>
          <div class="week-cards">${history.map((week) => weekCard(week, data.today))}</div>
        </section>`
      : ''}`;
}
