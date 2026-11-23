// Verbindung zwischen Host und Gästen über einen öffentlichen MQTT-Dienst (WebSocket).
// Ersetzt WebRTC/PeerJS: Jeder Browser baut nur eine ausgehende WebSocket-Verbindung
// auf. Das klappt in praktisch jedem Netz, ohne STUN/TURN und ohne Browser-Ausnahmen.
// Es laufen mehrere Dienste gleichzeitig: Jede Nachricht geht über alle, die erste
// Kopie zählt. Fällt ein Dienst aus oder hängt er, merkt das Spiel davon nichts.
// Alle Nachrichten sind mit dem Schlüssel aus dem Einladungslink verschlüsselt
// (AES-GCM); der Dienst sieht nur Zufallsbytes.
// Die Klasse bietet die kleine Peer-Schnittstelle, die PeerHost/PeerGuest nutzen
// (dieselbe wie src/dev/fake-peer.js).

const enc = new TextEncoder();
const dec = new TextDecoder();
const TOPIC = 'radino/';
const rid = () => Array.from(crypto.getRandomValues(new Uint32Array(3)), (n) => n.toString(36)).join('');

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ── Minimaler MQTT-3.1.1-Client: verbinden, ein Thema abonnieren, senden (QoS 0) ──

const mqttStr = (s) => {
  const b = enc.encode(s);
  return concat([b.length >> 8, b.length & 255], b);
};

function packet(head, ...parts) {
  const body = concat(...parts);
  const len = [];
  let n = body.length;
  do {
    len.push((n & 127) | (n > 127 ? 128 : 0));
    n >>= 7;
  } while (n);
  return concat([head], len, body);
}

class MqttLink {
  /** on: { open(), message(bytes), close(warOffen) } */
  constructor(url, topic, on) {
    this.on = on;
    this.topic = topic;
    this.ready = false;
    this.closed = false;
    this.buf = new Uint8Array(0);
    this.pong = true;
    let ws;
    try {
      ws = this.ws = new WebSocket(url, 'mqtt');
    } catch {
      queueMicrotask(() => this.close());
      return;
    }
    ws.binaryType = 'arraybuffer';
    // CONNECT: Protokoll "MQTT" Version 4, saubere Sitzung, Keepalive 60 s
    ws.onopen = () => ws.send(packet(0x10, mqttStr('MQTT'), [4, 2, 0, 60], mqttStr('radino-' + rid())));
    ws.onmessage = (e) => this.#read(new Uint8Array(e.data));
    ws.onclose = () => this.close();
    this.timer = setTimeout(() => this.ready || this.close(), 8000);
  }

  #read(chunk) {
    let buf = this.buf.length ? concat(this.buf, chunk) : chunk;
    for (;;) {
      // Paketlänge: 1–4 Bytes mit je 7 Bit
      let i = 1;
      let len = 0;
      let shift = 0;
      while (i < buf.length && buf[i] & 128) {
        len |= (buf[i++] & 127) << shift;
        shift += 7;
      }
      if (i >= buf.length) break;
      len |= buf[i++] << shift;
      if (buf.length < i + len) break;
      this.#packet(buf[0] >> 4, buf.subarray(i, i + len));
      buf = buf.subarray(i + len);
    }
    this.buf = buf;
  }

  #packet(type, body) {
    if (type === 2) {
      // CONNACK → Thema abonnieren
      if (body[1] !== 0) return this.close();
      this.ws.send(packet(0x82, [0, 1], mqttStr(this.topic), [0]));
    } else if (type === 9) {
      // SUBACK → bereit
      if (body[2] > 2 || this.ready) return this.close();
      this.ready = true;
      clearTimeout(this.timer);
      this.ping = setInterval(() => {
        if (!this.pong) return this.close();
        this.pong = false;
        this.ws.send(packet(0xc0));
      }, 25000);
      this.on.open();
    } else if (type === 3) {
      // PUBLISH (QoS 0): Themenname überspringen, Rest ist der Inhalt
      this.on.message(body.subarray(2 + ((body[0] << 8) | body[1])));
    } else if (type === 13) {
      this.pong = true;
    }
  }

  publish(topic, payload) {
    if (this.ready && this.ws.readyState === 1) this.ws.send(packet(0x30, mqttStr(topic), payload));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.ping);
    const wasReady = this.ready;
    this.ready = false;
    try {
      this.ws?.close();
    } catch {
      /* egal */
    }
    this.on.close(wasReady);
  }
}

