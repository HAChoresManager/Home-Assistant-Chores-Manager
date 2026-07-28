/**
 * <chores-panel> — entrypoint van het panel op /taken.
 *
 * Vier weergaven (Vandaag, Alles, Activiteit, Beheer) achter tabs; de actieve
 * weergave staat in de URL-hash zodat een refresh je niet terugzet.
 *
 * Het element werkt op twee manieren:
 * - als panel op /taken (geregistreerd in panel.py); HA levert hass en narrow;
 * - als Lovelace-kaart (type: custom:chores-panel) via de resource-URL
 *   /chores_manager-panel/chores-panel.js — setConfig/getCardSize hieronder.
 *   Geen iframe: Lovelace mount het element direct en geeft zelf hass door.
 * Omdat beide routes hetzelfde bestand op twee URL's kunnen laden, staat er
 * een guard om customElements.define.
 *
 * ROUTERVALKUIL: de HA-frontend onderschept elke klik op een <a> (ook door
 * shadow DOM heen) en vertaalt hem naar history.pushState() — en pushState
 * vuurt géén hashchange. Daarom krijgt de tabklik hier een preventDefault en
 * zetten we de hash zelf: dat ís een echte hashnavigatie. Eén handler op
 * window luistert naar hashchange én naar HA's location-changed (het event
 * dat HA na een pushState uitstuurt) en triggert de render; hij is
 * idempotent, zodat dubbele events (terugknop vuurt beide) een open
 * formulier niet wissen.
 *
 * BELANGRIJKE VALKUIL — de hass-setter:
 * Home Assistant zet de hass-property bij ELKE state-change in het hele
 * systeem, mogelijk vele keren per seconde. In die setter renderen maakt het
 * panel onbruikbaar traag. Daarom bewaart de setter alleen de referentie en
 * geeft hij de verbinding door aan de api-laag. Gerenderd wordt er op precies
 * twee momenten: bij de eerste start, en wanneer chores_manager/subscribe een
 * event binnenbrengt. De storeluisteraar vertaalt elke toestandswijziging
 * naar één render.
 *
 * Formulieren zijn de uitzondering op "alles hertekent": zolang hetzelfde
 * formulier openstaat wordt een render overgeslagen, anders wist een
 * binnenkomend event je getypte werk. Veldwissels (planningstype, toewijzing,
 * deeltaken) togglen dan ook in de DOM via data-switch, zonder render.
 *
 * Versiediscipline (sinds 3c): de versie zit in het statische pad
 * (/chores_manager-panel-<versie>/), dus relatieve imports erven hem vanzelf
 * en er staan geen ?v=-parameters meer in dit bestand. Eén bron:
 * PANEL_VERSION in panel.py. Zie CLAUDE.md.
 */
import { api } from './core/api.js';
import { store } from './core/store.js';
import { html, setContent } from './core/html.js';
import { FOLLOW_HA, applyTheme, storedThemeName, storeThemeName } from './core/theme.js';
import { renderToday } from './views/today.js';
import { renderTasks } from './views/tasks.js';
import { renderActivity } from './views/activity.js';
import { renderManage, collectAssigneeForm } from './views/manage.js';
import { collectChoreForm } from './components/task-form.js';
import { isFinalAction } from './components/task-card.js';

const TABS = [
  ['vandaag', 'Vandaag'],
  ['alles', 'Alles'],
  ['activiteit', 'Activiteit'],
  ['beheer', 'Beheer'],
];

const VIEWS = {
  vandaag: renderToday,
  alles: renderTasks,
  activiteit: renderActivity,
  beheer: renderManage,
};

function viewFromHash() {
  const hash = window.location.hash.replace('#', '');
  return VIEWS[hash] ? hash : 'vandaag';
}

