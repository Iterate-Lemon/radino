import { test, eq, ok, seededRng } from './harness.js';
import { slotIsCorrect, correctSlots } from '../src/core/rules.js';
import { createGame, reduce, publicView, cleanName } from '../src/core/game.js';

// Testsongs: id -> Jahr
const YEARS = { a: 1970, b: 1980, c: 1990, d: 2000, e: 2010, f: 1980, g: 1965, h: 2020, i: 1975, j: 1999 };
const ctx = {
  yearOf: (id) => YEARS[id],
  info: (id) => ({ t: 'T' + id, a: 'A' + id, y: YEARS[id] }),
  rng: seededRng(1),
};

function apply(state, action) {
  const r = reduce(state, action, ctx);
  if (r.error) throw new Error(`Aktion ${action.type} abgelehnt: ${r.error}`);
  return r;
}

function twoPlayerGame(deck = ['a', 'c', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
  let s = createGame({ target: 3 });
  s = apply(s, { type: 'addPlayer', by: 'system', id: 'H', name: 'Host', host: true }).state;
  s = apply(s, { type: 'addPlayer', by: 'system', id: 'G', name: 'Gast' }).state;
  const r = apply(s, { type: 'start', by: 'H', deck });
  return r;
}

test('Regel: Lücken mit Grenzen und gleichen Jahren', () => {
  const years = [1970, 1980, 1990];
  ok(slotIsCorrect(years, 0, 1960));
  ok(!slotIsCorrect(years, 1, 1960));
  ok(slotIsCorrect(years, 1, 1980), 'gleiches Jahr links');
  ok(slotIsCorrect(years, 2, 1980), 'gleiches Jahr rechts');
  ok(slotIsCorrect(years, 3, 2000));
  ok(!slotIsCorrect(years, 4, 2000), 'Lücke außerhalb');
  ok(!slotIsCorrect(years, 1.5, 1975), 'keine Ganzzahl');
  ok(slotIsCorrect([], 0, 1999), 'leere Zeitleiste');
  eq(correctSlots(years, 1980), [1, 2]);
});

test('Start: Startkarten, Reihenfolge, erster Zug spielt Song', () => {
  const { state: s, effects } = twoPlayerGame();
  eq(s.phase, 'turn');
  eq(s.players.map((p) => p.timeline.length), [1, 1]);
  eq(s.order.length, 2);
  eq(effects, [{ type: 'play', songId: s.card.s, round: 1 }]);
  eq(s.deck.length, 10 - 3);
});

test('Nur der aktive Spieler darf legen', () => {
  const { state: s } = twoPlayerGame();
  const other = s.order[1];
  eq(reduce(s, { type: 'select', by: other, slot: 0 }, ctx).error, 'forbidden');
  eq(reduce(s, { type: 'lock', by: s.order[0] }, ctx).error, 'no-slot');
  eq(reduce(s, { type: 'select', by: s.order[0], slot: 5 }, ctx).error, 'invalid');
});

test('Richtig gelegt: Karte bleibt, falsch: Karte weg', () => {
  let { state: s } = twoPlayerGame();
  const pid = s.order[0];
  const p = s.players.find((x) => x.id === pid);
  const y = YEARS[s.card.s];
  const right = YEARS[p.timeline[0]] <= y ? 1 : 0;
  s = apply(s, { type: 'select', by: pid, slot: right }).state;
  s = apply(s, { type: 'lock', by: pid }).state;
  eq(s.phase, 'reveal');
  eq(s.card.correct, true);
  eq(s.players.find((x) => x.id === pid).timeline.length, 2);
  // Zeitleiste bleibt sortiert
  const years = s.players.find((x) => x.id === pid).timeline.map((id) => YEARS[id]);
  eq(years, years.slice().sort((a, b) => a - b));

  s = apply(s, { type: 'next', by: pid }).state;
  const pid2 = s.order[1];
  eq(s.card.by, pid2);
  const p2 = s.players.find((x) => x.id === pid2);
  const y2 = YEARS[s.card.s];
  const wrong = YEARS[p2.timeline[0]] <= y2 ? 0 : 1;
  // Bei gleichem Jahr wäre beides richtig – das Testdeck vermeidet das an dieser Stelle.
  s = apply(s, { type: 'select', by: pid2, slot: wrong }).state;
  s = apply(s, { type: 'lock', by: pid2 }).state;
  eq(s.card.correct, false);
  eq(s.players.find((x) => x.id === pid2).timeline.length, 1);
  ok(s.discard.includes(s.card.s));
});

test('Sieg bei Zielanzahl', () => {
  let { state: s } = twoPlayerGame();
  const pid = s.order[0];
  // Spieler 1 legt immer richtig, Spieler 2 immer falsch, bis jemand 3 Karten hat.
  for (let guard = 0; guard < 20 && s.phase !== 'ended'; guard++) {
    const by = s.card.by;
    const tl = s.players.find((x) => x.id === by).timeline.map((id) => YEARS[id]);
    const y = YEARS[s.card.s];
    let slot = correctSlots(tl, y)[0];
    if (by !== pid) {
      const wrong = [...Array(tl.length + 1).keys()].find((i) => !slotIsCorrect(tl, i, y));
      if (wrong !== undefined) slot = wrong;
    }
    s = apply(s, { type: 'select', by, slot }).state;
    s = apply(s, { type: 'lock', by }).state;
    if (s.phase === 'reveal') s = apply(s, { type: 'next', by }).state;
  }
  eq(s.phase, 'ended');
  eq(s.winners, [pid]);
  eq(s.endReason, 'target');
});

test('Song überspringen: neue Karte, gleicher Spieler', () => {
  let { state: s } = twoPlayerGame();
  const first = s.card;
  const r = apply(s, { type: 'skipSong', by: 'system', reason: 'unavailable', round: first.round });
  s = r.state;
  eq(s.card.by, first.by);
  ok(s.card.s !== first.s);
  eq(r.effects[0].type, 'play');
  eq(reduce(s, { type: 'skipSong', by: 'system', round: first.round }, ctx).error, 'stale');
});

test('Getrennte Spieler werden beim Weitergeben übersprungen', () => {
  let { state: s } = twoPlayerGame();
  const [p1, p2] = s.order;
  s = apply(s, { type: 'setConnected', by: 'system', id: p2, connected: false }).state;
  s = apply(s, { type: 'select', by: p1, slot: 0 }).state;
  s = apply(s, { type: 'lock', by: p1 }).state;
  if (s.phase === 'reveal') s = apply(s, { type: 'next', by: p1 }).state;
  eq(s.card.by, p1);
});

test('Spieler entfernen während seines Zugs', () => {
  let { state: s } = twoPlayerGame();
  const guest = 'G';
  // Sorge dafür, dass der Gast dran ist
  if (s.card.by !== guest) {
    s = apply(s, { type: 'skipTurn', by: 'H' }).state;
  }
  eq(s.card.by, guest);
  s = apply(s, { type: 'removePlayer', by: 'H', id: guest }).state;
  eq(s.players.length, 1);
  eq(s.card.by, 'H');
  eq(s.phase, 'turn');
});

test('Gäste dürfen keine Host-Aktionen', () => {
  const { state: s } = twoPlayerGame();
  for (const type of ['skipTurn', 'endGame', 'reset', 'start']) {
    eq(reduce(s, { type, by: 'G' }, ctx).error, 'forbidden', type);
  }
  eq(reduce(s, { type: 'removePlayer', by: 'G', id: 'H' }, ctx).error, 'forbidden');
  eq(reduce(s, { type: 'addPlayer', by: 'G', id: 'X', name: 'x' }, ctx).error, 'forbidden');
});

test('Öffentliche Sicht verrät den verdeckten Song nicht', () => {
  let { state: s } = twoPlayerGame();
  const v = publicView(s, ctx);
  const json = JSON.stringify(v);
  ok(!('deck' in v), 'kein Stapel');
  ok(!json.includes('"T' + s.card.s + '"'), 'Titel nicht enthalten');
  eq(v.card.song, undefined);
  const pid = s.order[0];
  s = apply(s, { type: 'select', by: pid, slot: 0 }).state;
  s = apply(s, { type: 'lock', by: pid }).state;
  const v2 = publicView(s, ctx);
  eq(v2.card.song.y, YEARS[s.card.s]);
});

test('Stapel leer: Spielende mit meisten Karten', () => {
  let { state: s } = twoPlayerGame(['a', 'c', 'b']);
  const pid = s.order[0];
  s = apply(s, { type: 'select', by: pid, slot: 0 }).state;
  s = apply(s, { type: 'lock', by: pid }).state;
  s = apply(s, { type: 'next', by: pid }).state;
  eq(s.phase, 'ended');
  eq(s.endReason, 'deck');
});

test('Später Beitritt bekommt Startkarte', () => {
  let { state: s } = twoPlayerGame();
  s = apply(s, { type: 'addPlayer', by: 'system', id: 'L', name: 'Spät' }).state;
  eq(s.players.find((p) => p.id === 'L').timeline.length, 1);
  ok(s.order.includes('L'));
});

test('Namen werden bereinigt', () => {
  eq(cleanName('  Anna ‮\u0007 '), 'Anna');
  eq(cleanName(''), 'Spieler');
  eq(cleanName('x'.repeat(50)).length, 24);
});

test('Neues Spiel setzt zurück', () => {
  let { state: s } = twoPlayerGame();
  const r = apply(s, { type: 'reset', by: 'H' });
  eq(r.state.phase, 'lobby');
  eq(r.state.players.map((p) => p.timeline.length), [0, 0]);
  eq(r.effects, [{ type: 'stop' }]);
});
