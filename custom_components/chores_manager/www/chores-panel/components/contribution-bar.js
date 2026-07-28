/**
 * De bijdragebalk (§5.1) — het signatuurelement en de enige plek waar het
 * ontwerp mag opvallen.
 *
 * Eén horizontale gestapelde balk met de totale huishoudtijd van deze week,
 * gesegmenteerd per persoon in hun eigen kleur, breedte naar rato. De balk
 * telt iederéén mee — dat is het samen-element uit het plan. De ranglijst
 * eronder toont alleen personen met include_in_leaderboard = 1 (§3.1: een
 * kind doet niet mee in de tijdsranglijst van volwassenen, maar zijn minuten
 * kleuren wél de balk).
 */
import { html } from '../core/html.js?v=2.1.0-20260728-fase3b';
import { formatDuration, taskCount } from '../core/format.js?v=2.1.0-20260728-fase3b';

export function renderContributionBar(leaderboard) {
  const total = leaderboard.total_minutes;

  if (total === 0) {
    // Geen kader (dat leest als een uitgeschakeld invoerveld) maar de
    // contouren van de segmenten die er kunnen komen, in ieders eigen kleur.
    const ghosts = leaderboard.persons.map((person) => html`
      <div class="segment ghost" style="--person-color: ${person.color}"
        title="${person.name}"></div>`);
    return html`
      <section class="contribution empty">
        <p class="contribution-empty">
          Nog niets afgevinkt deze week. De eerste taak kleurt de balk.
        </p>
        <div class="bar ghost" aria-hidden="true">${ghosts}</div>
      </section>`;
  }

  const withMinutes = leaderboard.persons.filter((p) => p.minutes > 0);
  const segments = withMinutes.map((person) => html`
    <div class="segment" style="flex-grow: ${person.minutes}; --person-color: ${person.color}"
      title="${person.name}: ${formatDuration(person.minutes)}"></div>`);

  const barLabel = withMinutes
    .map((p) => `${p.name} ${formatDuration(p.minutes)}`)
    .join(', ');

  const rows = leaderboard.persons
    .filter((person) => person.include_in_leaderboard)
    .map((person) => html`
      <li class="person-row">
        <span class="dot" style="--person-color: ${person.color}"></span>
        <span class="person-name">${person.name}</span>
        <span class="person-stats">
          ${formatDuration(person.minutes)}
          · ${taskCount(person.tasks)}
          ${person.streak > 0 ? html`<span class="streak">🔥 ${person.streak} ${person.streak === 1 ? 'week' : 'weken'}</span>` : ''}
        </span>
      </li>`);

  return html`
    <section class="contribution">
      <p class="contribution-total">Samen ${formatDuration(total)} deze week</p>
      <div class="bar" role="img" aria-label="Verdeling huishoudtijd deze week: ${barLabel}">
        ${segments}
      </div>
      <ul class="person-rows">${rows}</ul>
    </section>`;
}