/**
 * Opties voor het personenformulier (fase 4), vers uit hass op het moment
 * dat het formulier opent. HA-gebruikers komen uit de person-entiteiten
 * (attributes.user_id) — dat kan zonder admin-endpoint; de user-lijst van
 * config/auth/list is admin-only en dus bewust niet gebruikt. Wie geen
 * person-entiteit heeft, staat er niet tussen; een bestaande koppeling
 * blijft in het formulier altijd zichtbaar als eigen optie.
 */
function haOptionsFromHass(hass) {
  const users = [];
  for (const [entityId, entity] of Object.entries(hass?.states || {})) {
    if (!entityId.startsWith('person.')) continue;
    const userId = entity.attributes?.user_id;
    if (!userId) continue;
    users.push({ id: userId, name: entity.attributes.friendly_name || entityId });
  }
  users.sort((a, b) => a.name.localeCompare(b.name));
  const services = Object.keys(hass?.services?.notify || {})
    .filter((name) => name.startsWith('mobile_app_'))
    .sort()
    .map((name) => `notify.${name}`);
  return { users, services };
}

function renderNav(view, narrow) {
  // Smal scherm: HA verbergt de zijbalk, dus zonder eigen knop is er geen
  // enkele weg terug het menu in. hass-toggle-menu is HA's standaardevent
  // om de zijbalk te openen.
  return html`
    <nav class="tabs" aria-label="Weergave">
      ${narrow ? html`
        <button type="button" class="menu-btn" data-action="menu"
          aria-label="Zijbalk openen">☰</button>` : ''}
      ${TABS.map(([id, label]) => html`
        <a class="tab ${view === id ? 'active' : ''}" href="#${id}"
          ${view === id ? html`aria-current="page"` : ''}>${label}</a>`)}
    </nav>`;
}

class ChoresPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._started = false;
    this._unsubStore = null;
    this._snackbarTimer = 0;
    this._renderedEditing = null;
    this._onClick = this._onClick.bind(this);
    this._onSubmit = this._onSubmit.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onLocationChanged = this._onLocationChanged.bind(this);
  }

  /** Zie de valkuil in de kop: hier alleen bewaren, nooit renderen. */
  set hass(hass) {
    const previous = this._hass;
    this._hass = hass;
    api.setHass(hass);
    if (!this._started && this.isConnected) this._start();
    // Vergelijking per referentie: hass komt vaak, maar het themes-object
    // wisselt alleen bij een themawijziging of een dag/nacht-omslag.
    else if (this._started && hass && hass.themes !== previous?.themes) {
      this._syncThemes();
    }
  }

  get hass() {
    return this._hass;
  }

  /** HA geeft narrow door zodra de zijbalk verdwijnt; render alleen bij wissel. */
  set narrow(value) {
    const narrow = Boolean(value);
    if (narrow !== store.get().narrow) store.set({ narrow });
  }

  get narrow() {
    return store.get().narrow;
  }

  /** Lovelace-kaartmodus: een lege configuratie is geldig. */
  setConfig(config) {
    if (config !== undefined && typeof config !== 'object') {
      throw new Error('chores-panel: kaartconfiguratie hoort leeg te zijn');
    }
  }

  getCardSize() {
    return 8;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      // De CSS komt van hetzelfde pad als deze module (import.meta.url):
      // geversioneerd op /taken, ongeversioneerd bij kaartgebruik.
      root.innerHTML = `
        <link rel="stylesheet" href="${new URL('./styles.css', import.meta.url).href}">
        <link rel="stylesheet" href="${new URL('./styles-views.css', import.meta.url).href}">
        <main id="app" aria-live="polite"></main>
        <div id="snackbar" role="status" hidden></div>`;
      this._app = root.getElementById('app');
      this._snackbar = root.getElementById('snackbar');
      // Event delegation op de shadow root: opnieuw renderen sloopt zo geen
      // listeners (CLAUDE.md), en de snackbarknop doet vanzelf mee.
      root.addEventListener('click', this._onClick);
      root.addEventListener('submit', this._onSubmit);
      root.addEventListener('change', this._onChange);
    }
    // Beide events: hashchange voor echte hashnavigatie (tabklik, terugknop),
    // location-changed voor HA's pushState-navigatie (zie de kop).
    window.addEventListener('hashchange', this._onLocationChanged);
    window.addEventListener('location-changed', this._onLocationChanged);
    if (this._hass && !this._started) this._start();
  }

  disconnectedCallback() {
    this._started = false;
    window.removeEventListener('hashchange', this._onLocationChanged);
    window.removeEventListener('location-changed', this._onLocationChanged);
    api.unsubscribe();
    if (this._unsubStore) {
      this._unsubStore();
      this._unsubStore = null;
    }
  }

  async _start() {
    this._started = true;
    // Bewaarde themakeuze toepassen vóór de eerste render — geen flits.
    this._syncThemes();
    // Voor de chip-default op 'anyone'-taken (§4.4, fase 4): wie ben ik?
    store.set({ view: viewFromHash(), currentUserId: this._hass?.user?.id || null });
    this._unsubStore = store.subscribe(() => this._render());
    this._render();
    await this._refresh();
    try {
      await api.subscribe(() => this._refresh());
    } catch (err) {
      // zonder abonnement werkt alles nog, alleen zonder live updates
      console.warn('chores-panel: abonneren mislukt', err);
    }
  }

  async _refresh() {
    try {
      const data = await api.state();
      store.set({ loading: false, error: null, data, pending: new Set() });
    } catch (err) {
      store.set({ loading: false, error: err?.message || String(err) });
    }
  }

  _render() {
    const state = store.get();
    // Een openstaand formulier met rust laten: alleen hertekenen als het
    // formulier zelf wisselt (openen, sluiten, bevestigingsstap).
    if (state.editing && state.editing === this._renderedEditing) return;
    this._renderedEditing = state.editing;
    const body = state.loading || state.error || !state.data
      ? VIEWS.vandaag(state)
      : VIEWS[state.view](state);
    setContent(this._app, html`${renderNav(state.view, state.narrow)}${body}`);
  }

  /**
   * Themastaat bijwerken: bewaarde keuze toepassen op de host en de lijst
   * met themanamen voor het Beheer-scherm in de store zetten. Draait bij de
   * start en wanneer hass.themes wisselt (thema bewerkt, dag/nacht-omslag);
   * de store wordt alleen geraakt als er echt iets veranderde.
   */
  _syncThemes() {
    const themes = this._hass?.themes;
    if (!themes) return;
    const selected = store.get().themes?.selected ?? storedThemeName();
    applyTheme(this, themes, selected);
    const names = Object.keys(themes.themes || {}).sort((a, b) => a.localeCompare(b));
    const current = store.get().themes;
    if (!current || current.selected !== selected
      || current.names.join('\n') !== names.join('\n')) {
      store.set({ themes: { names, selected } });
    }
  }

  /** Keuze uit het Beheer-scherm: toepassen, bewaren, store bijwerken. */
  _setTheme(name) {
    storeThemeName(name);
    applyTheme(this, this._hass?.themes, name);
    const themes = store.get().themes || { names: [] };
    store.set({ themes: { ...themes, selected: name } });
  }

  /**
   * Eén plek die de URL naar de weergave vertaalt. Idempotent: de terugknop
   * vuurt hashchange én location-changed, en HA's setter-verkeer mag een open
   * formulier niet wissen als de weergave niet echt wisselt.
   */
  _onLocationChanged() {
    const view = viewFromHash();
    if (view === store.get().view) return;
    store.set({ view, chooser: null, editing: null });
  }

  async _onClick(event) {
    const path = event.composedPath();

    // Tabklik: alleen de hash zetten, verder niets. Zonder preventDefault
    // maakt de HA-router er een pushState van en vuurt hashchange nooit.
    const tab = path.find(
      (el) => el instanceof HTMLElement && el.classList?.contains('tab'));
    if (tab) {
      event.preventDefault();
      const target = tab.getAttribute('href');
      if (target && target !== window.location.hash) {
        window.location.hash = target;
      }
      return;
    }

    const button = path.find(
      (el) => el instanceof HTMLElement && el.dataset && el.dataset.action);
    if (!button || button.disabled) return;
    const { action } = button.dataset;
    const choreId = button.dataset.chore;
    const assigneeId = button.dataset.assignee;
    const subtaskId = button.dataset.subtask !== undefined
      ? Number(button.dataset.subtask) : undefined;
    const state = store.get();

    if (action === 'complete') {
      await this._complete(choreId, assigneeId, subtaskId);
    } else if (action === 'choose') {
      store.set({ chooser: { choreId, subtaskId, mode: 'complete' } });
    } else if (action === 'choose-credit') {
      store.set({ chooser: { choreId, subtaskId: undefined, mode: 'credit' } });
    } else if (action === 'pick') {
      store.set({ chooser: null });
      await this._complete(choreId, assigneeId, subtaskId);
    } else if (action === 'set-credit') {
      store.set({
        chooser: null,
        credits: { ...state.credits, [choreId]: assigneeId },
      });
    } else if (action === 'cancel-choose') {
      store.set({ chooser: null });
    } else if (action === 'toggle-steps') {
      const expanded = new Set(state.expanded);
      if (expanded.has(choreId)) expanded.delete(choreId);
      else expanded.add(choreId);
      store.set({ expanded });
    } else if (action === 'undo') {
      await this._undo();
    } else if (action === 'retry') {
      store.set({ loading: true, error: null });
      await this._refresh();
    } else if (action === 'new-chore') {
      store.set({ editing: { kind: 'chore', id: null, confirm: false } });
    } else if (action === 'edit-chore') {
      store.set({ editing: { kind: 'chore', id: choreId, confirm: false } });
    } else if (action === 'new-assignee') {
      // haOptions vers uit hass, precies op het moment dat het formulier opent
      store.set({
        editing: { kind: 'assignee', id: null, confirm: false },
        haOptions: haOptionsFromHass(this._hass),
      });
    } else if (action === 'edit-assignee') {
      store.set({
        editing: { kind: 'assignee', id: assigneeId, confirm: false },
        haOptions: haOptionsFromHass(this._hass),
      });
    } else if (action === 'form-cancel') {
      store.set({ editing: null });
    } else if (action === 'delete-ask') {
      store.set({ editing: { ...state.editing, confirm: true } });
    } else if (action === 'delete-cancel') {
      store.set({ editing: { ...state.editing, confirm: false } });
    } else if (action === 'delete-confirm') {
      await this._delete();
    } else if (action === 'menu') {
      // HA's standaardmechanisme om de zijbalk te openen (smal scherm).
      this.dispatchEvent(new CustomEvent('hass-toggle-menu', {
        bubbles: true, composed: true,
      }));
    }
  }

  /** Veldwissels in formulieren: tonen/verbergen zonder render (data-switch). */
  _onChange(event) {
    const select = event.target;
    if (select instanceof HTMLSelectElement && select.name === 'panel-theme') {
      this._setTheme(select.value);
      return;
    }
    if (!(select instanceof HTMLElement) || !select.dataset.switch) return;
    const groupName = select.dataset.switch;
    this.shadowRoot.querySelectorAll(`[data-switch-group="${groupName}"]`)
      .forEach((group) => {
        group.hidden = group.dataset.switchValue !== select.value;
      });
  }

  async _onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    event.preventDefault();
    try {
      if (form.dataset.form === 'chore') {
        const chore = collectChoreForm(form);
        await api.choreSave(chore);
        this._showSnackbar(`Opgeslagen: ${chore.name}`);
      } else {
        const assignee = collectAssigneeForm(form);
        await api.assigneeSave(assignee);
        this._showSnackbar(`Opgeslagen: ${assignee.name}`);
      }
      store.set({ editing: null });
      await this._refresh();
    } catch (err) {
      this._showFormError(form, err?.message || String(err));
    }
  }

  _showFormError(form, message) {
    // Buiten de store om: een render zou het formulier wissen.
    const slot = form.querySelector('[data-form-error]');
    if (slot) {
      slot.textContent = message;
      slot.hidden = false;
    } else {
      this._showSnackbar(message, { error: true });
    }
  }

  async _delete() {
    const state = store.get();
    const editing = state.editing;
    if (!editing || !editing.id) return;
    try {
      let result;
      let name;
      if (editing.kind === 'chore') {
        name = state.data.chores.find((c) => c.id === editing.id)?.name || editing.id;
        result = (await api.choreDelete(editing.id)).result;
      } else {
        name = state.data.assignees.find((a) => a.id === editing.id)?.name || editing.id;
        result = (await api.assigneeDelete(editing.id)).result;
      }
      this._showSnackbar(result === 'deactivated'
        ? `Gearchiveerd: ${name} (historie blijft)`
        : `Verwijderd: ${name}`);
      store.set({ editing: null });
      await this._refresh();
    } catch (err) {
      this._showSnackbar(err?.message || String(err), { error: true });
    }
  }

  /**
   * Afvinken met optimistische update (B5): een afrondende actie haalt de
   * kaart meteen uit beeld; bevestigt de server, dan blijft dat zo en komt er
   * "Ongedaan maken" in de bevestiging. Faalt de aanroep, dan komt de kaart
   * terug en vertelt de snackbar waarom. De snackbar noemt wie de credits
   * kreeg, zodat een verkeerde toewijzing binnen het undo-venster opvalt.
   */
  async _complete(choreId, assigneeId, subtaskId) {
    const state = store.get();
    const chore = state.data?.chores.find((c) => c.id === choreId);
    if (!chore || !assigneeId) return;
    const person = state.data.assignees.find((a) => a.id === assigneeId);
    const personName = person ? person.name : assigneeId;

    const finishes = isFinalAction(chore, subtaskId);
    if (finishes) {
      const pending = new Set(state.pending);
      pending.add(choreId);
      store.set({ pending });
    }

    try {
      const result = await api.complete({ choreId, assigneeId, subtaskId });
      if (result.was_full) {
        const credits = { ...store.get().credits };
        delete credits[choreId];
        store.set({ credits });
        this._showSnackbar(`Afgevinkt: ${chore.name} · ${personName}`, { undo: true });
      } else {
        this._showSnackbar(`Stap afgevinkt · ${personName}`, { undo: true });
      }
      await this._refresh();
    } catch (err) {
      const pending = new Set(store.get().pending);
      pending.delete(choreId);
      store.set({ pending });
      this._showSnackbar(
        `Afvinken is niet gelukt: ${err?.message || err}`, { error: true });
    }
  }

  async _undo() {
    this._hideSnackbar();
    try {
      await api.undo();
      this._showSnackbar('Teruggedraaid');
      await this._refresh();
    } catch (err) {
      this._showSnackbar(err?.message || 'Terugdraaien is niet gelukt', { error: true });
    }
  }

  /** Snackbar via textContent — nooit markup uit data. */
  _showSnackbar(text, { undo = false, error = false } = {}) {
    const bar = this._snackbar;
    bar.textContent = '';
    const message = document.createElement('span');
    message.textContent = text;
    bar.appendChild(message);
    if (undo) {
      const undoButton = document.createElement('button');
      undoButton.textContent = 'Ongedaan maken';
      undoButton.dataset.action = 'undo';
      bar.appendChild(undoButton);
    }
    bar.classList.toggle('error', error);
    bar.hidden = false;
    clearTimeout(this._snackbarTimer);
    this._snackbarTimer = setTimeout(
      () => this._hideSnackbar(), undo ? 8000 : 4000);
  }

  _hideSnackbar() {
    this._snackbar.hidden = true;
  }
}

// Guard: het bestand is op twee URL's bereikbaar (panel geversioneerd,
// kaartresource ongeversioneerd); een tweede define zou anders gooien.
if (!customElements.get('chores-panel')) {
  customElements.define('chores-panel', ChoresPanel);
}
