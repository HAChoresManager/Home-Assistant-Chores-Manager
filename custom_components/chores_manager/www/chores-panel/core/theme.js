/**
 * Themakeuze voor het panel (3c).
 *
 * Een thema per dashboard is een Lovelace-feature; een custom panel erft
 * alleen het globale profielthema. Daarom kiezen we hier zelf: de variabelen
 * van het gekozen HA-thema komen als inline custom properties op de host te
 * staan ('primary-color' wordt '--primary-color') en cascaden vanzelf de
 * shadow DOM in, omdat alle styling al op HA-variabelen draait.
 *
 * De keuze is bewust apparaatgebonden (localStorage): de keukentablet mag
 * anders staan dan de laptop. Dit is presentatie, geen data — er hoort geen
 * tabel of service bij. "Volg Home Assistant" = alle inline properties weer
 * weg, dan geldt het geërfde profielthema.
 */

/** De waarde voor "Volg Home Assistant" — geen geldige themanaam. */
export const FOLLOW_HA = '__volg_ha__';

const STORAGE_KEY = 'chores-panel-theme';

// Per host bijhouden wat wij gezet hebben, zodat "Volg Home Assistant"
// precies dat weer weghaalt en niets anders.
const appliedProps = new WeakMap();

/** De bewaarde keuze voor dit apparaat; FOLLOW_HA als er niets staat. */
export function storedThemeName() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || FOLLOW_HA;
  } catch (err) {
    return FOLLOW_HA; // privémodus zonder localStorage: gewoon HA volgen
  }
}

/** Bewaar de keuze; FOLLOW_HA wist hem. */
export function storeThemeName(name) {
  try {
    if (name === FOLLOW_HA) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, name);
  } catch (err) {
    // niet kunnen bewaren is geen reden om de keuze nu niet toe te passen
  }
}

/**
 * Pas een thema toe op de host, of herstel het geërfde thema.
 *
 * hassThemes is hass.themes: {themes: {naam: vars}, darkMode, ...}. Moderne
 * thema's hebben een modes-structuur ({modes: {light: {...}, dark: {...}}});
 * de variant volgt hass.themes.darkMode en wordt over de basisvariabelen
 * heen gemengd. Een onbekende naam (thema verwijderd?) gedraagt zich als
 * FOLLOW_HA.
 */
export function applyTheme(host, hassThemes, name) {
  for (const prop of appliedProps.get(host) || []) {
    host.style.removeProperty(prop);
  }
  appliedProps.delete(host);

  const theme = name === FOLLOW_HA ? null : hassThemes?.themes?.[name];
  if (!theme) return;

  const vars = { ...theme };
  delete vars.modes;
  if (theme.modes) {
    Object.assign(vars, hassThemes.darkMode ? theme.modes.dark : theme.modes.light);
  }

  const props = [];
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const prop = key.startsWith('--') ? key : `--${key}`;
    host.style.setProperty(prop, String(value));
    props.push(prop);
  }
  appliedProps.set(host, props);
}
