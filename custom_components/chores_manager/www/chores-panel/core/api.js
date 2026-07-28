/**
 * Dunne laag over hass.connection voor de negen WS-commando's (plan §2.3).
 *
 * Geen fetch, geen tokens, geen headers: alles loopt over de WebSocket die HA
 * zelf al open heeft. subscribeMessage van home-assistant-js-websocket
 * herabonneert zichzelf na een verbroken verbinding, dus een reconnect
 * herstelt de event-stroom vanzelf; unsubscribe() ruimt netjes op wanneer het
 * panel uit de DOM gaat.
 */

class ChoresApi {
  constructor() {
    this._connection = null;
    this._unsubscribe = null;
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

  /** Volledige begintoestand: taken, personen, ranglijst, feed. */
  state() {
    return this._send({ type: 'chores_manager/state' });
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

  assigneeSave(assignee) {
    return this._send({ type: 'chores_manager/assignee/save', assignee });
  }

  assigneeDelete(assigneeId) {
    return this._send({
      type: 'chores_manager/assignee/delete', assignee_id: assigneeId,
    });
  }

  /** Abonneren op wijzigingen; callback krijgt {reason, ...} per mutatie. */
  async subscribe(callback) {
    await this.unsubscribe();
    this._unsubscribe = await this._connection.subscribeMessage(
      callback, { type: 'chores_manager/subscribe' });
  }

  async unsubscribe() {
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
}

export const api = new ChoresApi();
