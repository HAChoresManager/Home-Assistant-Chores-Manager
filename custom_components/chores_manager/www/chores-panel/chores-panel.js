/**
 * <chores-panel> — entrypoint van het nieuwe panel op /taken (fase 3a).
 *
 * Shadow DOM: HA's CSS-variabelen erven er gewoon doorheen (custom properties
 * steken door shadow-grenzen), en de stijlisolatie krijg je gratis.
 *
 * BELANGRIJKE VALKUIL — de hass-setter:
 * Home Assistant zet de hass-property bij ELKE state-change in het hele
 * systeem, mogelijk vele keren per seconde. In die setter renderen maakt het
 * panel onbruikbaar traag. Daarom bewaart de setter alleen de referentie en
 * geeft hij de verbinding door aan de api-laag. Gerenderd wordt er op precies
 * twee momenten: bij de eerste start, en wanneer chores_manager/subscribe een
 * event binnenbrengt (elke mutatie, ook die van anderen of van de nachtelijke
 * rol). De storeluisteraar vertaalt elke toestandswijziging naar één render.
 *
 * Versiediscipline: de ?v= in elke import hieronder spiegelt PANEL_VERSION in
 * panel_v2.py. Zie CLAUDE.md.
 */
import { api } from './core/api.js?v=2.0.0-20260728-fase3a';
import { store } from './core/store.js?v=2.0.0-20260728-fase3a';
import { setContent } from './core/html.js?v=2.0.0-20260728-fase3a';
import { renderToday } from './views/today.js?v=2.0.0-20260728-fase3a';
import { isFinalAction } from './components/task-card.js?v=2.0.0-20260728-fase3a';

const VERSION = '2.0.0-20260728-fase3a';
const STYLES_URL = `/chores_manager-panel/styles.css?v=${VERSION}`;

class ChoresPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._started = false;
    this._unsubStore = null;
    this._snackbarTimer = 0;
    this._onClick = this._onClick.bind(this);
  }

  /** Zie de valkuil in de kop: hier alleen bewaren, nooit renderen. */
  set hass(hass) {
    this._hass = hass;
    api.setHass(hass);
    if (!this._started && this.isConnected) this._start();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <link rel="stylesheet" href="${STYLES_URL}">
        <main id="app" aria-live="polite"></main>
        <div id="snackbar" role="status" hidden></div>`;
      this._app = root.getElementById('app');
      this._snackbar = root.getElementById('snackbar');
      // Event delegation op containerniveau: opnieuw renderen sloopt zo geen
      // listeners (CLAUDE.md). De shadow root vangt ook de snackbarknop.
      root.addEventListener('click', this._onClick);
    }
    if (this._hass && !this._started) this._start();
  }

  disconnectedCallback() {
    this._started = false;
    api.unsubscribe();
    if (this._unsubStore) {
      this._unsubStore();
      this._unsubStore = null;
    }
  }

  async _start() {
    this._started = true;
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
    setContent(this._app, renderToday(store.get()));
  }

  async _onClick(event) {
    const button = event.composedPath().find(
      (el) => el instanceof HTMLElement && el.dataset && el.dataset.action);
    if (!button || button.disabled) return;
    const { action } = button.dataset;
    const choreId = button.dataset.chore;
    const subtaskId = button.dataset.subtask !== undefined
      ? Number(button.dataset.subtask) : undefined;

    if (action === 'complete') {
      await this._complete(choreId, button.dataset.assignee, subtaskId);
    } else if (action === 'choose') {
      store.set({ chooser: { choreId, subtaskId } });
    } else if (action === 'pick') {
      store.set({ chooser: null });
      await this._complete(choreId, button.dataset.assignee, subtaskId);
    } else if (action === 'cancel-choose') {
      store.set({ chooser: null });
    } else if (action === 'undo') {
      await this._undo();
    } else if (action === 'retry') {
      store.set({ loading: true, error: null });
      await this._refresh();
    }
  }

  /**
   * Afvinken met optimistische update (B5): een afrondende actie haalt de
   * kaart meteen uit beeld; bevestigt de server, dan blijft dat zo en komt er
   * "Ongedaan maken" in de bevestiging. Faalt de aanroep, dan komt de kaart
   * terug en vertelt de snackbar waarom.
   */
  async _complete(choreId, assigneeId, subtaskId) {
    const state = store.get();
    const chore = state.data?.chores.find((c) => c.id === choreId);
    if (!chore || !assigneeId) return;

    const finishes = isFinalAction(chore, subtaskId);
    if (finishes) {
      const pending = new Set(state.pending);
      pending.add(choreId);
      store.set({ pending });
    }

    try {
      const result = await api.complete({ choreId, assigneeId, subtaskId });
      if (result.was_full) {
        this._showSnackbar(`Afgevinkt: ${chore.name}`, { undo: true });
      } else {
        this._showSnackbar('Stap afgevinkt', { undo: true });
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

customElements.define('chores-panel', ChoresPanel);
