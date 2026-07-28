/**
 * Het scherm Vandaag (B4): bijdragebalk bovenaan, dan wat er vandaag moet,
 * dan de achterstand, onderaan de laatste voltooiingen.
 *
 * De kop toont het totaal ("8 taken") — één stapel werk, geen twee losse
 * tellers (§2.4). Taken in `pending` zijn optimistisch afgevinkt en blijven
 * uit beeld tot de server het bevestigt of het terugdraait.
 */
import { html } from '../core/html.js';
import { dateLong, feedWhen, formatDuration, taskCount } from '../core/format.js';
import { renderContributionBar } from '../components/contribution-bar.js';
import { renderTaskCard } from '../components/task-card.js';

const FEED_ROWS = 5;

function renderFeed(feed, todayIso) {
  if (!feed.length) return '';
  const rows = feed.slice(0, FEED_ROWS).map((row) => html`
    <li class="feed-row">
      <span class="dot" style="--person-color: ${row.color}"></span>
      <span class="feed-text">
        <strong>${row.assignee_name}</strong>
        · ${row.chore_name}${row.subtask_name ? html` — ${row.subtask_name}` : ''}
      </span>
      <span class="feed-when">${feedWhen(row.completed_at, todayIso)} · ${formatDuration(row.minutes)}</span>
    </li>`);
  return html`
    <section class="feed">
      <h2 class="section-title">Laatste activiteit</h2>
      <ul class="feed-rows">${rows}</ul>
    </section>`;
}

function renderSection(title, chores, ctx) {
  if (!chores.length) return '';
  return html`
    <section>
      <h2 class="section-title">${title}</h2>
      <div class="cards">${chores.map((chore) => renderTaskCard(chore, ctx))}</div>
    </section>`;
}

export function renderToday(state) {
  if (state.loading) {
    return html`<div class="status">Taken laden…</div>`;
  }
  if (state.error) {
    return html`
      <div class="status">
        <p>De taken laden lukt nu niet: ${state.error}</p>
        <button class="secondary" data-action="retry">Opnieuw proberen</button>
      </div>`;
  }

  const data = state.data;
  const assigneesById = {};
  for (const person of data.assignees) assigneesById[person.id] = person;
  const ctx = {
    assigneesById,
    assignees: data.assignees,
    chooser: state.chooser,
    credits: state.credits,
    expanded: state.expanded,
    todayIso: data.today,
    view: 'today',
  };

  const open = data.chores.filter(
    (c) => c.urgency !== 'upcoming' && !state.pending.has(c.id));
  const dueToday = open.filter((c) => c.urgency === 'due');
  // Volgorde op cyclusfractie (§4.3): 6 dagen op een weektaak is dringender
  // dan 115 dagen op een halfjaartaak — absolute dagen sorteren verkeerd.
  const late = open.filter((c) => c.urgency !== 'due')
    .sort((a, b) => (b.cycle_fraction || 0) - (a.cycle_fraction || 0));

  const header = html`
    <header class="page-header">
      <p class="page-date">${dateLong(data.today)}</p>
      <h1 class="page-count">${open.length === 0 ? 'Alles gedaan' : taskCount(open.length)}</h1>
    </header>`;

  const empty = open.length === 0
    ? html`
      <section class="all-done">
        <p class="all-done-big" aria-hidden="true">✨</p>
        <p>Mooi werk.</p>
        ${data.completed_today > 0
          ? html`<p class="all-done-sub">Vandaag ${data.completed_today === 1 ? '1 taak' : `${data.completed_today} taken`} afgevinkt.</p>`
          : ''}
      </section>`
    : '';

  return html`
    ${header}
    ${renderContributionBar(data.leaderboard)}
    ${empty}
    ${renderSection('Vandaag', dueToday, ctx)}
    ${renderSection('Achterstand', late, ctx)}
    ${renderFeed(data.feed, data.today)}`;
}