// ── Peer-Schnittstelle ──

class Handlers {
  constructor() {
    this.map = new Map();
  }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, []);
    this.map.get(ev).push(fn);
  }
  emit(ev, ...args) {
    // Zeitversetzt wie bei PeerJS, aber ohne Timer (die im Hintergrund-Tab gebremst würden).
    for (const fn of this.map.get(ev) || []) queueMicrotask(() => fn(...args));
  }
}

class RelayConnection extends Handlers {
  constructor(peer, connId, remoteId) {
    super();
    this.peer = peer;
    this.connId = connId;
    this.remoteId = remoteId;
    this.open = false;
    this.closed = false;
    this.serialization = 'raw';
    this.sent = 0; // Nummer der nächsten ausgehenden Nachricht
    this.next = 0; // Nummer der nächsten erwarteten Nachricht
    this.held = new Map(); // zu früh angekommene Nachrichten
  }
  send(data) {
    if (this.open) this.peer._send(this.remoteId, this.connId, 'data', data, this.sent++);
  }
  _data(n, d) {
    // Jede Nachricht kommt über jeden Dienst einmal an: Doppelte verwerfen.
    if (!Number.isInteger(n) || n < this.next || this.held.has(n)) return;
    this.held.set(n, d);
    while (this.held.has(this.next)) {
      this.emit('data', this.held.get(this.next));
      this.held.delete(this.next++);
    }
    // Lücke: kurz auf den langsameren Dienst warten. Bleibt sie, Verbindung neu aufbauen.
    if (!this.held.size) this.gap = clearTimeout(this.gap);
    else if (this.held.size > 100) this.close();
    else this.gap ||= setTimeout(() => this.close(), 3000);
  }
  close() {
    if (this.closed) return;
    this.peer._send(this.remoteId, this.connId, 'close');
    this._closed();
  }
  _closed() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    clearTimeout(this.timer);
    clearTimeout(this.gap);
    this.peer.conns.delete(this.connId);
    this.emit('close');
  }
}

const fail = (type) => Object.assign(new Error(type), { type });

export class RelayPeer extends Handlers {
  /** new RelayPeer(id?, { relays: [wss-Adressen], secret }) */
  constructor(id, options) {
    super();
    if (typeof id === 'object') [id, options] = [undefined, id];
    this.fixedId = !!id;
    this.id = id || 'g' + rid();
    this.relays = options?.relays || [];
    this.destroyed = false;
    this.disconnected = true;
    this.conns = new Map();
    this.links = []; // je Dienst eine Leitung (oder null)
    this.retry = [];
    this.out = Promise.resolve();
    this.inq = Promise.resolve();
    this.key = crypto.subtle
      .digest('SHA-256', enc.encode('radino-relay:' + options?.secret))
      .then((hash) => crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']));
    this.key.catch(() => {});
    this.#start();
  }

  async #start() {
    // Ein Raum darf nur in einem Tab dieses Browsers offen sein (sonst antworten zwei Hosts).
    if (this.fixedId && navigator.locks?.request) {
      const free = await new Promise((resolve) => {
        navigator.locks
          .request('radino-' + this.id, { ifAvailable: true }, (lock) => {
            resolve(!!lock);
            return lock && new Promise((release) => (this.unlock = release));
          })
          .catch(() => resolve(true));
      });
      if (!free) return this.emit('error', fail('unavailable-id'));
      if (this.destroyed) return this.unlock?.();
    }
    this.#connectAll();
  }

