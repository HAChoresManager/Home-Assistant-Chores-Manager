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
 * KAARTMODUS EN DE URL (fase 5): in kaartmodus (setConfig is aangeroepen,
 * dat doet alleen Lovelace en altijd vóór connectedCallback) blijft de
 * actieve weergave in de store en raakt niets de URL aan — geen hash zetten,
 * geen hashchange/location-changed-listeners. Popup-kaarten (Bubble Card)
 * leven zelf op hashes; een tabklik die de hash zou zetten sluit zo'n popup.
 * De tabs zijn daar knoppen in plaats van ankers, zodat ook de HA-router
 * nergens iets te onderscheppen heeft. Panelmodus houdt de hash-routing en
 * de werkende terugknop precies zoals ze waren.
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
 * Losse bedieningselementen buiten een formulier (thema, vakantieschakelaar
 * en -datum, en sinds v2.7 per persoon "Afwezig" met datum) houden hun
 * waarde in de store en hun focus via _render: die onthoudt de name van het
 * veld met focus en zet hem na het tekenen terug. Wat er bij een
 * schakelaar of datum gebeurt, staat in controls.js (afgesplitst bij v2.7,
 * om dit bestand onder de 600 regels te houden).
 *
 * Mutaties (afvinken, overslaan, terugdraaien, opslaan, verwijderen,
 * vakantie en afwezigheid aan/uit) staan met hun terugkoppeling in
 * actions.js; dit element houdt lifecycle, routing, render, delegatie,
 * thema's en de snackbar. De acties krijgen een klein context-object
 * (this._actions), niet het element zelf.
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
import { renderManage } from './views/manage.js';
import * as actions from './actions.js';
import { handleControlChange } from './controls.js';

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

function renderNav(view, narrow, cardMode) {
  // Smal scherm: HA verbergt de zijbalk, dus zonder eigen knop is er geen
  // enkele weg terug het menu in. hass-toggle-menu is HA's standaardevent
  // om de zijbalk te openen.
  // In kaartmodus zijn de tabs knoppen zonder href: niets voor de HA-router
  // om te onderscheppen, niets dat een popup-hash kan verstoren.
  const tab = ([id, label]) => (cardMode
    ? html`<button type="button" class="tab ${view === id ? 'active' : ''}"
        data-view="${id}" ${view === id ? html`aria-current="page"` : ''}>${label}</button>`
    : html`<a class="tab ${view === id ? 'active' : ''}" href="#${id}"
        ${view === id ? html`aria-current="page"` : ''}>${label}</a>`);
  return html`
    <nav class="tabs" aria-label="Weergave">
      ${narrow ? html`
        <button type="button" class="menu-btn" data-action="menu"
          aria-label="Zijbalk openen">☰</button>` : ''}
      ${TABS.map(tab)}
    </nav>`;
}

class ChoresPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._started = false;
    this._cardMode = false;
    this._unsubStore = null;
    this._snackbarTimer = 0;
    this._renderedEditing = null;
    this._focusPending = null;
    this._onClick = this._onClick.bind(this);
    this._onSubmit = this._onSubmit.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onLocationChanged = this._onLocationChanged.bind(this);
    // Wat actions.js van het element mag gebruiken — en niets meer.
    this._actions = {
      refresh: () => this._refresh(),
      showSnackbar: (text, options) => this._showSnackbar(text, options),
      hideSnackbar: () => this._hideSnackbar(),
    };
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

  /** Lovelace-kaartmodus: een lege configuratie is geldig. Alleen Lovelace
   * roept dit aan (vóór connectedCallback) — dus dit ís de modusdetectie. */
  setConfig(config) {
    if (config !== undefined && typeof config !== 'object') {
      throw new Error('chores-panel: kaartconfiguratie hoort leeg te zijn');
    }
    this._cardMode = true;
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
    // location-changed voor HA's pushState-navigatie (zie de kop). In
    // kaartmodus niet: daar is de URL van de popup/het dashboard, niet van ons.
    if (!this._cardMode) {
      window.addEventListener('hashchange', this._onLocationChanged);
      window.addEventListener('location-changed', this._onLocationChanged);
    }
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
    // Kaartmodus leest de URL niet; die begint gewoon op Vandaag.
    store.set({
      view: this._cardMode ? 'vandaag' : viewFromHash(),
      currentUserId: this._hass?.user?.id || null,
    });
    this._unsubStore = store.subscribe(() => this._render());
    this._render();
    await this._refresh();
    try {
      // subscribe herstelt zichzelf bij een backend die nog niet klaar is
      // (HA-herstart) en na elke reconnect — zie core/api.js. Moest er
      // gewacht worden, dan is de eerder opgehaalde staat mogelijk oud.
      const gewacht = await api.subscribe(
        () => this._refresh(), () => this._showConnecting());
      if (gewacht) await this._refresh();
    } catch (err) {
      // zonder abonnement werkt alles nog, alleen zonder live updates
      console.warn('chores-panel: abonneren mislukt', err);
    }
  }

  async _refresh() {
    try {
      const data = await api.state(() => this._showConnecting());
      // null: er is al een nieuwer antwoord toegepast, en dit oudere zou die
      // stand terugdraaien (antwoorden kunnen omdraaien, zie api.state)
      if (data === null) return;
      const patch = {
        loading: false, connecting: false, error: null, data, pending: new Set(),
      };
      // Tijdens de vakantie kan er niets gekozen of afgevinkt worden; een
      // keuzerij die nog openstond toen hij begon, gaat dicht.
      if (data?.vacation?.active) patch.chooser = null;
      store.set(patch);
    } catch (err) {
      store.set({
        loading: false, connecting: false, error: err?.message || String(err),
      });
    }
  }

  /** De backend is er nog niet (HA-herstart): rustig melden, geen foutscherm.
   * De retry in core/api.js lost het vanzelf op; _refresh wist de vlag. */
  _showConnecting() {
    if (!store.get().connecting) store.set({ connecting: true });
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
    // Rustige melding tijdens het wachten op een herstartende backend; de
    // bestaande inhoud blijft gewoon staan (geen foutscherm, herstelt zelf).
    const verbinden = state.connecting && state.data
      ? html`<p class="reconnect" role="status">Verbinden…</p>` : '';
    const focusName = this._focusedName() || this._focusPending;
    setContent(this._app,
      html`${renderNav(state.view, state.narrow, this._cardMode)}${verbinden}${body}`);
    this._restoreFocus(focusName);
  }

  /**
   * De name van het veld met focus binnen de weergave, of null. innerHTML
   * vervangt alle elementen, dus zonder dit verliest bv. de
   * vakantieschakelaar zijn toetsenbordfocus bij elke push-render.
   */
  _focusedName() {
    const active = this.shadowRoot?.activeElement;
    if (!active || !this._app.contains(active)) return null;
    return active.getAttribute('name') || null;
  }

  /**
   * Focus terug op het nieuwe element met dezelfde name. Staat dat
   * (tijdelijk) uit — de schakelaar tijdens een vakantie-aanroep — dan kan
   * het geen focus krijgen; onthoud de name dan voor de render die het
   * weer aanzet. Verdwijnt het element, dan vervalt de wens.
   */
  _restoreFocus(name) {
    this._focusPending = null;
    if (!name) return;
    const target = [...this._app.querySelectorAll('[name]')]
      .find((el) => el.getAttribute('name') === name);
    if (!target) return;
    if (target.disabled) {
      this._focusPending = name;
      return;
    }
    target.focus({ preventScroll: true });
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

    // Tabklik. Panelmodus: alleen de hash zetten, verder niets — zonder
    // preventDefault maakt de HA-router er een pushState van en vuurt
    // hashchange nooit. Kaartmodus: de weergave wisselt in de store en de
    // URL blijft met rust (een popup-hash mag niet sneuvelen).
    const tab = path.find(
      (el) => el instanceof HTMLElement && el.classList?.contains('tab'));
    if (tab) {
      event.preventDefault();
      const view = tab.dataset.view || (tab.getAttribute('href') || '').slice(1);
      if (!view) return;
      if (this._cardMode) {
        if (view !== store.get().view) {
          store.set({ view, chooser: null, editing: null });
        }
      } else if (`#${view}` !== window.location.hash) {
        window.location.hash = `#${view}`;
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
      await actions.complete(this._actions, choreId, assigneeId, subtaskId);
    } else if (action === 'choose') {
      store.set({ chooser: { choreId, subtaskId, mode: 'complete' } });
    } else if (action === 'choose-credit') {
      store.set({ chooser: { choreId, subtaskId: undefined, mode: 'credit' } });
    } else if (action === 'pick') {
      store.set({ chooser: null });
      await actions.complete(this._actions, choreId, assigneeId, subtaskId);
    } else if (action === 'skip') {
      // sluit zelf de keuzerij, in dezelfde store-wijziging als 'pending'
      await actions.skip(this._actions, choreId);
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
      await actions.undo(this._actions);
    } else if (action === 'revert-skip') {
      await actions.revertSkip(this._actions, Number(button.dataset.skip));
    } else if (action === 'vacation-save-until') {
      await actions.vacationSaveUntil(this._actions);
    } else if (action === 'absence-save-until') {
      await actions.absenceSaveUntil(this._actions, assigneeId);
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
    } else if (action === 'rotation-up' || action === 'rotation-down') {
      // Beurtvolgorde wisselen ín de DOM (E3): geen render, dus al het
      // getypte werk in het formulier blijft staan. collectChoreForm leest
      // de rijvolgorde terug.
      const row = button.closest('[data-rotation-row]');
      if (row && action === 'rotation-up' && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      } else if (row && action === 'rotation-down' && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      }
    } else if (action === 'restore-chore') {
      await actions.restore(this._actions, choreId);
    } else if (action === 'delete-confirm') {
      await actions.deleteEditing(this._actions);
    } else if (action === 'menu') {
      // HA's standaardmechanisme om de zijbalk te openen (smal scherm).
      this.dispatchEvent(new CustomEvent('hass-toggle-menu', {
        bubbles: true, composed: true,
      }));
    }
  }

  /**
   * Wijzigingen in velden: de themakeuze, de schakelaars en datums in
   * Beheer (vakantie, afwezigheid: controls.js), en veldwissels in
   * formulieren — die laatste tonen en verbergen zonder render
   * (data-switch).
   */
  async _onChange(event) {
    const select = event.target;
    if (select instanceof HTMLSelectElement && select.name === 'panel-theme') {
      this._setTheme(select.value);
      return;
    }
    if (await handleControlChange(this._actions, select)) return;
    if (!(select instanceof HTMLElement) || !select.dataset.switch) return;
    const groupName = select.dataset.switch;
    this.shadowRoot.querySelectorAll(`[data-switch-group="${groupName}"]`)
      .forEach((group) => {
        group.hidden = group.dataset.switchValue !== select.value;
      });
  }

  /** Formulier verzenden: de opslaglogica zelf staat in actions.js. */
  async _onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    event.preventDefault();
    await actions.submitForm(this._actions, form);
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
// kaartresource ongeversioneerd) en er kunnen oudere module-instanties
// naast leven (bv. een achtergebleven resource-registratie met een oude
// URL). De get-check vangt het normale geval; de try/catch vangt wat er
// dan nog doorheen komt — een tweede define is onschuldig, de eerste
// registratie blijft gewoon werken.
if (!customElements.get('chores-panel')) {
  try {
    customElements.define('chores-panel', ChoresPanel);
  } catch (err) {
    console.debug('chores-panel: define overgeslagen, element bestond al', err);
  }
}
