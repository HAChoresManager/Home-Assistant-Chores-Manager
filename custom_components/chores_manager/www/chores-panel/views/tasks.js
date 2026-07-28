/**
 * Het scherm Alles (3b): elke actieve taak, gegroepeerd op wanneer hij komt.
 *
 * Dit is de plek waar je vooruitkijkt — wat op Vandaag bewust ontbreekt. Per
 * taak de volgende vervaldatum en het planningsetiket (via ctx.view 'tasks'
 * in de taakkaart); checklists staan hier ingeklapt achter "0 / 4 stappen".
 */
import { html } from '../core/html.js?v=2.1.1-20260728-fase3b';
import { taskCount } from '../core/format.js?v=2.1.1-20260728-fase3b';
import { renderTaskCard } from '../components/task-card.js?v=2.1.1-20260728-fase3b';

function endOfWeekIso(todayIso) {
  const d = new Date(`${todayIso}T12:00:00`);
  d.setDate(d.getDate() + (6 - ((d.getDay() + 6) % 7)));
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function section(title, chores, ctx) {
  if (!chores.length) return '';
  return html`
    <section>
      <h2 class="section-title">${title}</h2>
      <div class="cards">${chores.map((chore) => renderTaskCard(chore, ctx))}</div>
    </section>`;
}

export function renderTasks(state) {
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
    view: 'tasks',
  };

  const chores = data.chores.filter((c) => !state.pending.has(c.id));
  const weekEnd = endOfWeekIso(data.today);
  const dueToday = chores.filter((c) => c.urgency === 'due');
  const late = chores.filter((c) => c.urgency === 'grace' || c.urgency === 'urgent')
    .sort((a, b) => (b.cycle_fraction || 0) - (a.cycle_fraction || 0));
  const upcoming = chores.filter((c) => c.urgency === 'upcoming');
  const thisWeek = upcoming.filter((c) => c.next_due <= weekEnd);
  const later = upcoming.filter((c) => c.next_due > weekEnd);

  return html`
    <header class="page-header">
      <h1 class="page-count">${taskCount(chores.length)}</h1>
    </header>
    ${section('Vandaag', dueToday, ctx)}
    ${section('Deze week', thisWeek, ctx)}
    ${section('Later', later, ctx)}
    ${section('Achterstand', late, ctx)}
    ${chores.length === 0
      ? html`<section class="all-done"><p>Nog geen taken. Maak de eerste aan bij Beheer.</p></section>`
      : ''}`;
}
