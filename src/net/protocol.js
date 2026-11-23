// Nachrichtenformat zwischen Host und Gästen (JSON-Strings, übertragen von relay-peer.js).
// Alles, was von außen kommt, wird hier streng geprüft. Ungültiges wird verworfen.

export const PROTOCOL_VERSION = 1;
export const MAX_GUEST_MESSAGE = 2048; // Zeichen
export const MAX_HOST_MESSAGE = 512 * 1024;

const B32 = /^[a-z2-7]+$/;
export const isCode = (x, len) => typeof x === 'string' && x.length === len && B32.test(x);
export const ID_LEN = 26; // 130 Bit Zufall
export const PID_RE = /^p[a-z2-7]{12}$/;
export const TRACK_RE = /^[0-9A-Za-z]{22}$/;

const int = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
const str = (x, max) => typeof x === 'string' && x.length <= max;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);

export const GUEST_ACTIONS = ['select', 'lock', 'next', 'skipSong', 'challenge', 'pass', 'giveToken'];
export const AUDIO_STATES = ['off', 'login', 'connecting', 'ready', 'error'];

function parse(raw, max) {
  if (typeof raw !== 'string' || raw.length > max) return null;
  try {
    const m = JSON.parse(raw);
    return m && typeof m === 'object' && !Array.isArray(m) && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}

/** Prüft eine Nachricht eines Gastes. Gibt ein bereinigtes Objekt oder null zurück. */
export function parseGuestMessage(raw) {
  const m = parse(raw, MAX_GUEST_MESSAGE);
  if (!m) return null;
  switch (m.t) {
    case 'hello':
      if (m.v !== PROTOCOL_VERSION || !isCode(m.key, ID_LEN) || !str(m.name, 64)) return null;
      if (m.pid !== undefined && !(typeof m.pid === 'string' && PID_RE.test(m.pid))) return null;
      if (m.token !== undefined && !isCode(m.token, ID_LEN)) return null;
      return { t: 'hello', key: m.key, name: m.name, pid: m.pid, token: m.token };
    case 'act': {
      if (!GUEST_ACTIONS.includes(m.a)) return null;
      const out = { t: 'act', a: m.a };
      if (m.a === 'select') {
        if (!(m.slot === null || int(m.slot, 0, 100))) return null;
        out.slot = m.slot;
      }
      if (m.a === 'challenge') {
        if (!int(m.slot, 0, 100)) return null;
        out.slot = m.slot;
      }
      if (m.round !== undefined) {
        if (!int(m.round, 0, 1e7)) return null;
        out.round = m.round;
      }
      return out;
    }
    case 'ctl':
      return m.c === 'replay' || m.c === 'stop' ? { t: 'ctl', c: m.c } : null;
    case 'time':
      return finite(m.c) ? { t: 'time', c: m.c } : null;
    case 'audio-ack':
      if (!int(m.seq, 0, 1e9) || typeof m.ok !== 'boolean') return null;
      return { t: 'audio-ack', seq: m.seq, ok: m.ok, reason: str(m.reason, 40) ? m.reason : undefined };
    case 'audio-state':
      if (!AUDIO_STATES.includes(m.s)) return null;
      return { t: 'audio-state', s: m.s, msg: str(m.msg, 120) ? m.msg : undefined };
    case 'rename':
      return str(m.name, 64) ? { t: 'rename', name: m.name } : null;
    case 'bye':
      return { t: 'bye' };
    default:
      return null;
  }
}

/** Prüft eine Nachricht des Hosts (beim Gast). */
export function parseHostMessage(raw) {
  const m = parse(raw, MAX_HOST_MESSAGE);
  if (!m) return null;
  switch (m.t) {
    case 'welcome':
      if (!(typeof m.pid === 'string' && PID_RE.test(m.pid)) || !isCode(m.token, ID_LEN)) return null;
      return { t: 'welcome', pid: m.pid, token: m.token };
    case 'reject':
      return { t: 'reject', reason: str(m.reason, 40) ? m.reason : 'unknown' };
    case 'kicked':
      return { t: 'kicked' };
    case 'state':
      return m.view && typeof m.view === 'object' ? { t: 'state', view: m.view } : null;
    case 'time':
      return finite(m.c) && finite(m.h) ? { t: 'time', c: m.c, h: m.h } : null;
    case 'audio':
      if (m.c === 'prepare') {
        if (!int(m.seq, 0, 1e9) || !TRACK_RE.test(m.track || '') || !int(m.pos, 0, 3600000)) return null;
        return { t: 'audio', c: 'prepare', seq: m.seq, track: m.track, pos: m.pos };
      }
      if (m.c === 'start') return int(m.seq, 0, 1e9) && finite(m.at) ? { t: 'audio', c: 'start', seq: m.seq, at: m.at } : null;
      if (m.c === 'stop') return { t: 'audio', c: 'stop' };
      return null;
    default:
      return null;
  }
}

/** Vergleich ohne frühen Abbruch (gegen Timing-Angriffe auf den Beitrittsschlüssel). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Raum-Link-Teil (#join=...) zerlegen: "<raumId>-<schlüssel>" */
export function parseInvite(hash) {
  const m = /^#join=([a-z2-7]{26})-([a-z2-7]{26})$/.exec(hash || '');
  return m ? { roomId: m[1], key: m[2] } : null;
}

export function makeInviteHash(roomId, key) {
  return `#join=${roomId}-${key}`;
}

export const hostPeerId = (roomId) => `radino-${roomId}`;
