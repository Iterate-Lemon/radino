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

const DEFAULT_SETTINGS = { mode: 'host', target: 10, editions: [], startAt: 0 };

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
    phase: 'lobby', // lobby | turn | reveal | ended
    settings: normalizeSettings(settings),
    players: [], // { id, name, host, connected, timeline: [songId] }
    order: [], // Zugreihenfolge (Spieler-IDs)
    turn: 0, // Index in order
    round: 0, // zählt jede gezogene Karte
    card: null, // { s, by, slot, locked, correct, round }
    deck: [],
    discard: [],
    winners: [],
    endReason: null, // target | deck | host
    log: [],
  };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const fail = (state, error) => ({ state, effects: [], error });

export function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

export function activePlayerId(state) {
  return state.phase === 'turn' || state.phase === 'reveal' || state.phase === 'ended'
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

function finish(s, reason, effects) {
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
  const active = s.phase === 'turn' || s.phase === 'reveal' ? s.card?.by : null;

  switch (action.type) {
    case 'addPlayer': {
      if (!sys) return fail(state, 'forbidden');
      if (playerById(s, action.id)) return fail(state, 'exists');
      if (s.players.length >= LIMITS.maxPlayers) return fail(state, 'full');
      const p = { id: action.id, name: cleanName(action.name), host: !!action.host, connected: true, timeline: [] };
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
        const wasActive = (s.phase === 'turn' || s.phase === 'reveal') && s.card?.by === p.id;
        if (idx < s.turn) s.turn -= 1;
        if (s.turn >= s.order.length) s.turn = 0;
        if (wasActive) {
          if (s.phase === 'turn') s.discard.push(s.card.s);
          // s.turn zeigt nach dem Entfernen bereits auf den nächsten Spieler.
          if (s.order.length && !playerById(s, s.order[s.turn])?.connected) advance(s);
          beginTurn(s, effects);
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
      const p = playerById(s, by);
      const years = p.timeline.map(ctx.yearOf);
      const ok = slotIsCorrect(years, s.card.slot, ctx.yearOf(s.card.s));
      s.card.locked = true;
      s.card.correct = ok;
      if (ok) p.timeline.splice(s.card.slot, 0, s.card.s);
      else s.discard.push(s.card.s);
      addLog(s, { k: 'placed', p: p.id, s: s.card.s, ok });
      s.phase = 'reveal';
      if (ok && p.timeline.length >= s.settings.target) {
        s.winners = [p.id];
        finish(s, 'target', effects);
      }
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
      for (const p of s.players) p.timeline = [];
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
    })),
    order: state.order.slice(),
    activeId: state.phase === 'turn' || state.phase === 'reveal' || (state.phase === 'ended' && card) ? card?.by ?? null : null,
    round: state.round,
    card: cardView,
    deckLeft: state.deck.length,
    winners: state.winners.slice(),
    endReason: state.endReason,
    log: state.log.map((e) => (e.s && (e.k === 'placed' || e.k === 'skipped') ? { ...e, song: ctx.info(e.s) } : { ...e })),
  };
}
