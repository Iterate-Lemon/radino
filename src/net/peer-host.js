// Host-Seite der Verbindung: nimmt WebRTC-Verbindungen der Gäste an (über PeerJS).
// Kennt keine Spielregeln, nur Verbindungen, Handshake, Herzschlag und Limits.

import { Emitter, now } from '../lib/util.js';
import { parseGuestMessage, hostPeerId } from './protocol.js';
import { watchIce } from './peer-guest.js';

const HELLO_TIMEOUT = 8000;
const DEAD_AFTER = 10000;
const RATE_WINDOW = 1000;
const RATE_SOFT = 40; // Nachrichten pro Sekunde, darüber wird verworfen
const RATE_HARD = 120; // darüber wird die Verbindung getrennt
const MAX_CONNECTIONS = 24;

export class PeerHost extends Emitter {
  constructor({ roomId, peerOptions }) {
    super();
    this.roomId = roomId;
    this.peerOptions = peerOptions;
    this.peer = null;
    this.clients = new Set(); // { conn, pid, lastSeen, rate }
    this.byPid = new Map();
    this.status = 'idle';
    this.retryTimer = null;
    this.stopped = false;
    this.tick = setInterval(() => this.#checkAlive(), 2000);
  }

  start() {
    if (this.stopped) return;
    clearTimeout(this.retryTimer);
    this.#setStatus('connecting');
    const Peer = window.Peer;
    if (!Peer) {
      this.#setStatus('error', 'PeerJS konnte nicht geladen werden.');
      return;
    }
    const peer = new Peer(hostPeerId(this.roomId), { debug: 1, ...this.peerOptions });
    this.peer = peer;
    this.opened = false;
    this.reconnectAttempt = 0;
    peer.on('open', () => {
      this.opened = true;
      this.reconnectAttempt = 0;
      this.#setStatus('online');
    });
    peer.on('connection', (conn) => this.#onConnection(conn));
    peer.on('disconnected', () => {
      // Verbindung zum Vermittlungsdienst weg; bestehende WebRTC-Verbindungen laufen weiter.
      if (this.stopped || peer.destroyed) return;
      this.#setStatus('retrying', 'Vermittlungsdienst kurz weg – das laufende Spiel ist nicht betroffen.');
      this.#reconnectSoon(peer);
    });
    peer.on('error', (err) => {
      const type = err?.type;
      if (this.stopped) return;
      if (type === 'unavailable-id') {
        // Nach einem Neuladen hält der Vermittlungsdienst die alte ID noch kurz fest.
        this.#setStatus('retrying', 'Raum wird wieder geöffnet …');
        this.#restart(4000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(type)) {
        this.#setStatus('retrying', 'Vermittlungsdienst nicht erreichbar, neuer Versuch …');
        // War der Raum schon offen, nur die Vermittlung neu verbinden (gleiche ID,
        // bestehende Spieler-Verbindungen bleiben). Sonst ganz neu starten.
        if (this.opened && !peer.destroyed) this.#reconnectSoon(peer);
        else this.#restart(5000);
      } else if (type === 'browser-incompatible') {
        this.#setStatus('error', 'Dieser Browser unterstützt kein WebRTC.');
      } else {
        console.warn('PeerJS-Fehler (Host)', type, err);
      }
    });
  }

  #reconnectSoon(peer) {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(15000, 2000 * 2 ** Math.min(this.reconnectAttempt++, 3));
    this.reconnectTimer = setTimeout(() => {
      if (this.stopped || peer.destroyed || this.peer !== peer) return;
      if (peer.disconnected) {
        try {
          peer.reconnect();
        } catch {
          this.#restart(3000);
        }
      }
    }, delay);
  }

  #restart(delay) {
    try {
      this.peer?.destroy();
    } catch {
      /* egal */
    }
    for (const c of [...this.clients]) this.#drop(c);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.start(), delay);
  }

  #setStatus(status, message = '') {
    this.status = status;
    this.statusMessage = message;
    this.emit('status', status, message);
  }

  #onConnection(conn) {
    // Nur das eigene Textformat zulassen (kein Binärformat mit Puffer vor dem Handshake).
    if (conn.serialization !== 'raw' || this.clients.size >= MAX_CONNECTIONS) {
      conn.close();
      return;
    }
    watchIce(conn, 'Host');
    const client = { conn, pid: null, lastSeen: now(), rate: { start: now(), count: 0 } };
    this.clients.add(client);
    client.helloTimer = setTimeout(() => {
      if (!client.pid) this.#drop(client);
    }, HELLO_TIMEOUT);

    conn.on('data', (raw) => this.#onData(client, raw));
    conn.on('close', () => this.#drop(client));
    conn.on('error', () => this.#drop(client));
  }

  #onData(client, raw) {
    const t = now();
    const r = client.rate;
    if (t - r.start > RATE_WINDOW) {
      r.start = t;
      r.count = 0;
    }
    r.count++;
    if (r.count > RATE_HARD) return this.#drop(client);
    if (r.count > RATE_SOFT) return;

    const msg = parseGuestMessage(raw);
    if (!msg) return;
    client.lastSeen = t;

    if (!client.pid) {
      if (msg.t === 'hello') this.emit('hello', client, msg);
      return;
    }
    if (msg.t === 'time') {
      this.#sendRaw(client, { t: 'time', c: msg.c, h: now() });
      return;
    }
    if (msg.t === 'bye') {
      this.#drop(client);
      return;
    }
    this.emit('message', client.pid, msg);
  }

  /** Handshake annehmen: Verbindung gehört ab jetzt zu Spieler pid. */
  accept(client, pid, welcome) {
    clearTimeout(client.helloTimer);
    const old = this.byPid.get(pid);
    if (old && old !== client) {
      old.pid = null; // kein "leave" für die alte Verbindung auslösen
      this.#drop(old);
    }
    client.pid = pid;
    this.byPid.set(pid, client);
    this.#sendRaw(client, welcome);
  }

  reject(client, reason) {
    this.#sendRaw(client, { t: 'reject', reason });
    setTimeout(() => this.#drop(client), 300);
  }

  send(pid, msg) {
    const c = this.byPid.get(pid);
    if (c) this.#sendRaw(c, msg);
  }

  broadcast(msgOrFn) {
    for (const [pid, c] of this.byPid) {
      const msg = typeof msgOrFn === 'function' ? msgOrFn(pid) : msgOrFn;
      if (msg) this.#sendRaw(c, msg);
    }
  }

  kick(pid) {
    const c = this.byPid.get(pid);
    if (!c) return;
    this.#sendRaw(c, { t: 'kicked' });
    setTimeout(() => this.#drop(c), 300);
  }

  isConnected(pid) {
    return this.byPid.has(pid);
  }

  #sendRaw(client, msg) {
    try {
      if (client.conn.open) client.conn.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('Senden fehlgeschlagen', e);
    }
  }

  #drop(client) {
    if (!this.clients.has(client)) return;
    this.clients.delete(client);
    clearTimeout(client.helloTimer);
    try {
      client.conn.close();
    } catch {
      /* egal */
    }
    if (client.pid && this.byPid.get(client.pid) === client) {
      this.byPid.delete(client.pid);
      this.emit('leave', client.pid);
    }
  }

  #checkAlive() {
    const t = now();
    for (const c of [...this.clients]) {
      if (c.pid && t - c.lastSeen > DEAD_AFTER) this.#drop(c);
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.tick);
    clearTimeout(this.retryTimer);
    clearTimeout(this.reconnectTimer);
    for (const c of [...this.clients]) this.#drop(c);
    try {
      this.peer?.destroy();
    } catch {
      /* egal */
    }
  }
}
