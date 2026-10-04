/**
 * Het scherm Vandaag (B4): bijdragebalk bovenaan, dan wat er vandaag moet,
 * dan de achterstand, onderaan de laatste voltooiingen.
 *
 * De kop toont het totaal ("8 taken") — één stapel werk, geen twee losse
 * tellers (§2.4). Taken in `pending` zijn optimistisch afgevinkt of
 * overgeslagen en blijven uit beeld tot de server het bevestigt of het
 * terugdraait. "Laatste activiteit" toont alleen voltooiingen (data.feed);
 * overslagen staan op Activiteit.
 *
 * Tijdens de vakantiemodus (data.vacation) is er niets aan de beurt: de kop
 * wordt "Vakantie", een rustige banner zegt sinds wanneer en tot wanneer,
 * en er staan geen taaksecties en geen "Alles gedaan" — er is niets gedaan
 * of overgeslagen, de taken staan stil. Bijdragebalk en "Laatste
 * activiteit" blijven: die gaan over wat er wél gebeurde.
 *
 * Afwezigheid (v2.7): onder de kop een kleine regel per afwezige ("Laura is
 * weg t/m 12 okt"); de kaarten tonen bij overgenomen taken voor wie (zie
 * task-card.js). Tijdens de vakantiemodus niet: de vakantie wint.
 */
import { html } from '../core/html.js';
import {
  dateLong,
  dayMonth,
  dayMonthShort,
  feedWhen,
  formatDuration,
  taskCount,
} from '../core/format.js';
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

/** "Vakantiemodus sinds 3 oktober — tot en met 17 oktober". */
function vacationBanner(vacation, todayIso) {
  return html`
    <p class="vacation-banner" role="status">
      <span aria-hidden="true">🌴</span>
      Vakantiemodus sinds ${dayMonth(vacation.start_date, todayIso)}${vacation.until
        ? html` — tot en met ${dayMonth(vacation.until, todayIso)}` : ''}
    </p>`;
}

/** "Laura is weg t/m 12 okt" / "Noud is weg", één regel per persoon. */
function awayLines(absences, assigneesById, todayIso) {
  return absences.map((absence) => {
    const name = assigneesById[absence.assignee_id]?.name || absence.assignee_id;
    return html`<p class="away-line">${name} is weg${absence.until
      ? ` t/m ${dayMonthShort(absence.until, todayIso)}` : ''}</p>`;
  });
}

export function renderToday(state) {
  if (state.loading) {
    return html`<div class="status">${state.connecting ? 'Verbinden…' : 'Taken laden…'}</div>`;
  }
  if (state.error) {
    return html`
      <div class="status">
        <p>De taken laden lukt nu niet: ${state.error}</p>
        <button class="secondary" data-action="retry">Opnieuw proberen</button>
      </div>`;
  }

  const data = state.data;
  if (data.vacation?.active) {
    return html`
      <header class="page-header">
        <p class="page-date">${dateLong(data.today)}</p>
        <h1 class="page-count">Vakantie</h1>
      </header>
      ${vacationBanner(data.vacation, data.today)}
      ${renderContributionBar(data.leaderboard)}
      ${renderFeed(data.feed, data.today)}`;
  }

  const assigneesById = {};
  for (const person of data.assignees) assigneesById[person.id] = person;
  // A2 (fase 4): de kijker, voor de chip-default op 'anyone'-taken.
  const me = data.assignees.find(
    (p) => p.ha_user_id && p.ha_user_id === state.currentUserId);
  const absences = data.absences || [];
  const ctx = {
    assigneesById,
    assignees: data.assignees,
    absent: new Set(absences.map((a) => a.assignee_id)),
    chooser: state.chooser,
    credits: state.credits,
    defaultAssignee: me ? me.id : null,
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

  // Leeg doordat er vandaag alleen is overgeslagen: geen lof voor werk dat
  // niemand deed. Een rustige dag zonder taken houdt "Alles gedaan".
  const onlySkipped = open.length === 0 && !(data.completed_today > 0)
    && (data.skips || []).some((s) => s.skipped_at.slice(0, 10) === data.today);

  let heading = taskCount(open.length);
  if (open.length === 0) heading = onlySkipped ? 'Niets meer voor vandaag' : 'Alles gedaan';
  const header = html`
    <header class="page-header">
      <p class="page-date">${dateLong(data.today)}</p>
      <h1 class="page-count">${heading}</h1>
      ${awayLines(absences, assigneesById, data.today)}
    </header>`;

  let empty = '';
  if (onlySkipped) {
    empty = html`
      <section class="all-done">
        <p>Overgeslagen taken komen op hun volgende keer terug.</p>
      </section>`;
  } else if (open.length === 0) {
    empty = html`
      <section class="all-done">
        <p class="all-done-big" aria-hidden="true">✨</p>
        <p>Mooi werk.</p>
        ${data.completed_today > 0
          ? html`<p class="all-done-sub">Vandaag ${data.completed_today === 1 ? '1 taak' : `${data.completed_today} taken`} afgevinkt.</p>`
          : ''}
      </section>`;
  }

  return html`
    ${header}
    ${renderContributionBar(data.leaderboard)}
    ${empty}
    ${renderSection('Vandaag', dueToday, ctx)}
    ${renderSection('Achterstand', late, ctx)}
    ${renderFeed(data.feed, data.today)}`;
}
