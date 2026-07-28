/**
 * Nederlandse weergaveteksten: datums, duur en planningstypen.
 *
 * Actieve werkwoorden, geen systeemjargon (plan §8). Alle functies zijn puur;
 * "vandaag" komt als ISO-datum binnen zodat er nooit een klok in de weergave
 * sluipt.
 */

const WEEKDAYS_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const WEEKDAYS_LONG = ['maandag', 'dinsdag', 'woensdag', 'donderdag',
  'vrijdag', 'zaterdag', 'zondag'];
const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** "20m", "1u", "3u 10m" — de vorm uit plan §5.1. */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}u`;
  return `${hours}u ${rest}m`;
}

/**
 * "vandaag", "1 dag te laat", "3 dagen te laat" — en boven de 30 dagen een
 * maand in plaats van een getal: "had in april gemoeten". Grote getallen
 * lezen als verwijt (§4.3).
 */
export function overdueLabel(days, nextDueIso, todayIso) {
  if (days <= 0) return 'vandaag';
  if (days === 1) return '1 dag te laat';
  if (days <= 30 || !nextDueIso) return `${days} dagen te laat`;
  const due = new Date(`${nextDueIso}T12:00:00`);
  const month = MONTHS_LONG[due.getMonth()];
  const currentYear = Number((todayIso || nextDueIso).slice(0, 4));
  if (due.getFullYear() !== currentYear) {
    return `had in ${month} ${due.getFullYear()} gemoeten`;
  }
  return `had in ${month} gemoeten`;
}

/** Vervaldatum vooruit: "vandaag", "morgen", anders "wo 29 jul" (+jaar). */
export function dueLabel(nextDueIso, todayIso) {
  if (nextDueIso === todayIso) return 'vandaag';
  const tomorrow = new Date(`${todayIso}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, '0'),
    String(tomorrow.getDate()).padStart(2, '0'),
  ].join('-');
  if (nextDueIso === tomorrowIso) return 'morgen';
  const d = new Date(`${nextDueIso}T12:00:00`);
  const base = `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  if (nextDueIso.slice(0, 4) !== todayIso.slice(0, 4)) {
    return `${base} ${d.getFullYear()}`;
  }
  return base;
}

/** "week van 21 juli" (+jaar als het een ander jaar is). */
export function weekTitle(weekStartIso, todayIso) {
  const d = new Date(`${weekStartIso}T12:00:00`);
  const base = `week van ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
  if (weekStartIso.slice(0, 4) !== todayIso.slice(0, 4)) {
    return `${base} ${d.getFullYear()}`;
  }
  return base;
}

/** "dinsdag 28 juli" — voor de kop van het scherm. */
export function dateLong(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return `${WEEKDAYS_LONG[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** Feedtijdstip: "vandaag 14:32", "gisteren 09:15", anders "wo 23 jul". */
export function feedWhen(isoTimestamp, todayIso) {
  const datePart = isoTimestamp.slice(0, 10);
  const timePart = isoTimestamp.slice(11, 16);
  if (datePart === todayIso) return `vandaag ${timePart}`;
  const yesterday = new Date(`${todayIso}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, '0'),
    String(yesterday.getDate()).padStart(2, '0'),
  ].join('-');
  if (datePart === yesterdayIso) return `gisteren ${timePart}`;
  const d = new Date(`${datePart}T12:00:00`);
  return `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Weergavenaam van een planning: "elke dag", "elke wo en zo", … */
export function scheduleLabel(scheduleType, config) {
  if (scheduleType === 'daily') {
    const days = config.weekdays || [];
    if (days.length === 7) return 'elke dag';
    if (days.join(',') === '1,2,3,4,5') return 'elke werkdag';
    const names = days.map((d) => WEEKDAYS_SHORT[d - 1]);
    if (names.length === 1) return `elke ${names[0]}`;
    return `elke ${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`;
  }
  if (scheduleType === 'weekly') {
    return `wekelijks op ${WEEKDAYS_LONG[config.weekday - 1]}`;
  }
  if (scheduleType === 'monthly') {
    return `maandelijks op de ${config.monthday}e`;
  }
  if (scheduleType === 'interval') {
    return `elke ${config.days} dagen`;
  }
  if (scheduleType === 'yearly') {
    return `jaarlijks op ${config.day} ${MONTHS_LONG[config.month - 1]}`;
  }
  return '';
}

/** "1 taak" / "8 taken". */
export function taskCount(n) {
  return n === 1 ? '1 taak' : `${n} taken`;
}
