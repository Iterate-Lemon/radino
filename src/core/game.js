// Spielzustand und Spielzüge als reine Funktion (Reducer).
//
// Der Host hält den vollständigen Zustand. reduce() prüft jede Aktion
// (Phase, Berechtigung, Werte) und liefert einen neuen Zustand plus
// "Effekte" (z. B. Song abspielen), die die App-Schicht ausführt.
// Spieler sehen nur publicView(): darin fehlt der verdeckte Song.
//
// ctx = { yearOf(songId) -> number, info(songId) -> {t,a,y,img}, rng() -> [0,1) }

import { slotIsCorrect, correctSlots, shuffle } from './rules.js';

export const MODES = ['host', 'everyone', 'test'];
export const LIMITS = { minTarget: 2, maxTarget: 30, maxPlayers: 12, nameLength: 24, logLength: 30 };
export const START_OFFSETS = [0, 30, 60];
// Optionale Regel "Marken": Startzahl, Obergrenze je Spieler, Dauer der
// Anzweifel-Phase und Länge des Marken-Protokolls. Bewusst nicht einstellbar.
export const TOKENS = { start: 2, max: 5, challengeMs: 20000, logLength: 500 };

const DEFAULT_SETTINGS = { mode: 'host', target: 10, editions: [], startAt: 0, tokens: false };

export function normalizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const s = { ...base };
  if (MODES.includes(input.mode)) s.mode = input.mode;
  if (Number.isInteger(input.target)) {
    s.target = Math.min(LIMITS.maxTarget, Math.max(LIMITS.minTarget, input.target));
  }
  if (Array.isArray(input.editions)) {
    s.editions = [...new Set(input.editions.filter((e) => typeof e === 'string' && e.length <= 32))].slice(0, 64);
  }
  if (START_OFFSETS.includes(input.startAt)) s.startAt = input.startAt;
  if (typeof input.tokens === 'boolean') s.tokens = input.tokens;
  s.tokens = !!s.tokens;
  return s;
}

export function cleanName(name) {
  const n = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.nameLength);
  return n || 'Spieler';
}

export function createGame(settings = {}) {
  return {
    v: 1,
    phase: 'lobby', // lobby | turn | challenge | reveal | ended
    settings: normalizeSettings(settings),
    players: [], // { id, name, host, connected, timeline: [songId], tokens }
    order: [], // Zugreihenfolge (Spieler-IDs)
    turn: 0, // Index in order
    round: 0, // zählt jede gezogene Karte
    // { s, by, slot, locked, correct, round } – mit Marken zusätzlich:
    // fixed (Lücke festgelegt, noch verdeckt), challenge { until, picks: [{ p, slot }], passed: [id] },
    // wonBy (Anzweifler, der die Karte bekam), grant ({ by } – in diesem Zug vergebene Marke)
    card: null,
    deck: [],
    discard: [],
    winners: [],
    endReason: null, // target | deck | host
    log: [],
    tokenLog: [], // Marken-Protokoll fürs ganze Spiel: { r, k, p, name, by?, byName?, won?, n }
  };
}

