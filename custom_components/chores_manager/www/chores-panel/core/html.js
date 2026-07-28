/**
 * Template literals met escaping.
 *
 * Alles wat uit de database komt gaat hier doorheen — taaknamen en
 * beschrijvingen zijn gebruikersinvoer. De html``-tag escapet elke
 * geïnterpoleerde waarde; alleen resultaten van html`` zelf (en expliciete
 * raw()) gaan er onbewerkt in, zodat sjablonen genest kunnen worden.
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/** Markeer een string als veilig; alleen voor eigen, vaste markup. */
export function raw(value) {
  return { __raw: String(value) };
}

function toPart(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(toPart).join('');
  if (typeof value === 'object' && value.__raw !== undefined) return value.__raw;
  return esc(value);
}

/** Tagged template: html`<b>${gebruikersinvoer}</b>` → raw-gemarkeerde string. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += toPart(values[i]) + strings[i + 1];
  }
  return { __raw: out };
}

/** Zet een html``-resultaat in een element. */
export function setContent(element, template) {
  element.innerHTML = template.__raw ?? '';
}
