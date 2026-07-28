/**
 * Het scherm Activiteit (3b): de volledige feed plus de weekhistorie.
 *
 * Alles afgeleid uit completions (§5.2): geen aparte weektabel, dus dit kan
 * nooit achterlopen. De weekhistorie toont iedereen die iets deed — feiten;
 * het ranglijstfilter geldt alleen de lopende week op Vandaag.
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
  const feed = data.feed || [];
  const history = data.week_history || [];

  return html`
    <header class="page-header">
      <h1 class="page-count">Activiteit</h1>
    </header>

    <section>
      <h2 class="section-title">Wie deed wat</h2>
      ${feed.length
        ? html`<ul class="feed-rows">${feed.map((row) => feedRow(row, data.today))}</ul>`
        : html`<p class="status">Nog niets afgevinkt. De eerste voltooiing verschijnt hier.</p>`}
    </section>

    ${history.length
      ? html`
        <section>
          <h2 class="section-title">Eerdere weken</h2>
          <div class="week-cards">${history.map((week) => weekCard(week, data.today))}</div>
        </section>`
      : ''}`;
}
