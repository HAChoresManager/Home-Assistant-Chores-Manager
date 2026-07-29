/**
 * Dunne laag over hass.connection voor de tien WS-commando's (plan §2.3).
 *
 * Geen fetch, geen tokens, geen headers: alles loopt over de WebSocket die HA
 * zelf al open heeft. subscribeMessage van home-assistant-js-websocket
 * herabonneert zichzelf na een verbroken verbinding; unsubscribe() ruimt
 * netjes op wanneer het panel uit de DOM gaat.
 *
 * HERSTEL NA EEN HA-HERSTART: een herverbindend tabblad kan sneller zijn dan
 * de integratie — de WebSocket accepteert al verbindingen terwijl de
 * WS-commando's nog geregistreerd worden. Dan komt er "unknown_command"
 * terug op state/subscribe, en het interne herabonneren van de bibliotheek
 * probeert dat nooit opnieuw: het abonnement sterft stil en het panel
 * bevriest tot een refresh. Daarom hieronder:
 * - state() en subscribe() proberen bij unknown_command opnieuw met backoff
 *   (1s, 2s, 5s, daarna elke 10s) tot de backend er is. Dit is geen
 *   verstopte race (CLAUDE.md) maar herstel van een volgorde die de client
 *   niet kan afdwingen;
 * - op het 'ready'-event van de verbinding (elke reconnect) vervangen we
 *   het abonnement door een vers exemplaar — mét dezelfde retry — en geeft
 *   de callback één event {reason: 'reconnect'} zodat het panel de
 *   volledige staat ophaalt en niets gemist blijft.
 */

const RETRY_DELAYS = [1000, 2000, 5000];
const RETRY_INTERVAL = 10000;

function isUnknownCommand(err) {
  return err && err.code === 'unknown_command';
}

class ChoresApi {
  constructor() {
    this._connection = null;
    this._unsubscribe = null;
    this._callback = null;
    this._onWaiting = null;
    this._readyHandler = null;
  }

  setHass(hass) {
    this._connection = hass.connection;
  }

  _send(message) {
    if (!this._connection) {
      return Promise.reject(new Error('nog geen verbinding met Home Assistant'));
    }
    return this._connection.sendMessagePromise(message);
  }

  /**
   * Voer een aanroep uit; bij unknown_command wachten en opnieuw, tot de
   * backend zijn commando's geregistreerd heeft. Elke andere fout gaat
   * gewoon omhoog. Geeft {value, retried} terug.
   */
  async _withRetry(fn, onWaiting) {
    let attempt = 0;
    for (;;) {
      try {
        const value = await fn();
        return { value, retried: attempt > 0 };
      } catch (err) {
        if (!isUnknownCommand(err)) throw err;
        if (onWaiting) onWaiting();
        const delay = attempt < RETRY_DELAYS.length
          ? RETRY_DELAYS[attempt] : RETRY_INTERVAL;
        attempt += 1;
        await new Promise((resolve) => { setTimeout(resolve, delay); });
      }
    }
  }

  /**
   * Volledige begintoestand: taken, personen, ranglijst, feed.
   * onWaiting (optioneel) wordt aangeroepen zodra er gewacht moet worden op
   * een backend die nog niet klaar is — voor de "Verbinden…"-melding.
   */
  async state(onWaiting) {
    const { value } = await this._withRetry(
      () => this._send({ type: 'chores_manager/state' }), onWaiting);
    return value;
  }

  /** Taak, deeltaak of counter-tik afvinken. */
  complete({ choreId, assigneeId, subtaskId, note }) {
    const message = {
      type: 'chores_manager/complete',
      chore_id: choreId,
      assignee_id: assigneeId,
    };
    if (subtaskId !== undefined && subtaskId !== null) message.subtask_id = subtaskId;
    if (note) message.note = note;
    return this._send(message);
  }

  /** Laatste voltooiing terugdraaien (venster: vijf minuten). */
  undo() {
    return this._send({ type: 'chores_manager/undo' });
  }

  choreSave(chore) {
    return this._send({ type: 'chores_manager/chore/save', chore });
  }

  choreDelete(choreId) {
    return this._send({ type: 'chores_manager/chore/delete', chore_id: choreId });
  }

  /** mode: 'tomorrow' (naar morgen) of 'skip' (volgende geplande keer). */
  choreSnooze(choreId, mode) {
    return this._send({
      type: 'chores_manager/chore/snooze', chore_id: choreId, mode,
    });
  }

  /** Gearchiveerde taak terugzetten met een verse vervaldatum (E1). */
  choreRestore(choreId) {
    return this._send({
      type: 'chores_manager/chore/restore', chore_id: choreId,
    });
  }

  assigneeSave(assignee) {
    return this._send({ type: 'chores_manager/assignee/save', assignee });
  }

  assigneeDelete(assigneeId) {
    return this._send({
      type: 'chores_manager/assignee/delete', assignee_id: assigneeId,
    });
  }

  /**
   * Abonneren op wijzigingen; callback krijgt {reason, ...} per mutatie en
   * {reason: 'reconnect'} na elk herstel van de verbinding. Geeft terug of
   * er gewacht moest worden — dan is een extra state-refresh nodig, want in
   * de wachttijd kan er van alles gebeurd zijn.
   */
  async subscribe(callback, onWaiting) {
    this._callback = callback;
    this._onWaiting = onWaiting || null;
    if (!this._readyHandler) {
      this._readyHandler = () => { this._onConnectionReady(); };
      this._connection.addEventListener('ready', this._readyHandler);
    }
    return this._resubscribe();
  }

  async _resubscribe() {
    await this._dropSubscription();
    const { value, retried } = await this._withRetry(
      () => this._connection.subscribeMessage(
        (event) => { if (this._callback) this._callback(event); },
        { type: 'chores_manager/subscribe' }),
      this._onWaiting);
    if (!this._callback) {
      // panel is tijdens het wachten uit de DOM gegaan: meteen weer opzeggen
      value().catch(() => {});
      return retried;
    }
    this._unsubscribe = value;
    return retried;
  }

  /**
   * Elke reconnect: het interne herabonneren van de bibliotheek kan op een
   * nog niet klare backend stukgelopen zijn; vervang het abonnement daarom
   * altijd door een vers exemplaar en laat het panel de staat verversen.
   */
  async _onConnectionReady() {
    if (!this._callback) return;
    try {
      await this._resubscribe();
      if (this._callback) this._callback({ reason: 'reconnect' });
    } catch (err) {
      console.warn('chores-panel: herabonneren na reconnect mislukt', err);
    }
  }

  /** Alleen het lopende abonnement opzeggen; de callback blijft staan
   * zodat _resubscribe een vers abonnement kan leggen. */
  async _dropSubscription() {
    if (this._unsubscribe) {
      const unsubscribe = this._unsubscribe;
      this._unsubscribe = null;
      try {
        await unsubscribe();
      } catch (err) {
        // verbinding al weg; niets op te ruimen
      }
    }
  }

  /** Volledig opruimen (panel uit de DOM): abonnement én callback weg, zodat
   * de ready-handler en een eventueel nog wachtende retry niets meer doen. */
  async unsubscribe() {
    this._callback = null;
    await this._dropSubscription();
  }
}

export const api = new ChoresApi();
