// Gast-Seite der Verbindung: verbindet sich mit dem Host, hält die Verbindung
// mit Herzschlag am Leben, verbindet bei Abbruch automatisch neu und misst den
// Uhrzeit-Versatz zum Host (für synchrones Abspielen).

import { Emitter, now } from '../lib/util.js';
import { parseHostMessage, hostPeerId } from './protocol.js';

const HEARTBEAT = 2000;
const DEAD_AFTER = 9000;

export class PeerGuest extends Emitter {
  constructor({ roomId, peerOptions, makeHello }) {
    super();
    this.roomId = roomId;
    this.peerOptions = peerOptions;
    this.makeHello = makeHello;
    this.peer = null;
    this.conn = null;
    this.status = 'idle';
    this.stopped = false;
    this.attempt = 0;
    this.lastHeard = 0;
    this.welcomed = false;
    this.clock = { offset: 0, samples: [] }; // hostZeit ≈ lokaleZeit + offset
    this.retryTimer = null;
    this.tick = setInterval(() => this.#heartbeat(), HEARTBEAT);
  }

  start() {
    if (this.stopped) return;
    this.#setStatus('connecting');
    const Peer = window.Peer;
    if (!Peer) {
      this.#setStatus('error', 'Verbindungsmodul konnte nicht geladen werden.');
      return;
    }
    const peer = new Peer(this.peerOptions);
    this.peer = peer;
    this.peerOpened = false;
    peer.on('open', () => {
      // 'open' kommt nach einem reconnect() erneut.
      const first = !this.peerOpened;
      this.peerOpened = true;
      if (first || !this.conn?.open) this.#connectHost();
    });
    peer.on('disconnected', () => {
      // Verbindungsdienst weg: neu verbinden ('open' baut dann die Verbindung zum Host neu auf).
      if (!this.stopped && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 3000);
    });
    peer.on('error', (err) => {
      if (this.stopped) return;
      const type = err?.type;
      if (type === 'peer-unavailable') {
        this.#setStatus('host-missing', 'Der Host ist gerade nicht erreichbar. Neuer Versuch läuft …');
        this.#scheduleRetry();
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(type)) {
        this.#setStatus('reconnecting', 'Verbindungsdienst nicht erreichbar, neuer Versuch …');
        this.#restartPeer();
      } else {
        console.warn('Verbindungsfehler (Gast)', type, err);
        this.#scheduleRetry();
      }
    });
  }

  #restartPeer() {
    try {
      this.peer?.destroy();
    } catch {
      /* egal */
    }
    this.peer = null;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.start(), this.#backoff());
  }

  #backoff() {
    this.attempt++;
    return Math.min(10000, 1000 * 2 ** Math.min(this.attempt, 4));
  }

  #scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.stopped) return;
      if (!this.peer || this.peer.destroyed || this.peer.disconnected) this.#restartPeer();
      else this.#connectHost();
    }, this.#backoff());
  }

  #connectHost() {
    if (this.stopped) return;
    try {
      this.conn?.close();
    } catch {
      /* egal */
    }
    this.welcomed = false;
    const conn = this.peer.connect(hostPeerId(this.roomId));
    this.conn = conn;
    conn.on('open', () => {
      this.lastHeard = now();
      this.#send(this.makeHello());
    });
    conn.on('data', (raw) => {
      if (this.conn !== conn) return;
      const msg = parseHostMessage(raw);
      if (!msg) return;
      this.lastHeard = now();
      if (msg.t === 'time') return this.#onTime(msg);
      if (msg.t === 'welcome') {
        this.welcomed = true;
        this.attempt = 0;
        this.#setStatus('online');
        // Uhrzeit-Versatz sofort messen, nicht erst mit dem nächsten Herzschlag.
        for (const d of [0, 300, 700]) setTimeout(() => this.#send({ t: 'time', c: now() }), d);
      }
      if (msg.t === 'reject') {
        this.#setStatus('rejected', msg.reason);
        this.stop(false);
      }
      if (msg.t === 'kicked') {
        this.#setStatus('kicked');
        this.stop(false);
      }
      this.emit('message', msg);
    });
    conn.on('close', () => {
      if (this.conn !== conn || this.stopped) return;
      this.#setStatus('reconnecting', 'Verbindung zum Host verloren. Verbinde neu …');
      this.#scheduleRetry();
    });
    conn.on('error', () => {});
  }

  #heartbeat() {
    if (!this.conn?.open || this.stopped) return;
    if (this.welcomed && now() - this.lastHeard > DEAD_AFTER) {
      try {
        this.conn.close();
      } catch {
        /* egal */
      }
      return;
    }
    this.#send({ t: 'time', c: now() });
  }

  #onTime({ c, h }) {
    const t = now();
    const rtt = t - c;
    if (rtt < 0 || rtt > 5000) return;
    const s = this.clock.samples;
    s.push({ rtt, offset: h + rtt / 2 - t });
    if (s.length > 10) s.shift();
    // Probe mit der kürzesten Laufzeit ist am genauesten.
    const best = s.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.clock.offset = best.offset;
    this.clock.rtt = best.rtt;
  }

  /** Host-Zeitpunkt in lokale Zeit umrechnen. */
  toLocalTime(hostTime) {
    return hostTime - this.clock.offset;
  }

  #setStatus(status, message = '') {
    this.status = status;
    this.statusMessage = message;
    this.emit('status', status, message);
  }

  #send(msg) {
    try {
      if (this.conn?.open) this.conn.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('Senden fehlgeschlagen', e);
    }
  }

  send(msg) {
    if (this.welcomed) this.#send(msg);
  }

  stop(sayBye = true) {
    if (sayBye) this.#send({ t: 'bye' });
    this.stopped = true;
    clearInterval(this.tick);
    clearTimeout(this.retryTimer);
    setTimeout(() => {
      try {
        this.peer?.destroy();
      } catch {
        /* egal */
      }
    }, 200);
  }
}