/** Ergänzt Felder, die gespeicherten Spielen aus älteren Versionen fehlen. */
export function upgradeGame(state) {
  if (!state || typeof state !== 'object') return state;
  state.settings = normalizeSettings(state.settings || {}, { ...DEFAULT_SETTINGS, ...(state.settings || {}) });
  for (const p of state.players || []) if (!Number.isInteger(p.tokens)) p.tokens = TOKENS.start;
  if (!Array.isArray(state.tokenLog)) state.tokenLog = [];
  return state;
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const fail = (state, error) => ({ state, effects: [], error });

export function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

export function activePlayerId(state) {
  return state.phase === 'turn' || state.phase === 'challenge' || state.phase === 'reveal' || state.phase === 'ended'
    ? state.card?.by ?? state.order[state.turn] ?? null
    : null;
}

function isHost(state, id) {
  return !!playerById(state, id)?.host;
}

function addLog(s, entry) {
  s.log.push(entry);
  if (s.log.length > LIMITS.logLength) s.log.splice(0, s.log.length - LIMITS.logLength);
}

function addTokenLog(s, entry) {
  s.tokenLog.push(entry);
  if (s.tokenLog.length > TOKENS.logLength) s.tokenLog.splice(0, s.tokenLog.length - TOKENS.logLength);
}

// Eingesetzte Marken dieser Runde, deren Ausgang noch offen ist, haben nichts gebracht.
function closeSpent(s) {
  for (const e of s.tokenLog) if (e.k === 'spent' && e.won === null) e.won = false;
}

/** Lücken, die in der Anzweifel-Phase noch frei sind. */
export function freeChallengeSlots(state) {
  const card = state.card;
  if (state.phase !== 'challenge' || !card?.challenge) return [];
  const n = playerById(state, card.by)?.timeline.length ?? 0;
  const taken = new Set([card.slot, ...card.challenge.picks.map((c) => c.slot)]);
  const out = [];
  for (let i = 0; i <= n; i++) if (!taken.has(i)) out.push(i);
  return out;
}

/** Wer in der Anzweifel-Phase noch anzweifeln oder passen kann. */
export function pendingChallengers(state) {
  const card = state.card;
  if (state.phase !== 'challenge' || !card?.challenge) return [];
  if (!freeChallengeSlots(state).length) return [];
  const ch = card.challenge;
  return state.players
    .filter((p) => p.id !== card.by && p.connected && p.tokens >= 1)
    .filter((p) => !ch.passed.includes(p.id) && !ch.picks.some((c) => c.p === p.id))
    .map((p) => p.id);
}

// Aufdecken: Karte auswerten und verteilen. Ohne Marken gibt es keine Anzweifler.
function resolveCard(s, ctx, effects) {
  const card = s.card;
  const p = playerById(s, card.by);
  const years = p.timeline.map(ctx.yearOf);
  const year = ctx.yearOf(card.s);
  const ok = slotIsCorrect(years, card.slot, year);
  let thief = null;
  if (!ok && card.challenge) {
    // Reihenfolge von picks = Reihenfolge des Anzweifelns: der Erste gewinnt.
    const hit = card.challenge.picks.find((c) => slotIsCorrect(years, c.slot, year) && playerById(s, c.p));
    if (hit) thief = playerById(s, hit.p);
  }
  card.locked = true;
  card.correct = ok;
  if (s.settings.tokens) {
    card.wonBy = thief ? thief.id : null;
    card.grant = null;
    for (const e of s.tokenLog) if (e.k === 'spent' && e.won === null) e.won = !!thief && e.p === thief.id;
  }
  if (ok) p.timeline.splice(card.slot, 0, card.s);
  else if (thief) thief.timeline = sortTimeline([...thief.timeline, card.s], ctx);
  else s.discard.push(card.s);
  addLog(s, { k: 'placed', p: p.id, s: card.s, ok });
  if (thief) addLog(s, { k: 'stolen', p: thief.id, from: p.id, s: card.s });
  s.phase = 'reveal';
  const winner = ok ? p : thief;
  if (winner && winner.timeline.length >= s.settings.target) {
    s.winners = [winner.id];
    finish(s, 'target', effects);
  }
}

// Anzweifel-Phase beenden, sobald niemand mehr aussteht.
function settleChallenge(s, ctx, effects) {
  if (s.phase === 'challenge' && !pendingChallengers(s).length) resolveCard(s, ctx, effects);
}

function finish(s, reason, effects) {
  closeSpent(s);
  s.phase = 'ended';
  s.endReason = reason;
  if (reason !== 'target') {
    const max = Math.max(0, ...s.players.map((p) => p.timeline.length));
    s.winners = s.players.filter((p) => p.timeline.length === max && max > 0).map((p) => p.id);
  }
  if (reason === 'host') effects.push({ type: 'stop' });
}

function beginTurn(s, effects) {
  if (!s.order.length) {
    finish(s, 'deck', effects);
    return;
  }
  if (!s.deck.length) {
    finish(s, 'deck', effects);
    return;
  }
  const by = s.order[s.turn];
  const songId = s.deck.shift();
  s.round += 1;
  s.card = { s: songId, by, slot: null, locked: false, correct: null, round: s.round };
  s.phase = 'turn';
  effects.push({ type: 'play', songId, round: s.round });
}

// Nächster verbundener Spieler in der Reihenfolge (getrennte werden übersprungen).
function advance(s) {
  const n = s.order.length;
  if (!n) return;
  for (let i = 1; i <= n; i++) {
    const idx = (s.turn + i) % n;
    if (playerById(s, s.order[idx])?.connected) {
      s.turn = idx;
      return;
    }
  }
  s.turn = (s.turn + 1) % n;
}

function sortTimeline(timeline, ctx) {
  return timeline.slice().sort((a, b) => ctx.yearOf(a) - ctx.yearOf(b));
}

function dealStartCard(s, player, ctx) {
  if (!s.deck.length) return;
  player.timeline = sortTimeline([s.deck.shift()], ctx);
}

/**
 * Wendet eine Aktion an. action = { type, by, ...daten }.
 * by = Spieler-ID des Auslösers oder 'system' (App-Schicht des Hosts).
 */
export function reduce(state, action, ctx) {
  if (!action || typeof action.type !== 'string') return fail(state, 'invalid');
  const s = clone(state);
  const effects = [];
  const by = action.by;
  const sys = by === 'system';
  const host = sys || isHost(s, by);
  const active = s.phase === 'turn' || s.phase === 'challenge' || s.phase === 'reveal' ? s.card?.by : null;

  switch (action.type) {
    case 'addPlayer': {
      if (!sys) return fail(state, 'forbidden');
      if (playerById(s, action.id)) return fail(state, 'exists');
      if (s.players.length >= LIMITS.maxPlayers) return fail(state, 'full');
      const p = { id: action.id, name: cleanName(action.name), host: !!action.host, connected: true, timeline: [], tokens: TOKENS.start };
      if (p.host && s.players.some((x) => x.host)) return fail(state, 'forbidden');
      s.players.push(p);
      if (s.phase !== 'lobby') {
        // Später Beitritt: hinten in die Reihenfolge, mit Startkarte.
        s.order.push(p.id);
        dealStartCard(s, p, ctx);
      }
      addLog(s, { k: 'joined', p: p.id });
      break;
    }

    case 'setConnected': {
      if (!sys) return fail(state, 'forbidden');
      const p = playerById(s, action.id);
      if (!p) return fail(state, 'unknown');
      p.connected = !!action.connected;
      if (!p.connected && s.phase === 'challenge' && p.id !== s.card.by) {
        // Wer in der Anzweifel-Phase die Verbindung verliert, gilt als gepasst.
        const ch = s.card.challenge;
        if (!ch.passed.includes(p.id) && !ch.picks.some((c) => c.p === p.id)) ch.passed.push(p.id);
        settleChallenge(s, ctx, effects);
      }
      break;
    }

    case 'rename': {
      const p = playerById(s, action.id);
      if (!p || !(sys || by === action.id)) return fail(state, 'forbidden');
      p.name = cleanName(action.name);
      break;
    }

    case 'removePlayer': {
      if (!host) return fail(state, 'forbidden');
      const p = playerById(s, action.id);
      if (!p || p.host) return fail(state, 'forbidden');
      s.players = s.players.filter((x) => x.id !== p.id);
      const idx = s.order.indexOf(p.id);
      if (idx >= 0) {
        s.order.splice(idx, 1);
        const wasActive = (s.phase === 'turn' || s.phase === 'challenge' || s.phase === 'reveal') && s.card?.by === p.id;
        if (idx < s.turn) s.turn -= 1;
        if (s.turn >= s.order.length) s.turn = 0;
        if (wasActive) {
          if (s.phase !== 'reveal') s.discard.push(s.card.s);
          closeSpent(s); // eingesetzte Marken sind weg, die Karte wird nicht aufgedeckt
          // s.turn zeigt nach dem Entfernen bereits auf den nächsten Spieler.
          if (s.order.length && !playerById(s, s.order[s.turn])?.connected) advance(s);
          beginTurn(s, effects);
        } else if (s.phase === 'challenge') {
          const ch = s.card.challenge;
          ch.picks = ch.picks.filter((c) => c.p !== p.id);
          ch.passed = ch.passed.filter((id) => id !== p.id);
          for (const e of s.tokenLog) if (e.k === 'spent' && e.won === null && e.p === p.id) e.won = false;
          settleChallenge(s, ctx, effects);
        }
      }
      addLog(s, { k: 'left', name: p.name });
      break;
    }

    case 'settings': {
      if (!host || s.phase !== 'lobby') return fail(state, 'forbidden');
      s.settings = normalizeSettings(action.settings, s.settings);
      break;
    }

    case 'start': {
      if (!host || s.phase !== 'lobby') return fail(state, 'forbidden');
      if (!s.players.length) return fail(state, 'no-players');
      const deck = Array.isArray(action.deck) ? [...new Set(action.deck)] : [];
      if (deck.length < s.players.length + 1) return fail(state, 'deck-too-small');
      s.deck = deck;
      s.discard = [];
      s.winners = [];
      s.endReason = null;
      s.log = [];
      s.tokenLog = [];
      for (const p of s.players) p.tokens = TOKENS.start;
      s.order = shuffle(s.players.map((p) => p.id), ctx.rng);
      for (const p of s.players) dealStartCard(s, p, ctx);
      s.turn = 0;
      if (!playerById(s, s.order[0])?.connected) advance(s);
      beginTurn(s, effects);
      break;
    }

    case 'select': {
      if (s.phase !== 'turn' || by !== active || s.card.locked) return fail(state, 'forbidden');
      const p = playerById(s, by);
      const slot = action.slot;
      if (slot !== null && !(Number.isInteger(slot) && slot >= 0 && slot <= p.timeline.length)) {
        return fail(state, 'invalid');
      }
      s.card.slot = slot;
      break;
    }

    case 'lock': {
      if (s.phase !== 'turn' || by !== active || s.card.locked) return fail(state, 'forbidden');
      if (s.card.slot === null) return fail(state, 'no-slot');
      if (s.settings.tokens) {
        // Noch nicht aufdecken: erst dürfen die anderen anzweifeln.
        const now = Number.isFinite(action.now) ? action.now : null;
        s.card.fixed = true;
        s.card.challenge = { until: now === null ? null : now + TOKENS.challengeMs, picks: [], passed: [] };
        s.phase = 'challenge';
        settleChallenge(s, ctx, effects);
        break;
      }
      resolveCard(s, ctx, effects);
      break;
    }

    case 'challenge': {
      if (s.phase !== 'challenge' || !pendingChallengers(s).includes(by)) return fail(state, 'forbidden');
      if (!Number.isInteger(action.slot)) return fail(state, 'invalid');
      if (!freeChallengeSlots(s).includes(action.slot)) return fail(state, 'taken');
      const p = playerById(s, by);
      p.tokens -= 1;
      s.card.challenge.picks.push({ p: by, slot: action.slot });
      addTokenLog(s, { r: s.card.round, k: 'spent', p: by, name: p.name, won: null, n: p.tokens });
      settleChallenge(s, ctx, effects);
      break;
    }

    case 'pass': {
      if (s.phase !== 'challenge' || !pendingChallengers(s).includes(by)) return fail(state, 'forbidden');
      s.card.challenge.passed.push(by);
      settleChallenge(s, ctx, effects);
      break;
    }

    case 'endChallenge': {
      // Host beendet die Phase, oder das Zeitlimit ist abgelaufen (by: 'system').
      if (s.phase !== 'challenge' || !host) return fail(state, 'forbidden');
      if (action.round !== undefined && action.round !== s.card.round) return fail(state, 'stale');
      resolveCard(s, ctx, effects);
      break;
    }

    case 'giveToken': {
      // Ein Mitspieler bestätigt: Titel und Interpret wurden richtig genannt.
      const giver = playerById(s, by);
      const p = playerById(s, active);
      if (!s.settings.tokens || s.phase !== 'reveal' || !giver || !p || by === active) return fail(state, 'forbidden');
      if (s.card.grant) return fail(state, 'already');
      if (p.tokens >= TOKENS.max) return fail(state, 'max');
      p.tokens += 1;
      s.card.grant = { by };
      addTokenLog(s, { r: s.card.round, k: 'got', p: p.id, name: p.name, by, byName: giver.name, n: p.tokens });
      addLog(s, { k: 'token', p: p.id, by });
      break;
    }

    case 'revokeToken': {
      if (!s.settings.tokens || s.phase !== 'reveal' || !host || !s.card.grant) return fail(state, 'forbidden');
      const p = playerById(s, active);
      if (!p) return fail(state, 'forbidden');
      p.tokens = Math.max(0, p.tokens - 1);
      s.card.grant = null;
      const byName = sys ? 'Host' : playerById(s, by).name;
      addTokenLog(s, { r: s.card.round, k: 'revoked', p: p.id, name: p.name, by: sys ? null : by, byName, n: p.tokens });
      addLog(s, { k: 'tokenRevoked', p: p.id, by: sys ? null : by });
      break;
    }

    case 'next': {
      if (s.phase !== 'reveal' || !(by === active || host)) return fail(state, 'forbidden');
      advance(s);
      beginTurn(s, effects);
      break;
    }

    case 'skipSong': {
      // Song nicht verfügbar o. Ä.: neue Karte, derselbe Spieler bleibt dran.
      if (s.phase !== 'turn' || s.card.locked || !(by === active || host)) return fail(state, 'forbidden');
      if (action.round !== undefined && action.round !== s.card.round) return fail(state, 'stale');
      s.discard.push(s.card.s);
      addLog(s, { k: 'skipped', p: s.card.by, s: s.card.s, reason: action.reason === 'unavailable' ? 'unavailable' : 'manual' });
      beginTurn(s, effects);
      break;
    }

    case 'skipTurn': {
      if (s.phase !== 'turn' || !host) return fail(state, 'forbidden');
      s.discard.push(s.card.s);
      addLog(s, { k: 'turnSkipped', p: s.card.by });
      advance(s);
      beginTurn(s, effects);
      break;
    }

    case 'endGame': {
      if (!host || s.phase === 'lobby' || s.phase === 'ended') return fail(state, 'forbidden');
      finish(s, 'host', effects);
      break;
    }

    case 'reset': {
      if (!host) return fail(state, 'forbidden');
      s.phase = 'lobby';
      s.card = null;
      s.deck = [];
      s.discard = [];
      s.order = [];
      s.turn = 0;
      s.winners = [];
      s.endReason = null;
      s.log = [];
      s.tokenLog = [];
      for (const p of s.players) {
        p.timeline = [];
        p.tokens = TOKENS.start;
      }
      effects.push({ type: 'stop' });
      break;
    }

    default:
      return fail(state, 'unknown-action');
  }
  return { state: s, effects, error: null };
}

/** Sicht für alle Spieler (auch den Host selbst): ohne Stapel und ohne verdeckten Song. */
export function publicView(state, ctx) {
  const card = state.card;
  const showSong = card && card.locked;
  let cardView = null;
  if (card && state.phase !== 'lobby') {
    cardView = { by: card.by, slot: card.slot, locked: card.locked, correct: card.correct, round: card.round };
    if (showSong) {
      const by = playerById(state, card.by);
      const years = (by?.timeline || []).filter((id) => id !== card.s || !card.correct).map(ctx.yearOf);
      cardView.song = { id: card.s, ...ctx.info(card.s) };
      cardView.correctSlots = correctSlots(years, ctx.yearOf(card.s));
    }
    if (state.settings.tokens) {
      const ch = card.challenge;
      cardView.fixed = !!card.fixed;
      cardView.wonBy = card.wonBy ?? null;
      cardView.grant = card.grant ? { by: card.grant.by } : null;
      cardView.challenge = ch
        ? {
            until: ch.until, // Uhr des Hosts (ms); app.js rechnet für die Oberfläche um
            picks: ch.picks.map((c) => ({ p: c.p, slot: c.slot })),
            passed: ch.passed.slice(),
            pending: pendingChallengers(state),
            freeSlots: freeChallengeSlots(state),
          }
        : null;
    }
  }
  return {
    phase: state.phase,
    settings: { ...state.settings },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      host: p.host,
      connected: p.connected,
      timeline: p.timeline.map((id) => ({ id, ...ctx.info(id) })),
      tokens: p.tokens ?? TOKENS.start,
    })),
    order: state.order.slice(),
    activeId: state.phase === 'turn' || state.phase === 'challenge' || state.phase === 'reveal' || (state.phase === 'ended' && card) ? card?.by ?? null : null,
    round: state.round,
    card: cardView,
    deckLeft: state.deck.length,
    winners: state.winners.slice(),
    endReason: state.endReason,
    log: state.log.map((e) => (e.s && (e.k === 'placed' || e.k === 'skipped' || e.k === 'stolen') ? { ...e, song: ctx.info(e.s) } : { ...e })),
    tokenLog: (state.tokenLog || []).map((e) => ({ ...e })),
  };
}