  #connectAll() {
    this.relays.forEach((_, i) => this.#link(i));
  }

  #link(i) {
    if (this.destroyed || this.links[i]) return;
    clearTimeout(this.retry[i]);
    this.links[i] = new MqttLink(this.relays[i], TOPIC + this.id, {
      open: () => {
        if (this.destroyed) return this.links[i]?.close();
        if (!this.disconnected) return;
        this.disconnected = false;
        this.emit('open', this.id);
      },
      message: (bytes) => this.#receive(bytes),
      close: () => {
        this.links[i] = null;
        if (this.destroyed) return;
        if (this.links.some(Boolean)) {
          // Andere Leitungen stehen oder bauen noch auf: diese im Hintergrund neu versuchen.
          this.retry[i] = setTimeout(() => this.#link(i), 5000);
          return;
        }
        // Keine Leitung mehr. Neu verbinden stößt PeerHost/PeerGuest an.
        this.retry.forEach(clearTimeout);
        if (this.disconnected) return this.emit('error', fail('network'));
        this.disconnected = true;
        // Unterwegs kann etwas verloren gegangen sein: Verbindungen sauber neu aufbauen lassen.
        for (const c of [...this.conns.values()]) c._closed();
        this.emit('disconnected');
      },
    });
  }

  _send(to, c, k, d, n) {
    this.out = this.out
      .then(async () => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const text = enc.encode(JSON.stringify({ f: this.id, c, k, d, n }));
        const secret = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key, text);
        const payload = concat(iv, new Uint8Array(secret));
        for (const link of this.links) link?.publish(TOPIC + to, payload);
      })
      .catch(() => {});
  }

  #receive(bytes) {
    // Der Reihe nach entschlüsseln; Fremdes oder Kaputtes wird still verworfen.
    this.inq = this.inq
      .then(async () => {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await this.key, bytes.subarray(12));
        this.#handle(JSON.parse(dec.decode(plain)));
      })
      .catch(() => {});
  }

  #handle(m) {
    if (this.destroyed || typeof m?.f !== 'string' || typeof m.c !== 'string') return;
    const conn = this.conns.get(m.c);
    if (m.k === 'connect') {
      if (conn) return;
      const c = new RelayConnection(this, m.c, m.f);
      c.open = true;
      this.conns.set(m.c, c);
      this._send(m.f, m.c, 'accept');
      this.emit('connection', c);
    } else if (m.k === 'accept') {
      if (!conn || conn.open) return;
      conn.open = true;
      clearTimeout(conn.timer);
      conn.emit('open');
    } else if (m.k === 'data') {
      // Unbekannte Verbindung (z. B. nach Neuladen): Gegenseite soll sich neu verbinden.
      if (conn) conn._data(m.n, m.d);
      else this._send(m.f, m.c, 'close');
    } else if (m.k === 'close') {
      conn?._closed();
    }
  }

  connect(remoteId) {
    const c = new RelayConnection(this, rid(), remoteId);
    this.conns.set(c.connId, c);
    this._send(remoteId, c.connId, 'connect');
    c.timer = setTimeout(() => {
      if (c.open || c.closed) return;
      this.conns.delete(c.connId);
      this.emit('error', fail('peer-unavailable'));
    }, 4000);
    return c;
  }

  reconnect() {
    if (!this.destroyed && this.disconnected) this.#connectAll();
  }

  destroy() {
    if (this.destroyed) return;
    for (const c of [...this.conns.values()]) c.close();
    this.destroyed = true;
    this.unlock?.();
    this.retry.forEach(clearTimeout);
    // Erst die Abschiedsnachrichten rausschicken, dann die Leitungen schließen.
    this.out.then(() => this.links.forEach((link) => link?.close()));
  }
}

export function installRelayPeer() {
  window.Peer = RelayPeer;
}
