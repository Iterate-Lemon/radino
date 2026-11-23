// Nur für Entwicklung/Tests: gleiche Schnittstelle wie src/net/relay-peer.js, aber
// über BroadcastChannel zwischen Tabs DESSELBEN Browsers (ganz ohne Netzwerk).
// Aktivieren mit ?fakenet in der Adresse. Nützlich, um mehrere Spieler in
// mehreren Tabs zu simulieren (z. B. für Oberflächen-Arbeit).

const CHANNEL = 'radino-fakenet';
const rid = () => Math.random().toString(36).slice(2, 12);

class Handlers {
  constructor() {
    this.map = new Map();
  }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, []);
    this.map.get(ev).push(fn);
  }
  emit(ev, ...args) {
    for (const fn of this.map.get(ev) || []) setTimeout(() => fn(...args), 0);
  }
}

class FakeConnection extends Handlers {
  constructor(peer, connId, remoteId) {
    super();
    this.peer = peer;
    this.connId = connId;
    this.peerId = remoteId;
    this.open = false;
    this.serialization = 'raw';
  }
  send(data) {
    if (!this.open) return;
    this.peer.bc.postMessage({ type: 'data', to: this.peerId, connId: this.connId, data });
  }
  close() {
    if (!this.open && this.closed) return;
    this.closed = true;
    this.open = false;
    this.peer.bc.postMessage({ type: 'close', to: this.peerId, connId: this.connId });
    this.peer.conns.delete(this.connId);
    this.emit('close');
  }
  _remoteClosed() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.peer.conns.delete(this.connId);
    this.emit('close');
  }
}

export class FakePeer extends Handlers {
  constructor(id, options) {
    super();
    if (typeof id === 'object') id = undefined;
    this.id = id || 'fake-' + rid();
    this.destroyed = false;
    this.disconnected = false;
    this.conns = new Map();
    (FakePeer.instances ||= new Set()).add(this);
    this.bc = new BroadcastChannel(CHANNEL);
    this.bc.onmessage = (e) => this._onMessage(e.data);
    this.taken = false;
    this.bc.postMessage({ type: 'claim', id: this.id, nonce: (this.nonce = rid()) });
    setTimeout(() => {
      if (this.destroyed) return;
      if (this.taken) this.emit('error', Object.assign(new Error('ID taken'), { type: 'unavailable-id' }));
      else this.emit('open', this.id);
    }, 150);
  }

  _onMessage(m) {
    if (this.destroyed) return;
    if (m.type === 'claim') {
      if (m.id === this.id && m.nonce !== this.nonce) this.bc.postMessage({ type: 'taken', id: m.id, nonce: m.nonce });
      return;
    }
    if (m.type === 'taken' && m.id === this.id && m.nonce === this.nonce) {
      this.taken = true;
      return;
    }
    if (m.to !== this.id) return;
    if (m.type === 'connect') {
      const c = new FakeConnection(this, m.connId, m.from);
      this.conns.set(m.connId, c);
      c.open = true;
      this.bc.postMessage({ type: 'accept', to: m.from, connId: m.connId });
      this.emit('connection', c);
      setTimeout(() => c.emit('open'), 20);
    } else if (m.type === 'accept') {
      const c = this.conns.get(m.connId);
      if (c && !c.open) {
        c.open = true;
        clearTimeout(c.timer);
        c.emit('open');
      }
    } else if (m.type === 'data') {
      this.conns.get(m.connId)?.emit('data', m.data);
    } else if (m.type === 'close') {
      this.conns.get(m.connId)?._remoteClosed();
    }
  }

  connect(remoteId) {
    const connId = rid();
    const c = new FakeConnection(this, connId, remoteId);
    this.conns.set(connId, c);
    this.bc.postMessage({ type: 'connect', to: remoteId, from: this.id, connId });
    c.timer = setTimeout(() => {
      if (!c.open) {
        this.conns.delete(connId);
        this.emit('error', Object.assign(new Error('Peer unavailable'), { type: 'peer-unavailable' }));
      }
    }, 2500);
    return c;
  }

  reconnect() {
    this.disconnected = false;
  }

  destroy() {
    if (this.destroyed) return;
    for (const c of [...this.conns.values()]) c.close();
    this.destroyed = true;
    setTimeout(() => this.bc.close(), 50);
  }
}

export function installFakePeer() {
  window.Peer = FakePeer;
  window.addEventListener('pagehide', () => {
    // Beim Schließen/Neuladen Verbindungen sauber beenden (wie ein Abbruch).
    for (const p of FakePeer.instances || []) p.destroy();
  });
  console.info('RaDino: Entwickler-Netz (fakenet) aktiv – nur Tabs dieses Browsers können sich verbinden.');
}
