// Kleine Hilfsfunktionen für den Browser (Zufall, Speicher, Ereignisse, Zeit).

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** Kryptografisch sicherer Zufallscode aus Base32-Zeichen (5 Bit je Zeichen). */
export function randomCode(len = 26) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += B32[bytes[i] & 31];
  return out;
}

/** Zufall in [0,1) aus crypto (für Mischen des Stapels). */
export function cryptoRng() {
  const a = crypto.getRandomValues(new Uint32Array(1));
  return a[0] / 4294967296;
}

export const now = () => performance.timeOrigin + performance.now();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Emitter {
  #handlers = new Map();
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event)?.delete(fn);
  }
  emit(event, ...args) {
    for (const fn of this.#handlers.get(event) || []) {
      try {
        fn(...args);
      } catch (e) {
        console.error(`Fehler im Handler für "${event}"`, e);
      }
    }
  }
}

function store(kind) {
  const get = () => {
    try {
      return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    read(key, fallback = null) {
      try {
        const raw = get()?.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        get()?.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        get()?.removeItem(key);
      } catch {
        /* egal */
      }
    },
  };
}

export const local = store('local');
export const session = store('session');
