import { test, eq, ok, seededRng } from './harness.js';
import { createGame, reduce, publicView, upgradeGame, TOKENS } from '../src/core/game.js';
import { parseGuestMessage } from '../src/net/protocol.js';

// Testsongs: id -> Jahr
const YEARS = { a: 1970, b: 1980, c: 1990, d: 2000, e: 2010, f: 1980, g: 1965, h: 2020, i: 1975, j: 1999, k: 1985, l: 1995 };
const ctx = {
  yearOf: (id) => YEARS[id],
  info: (id) => ({ t: 'T' + id, a: 'A' + id, y: YEARS[id] }),
  rng: seededRng(1),
};
const NOW = 1000000;

function apply(state, action) {
  const r = reduce(state, action, ctx);
  if (r.error) throw new Error(`Aktion ${action.type} abgelehnt: ${r.error}`);
  return r.state;
}
const err = (state, action) => reduce(state, action, ctx).error;
const P = (s, id) => s.players.find((p) => p.id === id);

/**
 * Spiel mit Host H und Gästen; H ist dran. Zeitleisten werden fest gesetzt:
 * H: [b=1980], andere: [c=1990]. Die Karte ist `card`.
 */
function game({ guests = ['G'], tokens = true, target = 5, card = 'a', deck = ['d', 'e', 'g', 'h', 'i', 'j'] } = {}) {
  let s = createGame({ target, tokens });
  s = apply(s, { type: 'addPlayer', by: 'system', id: 'H', name: 'Host', host: true });
  for (const g of guests) s = apply(s, { type: 'addPlayer', by: 'system', id: g, name: 'Gast ' + g });
  s = apply(s, { type: 'start', by: 'H', deck: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'] });
  s = JSON.parse(JSON.stringify(s));
  s.order = ['H', ...guests];
  s.turn = 0;
  for (const p of s.players) p.timeline = p.id === 'H' ? ['b'] : ['c'];
  s.card = { s: card, by: 'H', slot: null, locked: false, correct: null, round: 1 };
  s.deck = deck.slice();
  s.log = [];
  return s;
}
// H legt die Karte in Lücke `slot` und legt fest.
function locked(opts, slot) {
  let s = game(opts);
  s = apply(s, { type: 'select', by: 'H', slot });
  return apply(s, { type: 'lock', by: 'H', now: NOW });
}

test('Marken: Einstellung nur in der Lobby, Standard aus', () => {
  let s = createGame();
  eq(s.settings.tokens, false);
  s = apply(s, { type: 'addPlayer', by: 'system', id: 'H', name: 'Host', host: true });
  s = apply(s, { type: 'addPlayer', by: 'system', id: 'G', name: 'Gast' });
  eq(err(s, { type: 'settings', by: 'G', settings: { tokens: true } }), 'forbidden');
  s = apply(s, { type: 'settings', by: 'H', settings: { tokens: true } });
  eq(s.settings.tokens, true);
  s = apply(s, { type: 'settings', by: 'H', settings: { tokens: 'ja' } });
  eq(s.settings.tokens, true, 'ungültiger Wert wird ignoriert');
  s = apply(s, { type: 'start', by: 'H', deck: ['a', 'b', 'c', 'd'] });
  eq(err(s, { type: 'settings', by: 'H', settings: { tokens: false } }), 'forbidden');
  eq(s.players.map((p) => p.tokens), [TOKENS.start, TOKENS.start]);
});

test('Marken aus: Festlegen deckt sofort auf, Sicht wie bisher', () => {
  const s = locked({ tokens: false }, 0); // a=1970 vor 1980: richtig
  eq(s.phase, 'reveal');
  eq(s.card.locked, true);
  eq(P(s, 'H').timeline, ['a', 'b']);
  const v = publicView(s, ctx);
  eq(Object.keys(v.card), ['by', 'slot', 'locked', 'correct', 'round', 'song', 'correctSlots']);
  eq(s.log, [{ k: 'placed', p: 'H', s: 'a', ok: true }]);
  eq(s.tokenLog, []);
  eq(err(s, { type: 'giveToken', by: 'G' }), 'forbidden');
  for (const type of ['challenge', 'pass', 'endChallenge']) eq(err(s, { type, by: type === 'endChallenge' ? 'H' : 'G', slot: 1 }), 'forbidden');
});

test('Anzweifel-Phase: Song bleibt verdeckt, Endzeitpunkt steht in der Sicht', () => {
  const s = locked({}, 1);
  eq(s.phase, 'challenge');
  eq(s.card.locked, false);
  const v = publicView(s, ctx);
  eq(v.phase, 'challenge');
  eq(v.activeId, 'H');
  eq(v.card.locked, false);
  eq(v.card.correct, null);
  eq(v.card.fixed, true);
  eq(v.card.slot, 1);
  ok(!('song' in v.card) && !('correctSlots' in v.card), 'Song darf nicht in der Sicht stehen');
  ok(!JSON.stringify(v).includes('Ta'), 'Songdaten dürfen nirgends auftauchen');
  eq(v.card.challenge, { until: NOW + TOKENS.challengeMs, picks: [], passed: [], pending: ['G'], freeSlots: [0] });
  eq(v.log, [], 'kein Verlaufseintrag vor dem Aufdecken');
  eq(err(s, { type: 'select', by: 'H', slot: 0 }), 'forbidden', 'Lücke ist fest');
  eq(err(s, { type: 'lock', by: 'H' }), 'forbidden');
  eq(err(s, { type: 'next', by: 'H' }), 'forbidden');
  eq(err(s, { type: 'skipSong', by: 'H' }), 'forbidden');
  eq(err(s, { type: 'skipTurn', by: 'H' }), 'forbidden');
});

test('Anzweifeln: Berechtigung und gesperrte Lücken', () => {
  let s = locked({ guests: ['G', 'F', 'E'] }, 1);
  eq(err(s, { type: 'challenge', by: 'H', slot: 0 }), 'forbidden', 'aktiver Spieler');
  eq(err(s, { type: 'pass', by: 'H' }), 'forbidden');
  eq(err(s, { type: 'challenge', by: 'system', slot: 0 }), 'forbidden');
  eq(err(s, { type: 'challenge', by: 'G', slot: 1 }), 'taken', 'Lücke des aktiven Spielers');
  eq(err(s, { type: 'challenge', by: 'G', slot: 2 }), 'taken', 'außerhalb');
  eq(err(s, { type: 'challenge', by: 'G', slot: null }), 'invalid');
  eq(err(s, { type: 'challenge', by: 'G' }), 'invalid');
  s = apply(s, { type: 'challenge', by: 'G', slot: 0 });
  eq(P(s, 'G').tokens, 1);
  // Nur zwei Lücken, beide vergeben: die übrigen gelten als gepasst, es wird aufgedeckt.
  eq(s.phase, 'reveal');
});

test('Anzweifeln: ohne Marke nicht möglich, doppelt nicht möglich', () => {
  let s = game({ guests: ['G', 'F'] });
  s.players.find((p) => p.id === 'H').timeline = ['b', 'c', 'd'];
  P(s, 'F').tokens = 0;
  s = apply(s, { type: 'select', by: 'H', slot: 3 });
  s = apply(s, { type: 'lock', by: 'H', now: NOW });
  eq(publicView(s, ctx).card.challenge.pending, ['G'], 'F hat keine Marke');
  eq(err(s, { type: 'challenge', by: 'F', slot: 0 }), 'forbidden');
  eq(err(s, { type: 'pass', by: 'F' }), 'forbidden');
  s = apply(s, { type: 'challenge', by: 'G', slot: 0 });
  eq(s.phase, 'reveal', 'niemand steht mehr aus');
});

test('Aufdecken: aktiver Spieler richtig, eingesetzte Marken sind weg', () => {
  let s = locked({ guests: ['G', 'F'] }, 0); // a=1970 vor 1980: richtig
  s = apply(s, { type: 'challenge', by: 'G', slot: 1 });
  eq(s.phase, 'reveal');
  eq(s.card.correct, true);
  eq(s.card.wonBy, null);
  eq(P(s, 'H').timeline, ['a', 'b']);
  eq(P(s, 'G').tokens, 1);
  eq(P(s, 'G').timeline, ['c']);
  eq(s.tokenLog, [{ r: 1, k: 'spent', p: 'G', name: 'Gast G', won: false, n: 1 }]);
  const v = publicView(s, ctx);
  eq(v.card.song.id, 'a');
  eq(v.card.locked, true);
});

test('Aufdecken: aktiver falsch, Anzweifler richtig bekommt die Karte einsortiert', () => {
  let s = locked({ guests: ['G', 'F'], card: 'h' }, 0); // h=2020 gehört hinter 1980
  s = apply(s, { type: 'challenge', by: 'G', slot: 1 });
  eq(s.phase, 'reveal');
  eq(s.card.correct, false);
  eq(s.card.wonBy, 'G');
  eq(P(s, 'H').timeline, ['b']);
  eq(P(s, 'G').timeline, ['c', 'h'], 'nach Jahr einsortiert');
  eq(s.discard.includes('h'), false);
  eq(s.tokenLog[0].won, true);
  eq(s.log, [{ k: 'placed', p: 'H', s: 'h', ok: false }, { k: 'stolen', p: 'G', from: 'H', s: 'h' }]);
  const v = publicView(s, ctx);
  eq(v.card.wonBy, 'G');
  eq(v.log[1].song.y, 2020);
  eq(v.players.find((p) => p.id === 'G').tokens, 1);
});

test('Aufdecken: alle falsch, Karte ist weg', () => {
  let s = game({ guests: ['G', 'F'], card: 'h' });
  P(s, 'H').timeline = ['a', 'b', 'c'];
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H', now: NOW });
  s = apply(s, { type: 'challenge', by: 'G', slot: 1 });
  eq(s.phase, 'challenge', 'F steht noch aus');
  s = apply(s, { type: 'pass', by: 'F' });
  eq(s.phase, 'reveal');
  eq(s.card.wonBy, null);
  ok(s.discard.includes('h'));
  eq(s.players.map((p) => p.timeline.length), [3, 1, 1]);
  eq(s.tokenLog[0].won, false);
});

test('Aufdecken: bei gleichen Jahren gewinnt, wer zuerst angezweifelt hat', () => {
  let s = game({ guests: ['G', 'F'], card: 'f' }); // f=1980
  P(s, 'H').timeline = ['a', 'b', 'c']; // 1970, 1980, 1990 -> Lücken 1 und 2 richtig
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H', now: NOW });
  s = apply(s, { type: 'challenge', by: 'F', slot: 2 });
  eq(err(s, { type: 'challenge', by: 'G', slot: 2 }), 'taken', 'von F gewählt');
  s = apply(s, { type: 'challenge', by: 'G', slot: 1 });
  eq(s.phase, 'reveal');
  eq(s.card.wonBy, 'F');
  eq(P(s, 'F').timeline, ['f', 'c']);
  eq(s.tokenLog.map((e) => [e.p, e.won]), [['F', true], ['G', false]]);
});

test('Geklaute Karte kann das Kartenziel erreichen', () => {
  let s = locked({ target: 2, card: 'h' }, 0);
  s = apply(s, { type: 'challenge', by: 'G', slot: 1 });
  eq(s.phase, 'ended');
  eq(s.endReason, 'target');
  eq(s.winners, ['G']);
  eq(publicView(s, ctx).card.song.id, 'h');
});

test('Zeitlimit und Host beenden die Phase, Gäste nicht', () => {
  let s = locked({ guests: ['G', 'F'] }, 0);
  eq(err(s, { type: 'endChallenge', by: 'G' }), 'forbidden');
  eq(err(s, { type: 'endChallenge', by: 'system', round: 99 }), 'stale');
  eq(apply(s, { type: 'endChallenge', by: 'system', round: 1 }).phase, 'reveal');
  s = apply(s, { type: 'endChallenge', by: 'H' });
  eq(s.phase, 'reveal');
  eq(s.card.correct, true);
});

test('Kein Berechtigter: sofort aufdecken', () => {
  let s = game();
  P(s, 'G').tokens = 0;
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H', now: NOW });
  eq(s.phase, 'reveal');
  let t = game();
  P(t, 'G').connected = false;
  t = apply(t, { type: 'select', by: 'H', slot: 0 });
  t = apply(t, { type: 'lock', by: 'H', now: NOW });
  eq(t.phase, 'reveal');
});

test('Getrennte Spieler blockieren nicht und gelten als gepasst', () => {
  let s = game({ guests: ['G', 'F'] });
  P(s, 'H').timeline = ['a', 'b', 'c'];
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H', now: NOW });
  s = apply(s, { type: 'setConnected', by: 'system', id: 'G', connected: false });
  eq(s.phase, 'challenge');
  eq(s.card.challenge.passed, ['G']);
  s = apply(s, { type: 'setConnected', by: 'system', id: 'G', connected: true });
  eq(err(s, { type: 'challenge', by: 'G', slot: 1 }), 'forbidden', 'bleibt gepasst');
  s = apply(s, { type: 'setConnected', by: 'system', id: 'F', connected: false });
  eq(s.phase, 'reveal');
});

test('Entfernen in der Anzweifel-Phase', () => {
  let s = game({ guests: ['G', 'F'] });
  P(s, 'H').timeline = ['a', 'b', 'c'];
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H', now: NOW });
  s = apply(s, { type: 'challenge', by: 'G', slot: 2 });
  // Anzweifler entfernt: sein Tipp entfällt, die Lücke ist wieder frei.
  let t = apply(s, { type: 'removePlayer', by: 'H', id: 'G' });
  eq(t.phase, 'challenge');
  eq(t.card.challenge.picks, []);
  eq(t.tokenLog[0].won, false);
  t = apply(t, { type: 'challenge', by: 'F', slot: 2 });
  eq(t.phase, 'reveal');
  // Letzter Ausstehender entfernt: es wird aufgedeckt.
  eq(apply(s, { type: 'removePlayer', by: 'H', id: 'F' }).phase, 'reveal');
});

test('Aktiver Spieler wird in der Anzweifel-Phase entfernt: Marken weg, neue Karte', () => {
  let s = game({ guests: ['G', 'F'] });
  s.players.find((p) => p.id === 'H').host = false;
  s.players.find((p) => p.id === 'G').host = true;
  P(s, 'H').timeline = ['a', 'b', 'c'];
  s.card.s = 'h';
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H', now: NOW });
  s = apply(s, { type: 'challenge', by: 'F', slot: 3 });
  s = apply(s, { type: 'removePlayer', by: 'G', id: 'H' });
  eq(s.phase, 'turn');
  eq(s.card.round, 2);
  ok(s.discard.includes('h'));
  eq(P(s, 'F').tokens, 1);
  eq(s.tokenLog[0].won, false);
  ok(!publicView(s, ctx).card.challenge, 'neue Karte ohne alte Phase');
});

test('Marke geben: einer reicht, nicht selbst, höchstens eine pro Zug', () => {
  let s = locked({ guests: ['G', 'F'], card: 'h' }, 0); // falsch gelegt
  s = apply(s, { type: 'endChallenge', by: 'H' });
  eq(s.card.correct, false);
  eq(err(s, { type: 'giveToken', by: 'H' }), 'forbidden', 'nicht sich selbst');
  eq(err(s, { type: 'giveToken', by: 'system' }), 'forbidden');
  s = apply(s, { type: 'giveToken', by: 'F' });
  eq(P(s, 'H').tokens, 3, 'auch bei falsch gelegter Karte');
  eq(s.card.grant, { by: 'F' });
  eq(err(s, { type: 'giveToken', by: 'G' }), 'already');
  eq(s.tokenLog, [{ r: 1, k: 'got', p: 'H', name: 'Host', by: 'F', byName: 'Gast F', n: 3 }]);
  eq(s.log[s.log.length - 1], { k: 'token', p: 'H', by: 'F' });
  eq(publicView(s, ctx).card.grant, { by: 'F' });
  s = apply(s, { type: 'next', by: 'H' });
  eq(s.phase, 'turn');
  eq(err(s, { type: 'giveToken', by: 'F' }), 'forbidden', 'Gelegenheit vorbei');
  eq(err(s, { type: 'revokeToken', by: 'H' }), 'forbidden');
});

test('Marke geben: Obergrenze', () => {
  let s = locked({}, 0);
  s = apply(s, { type: 'endChallenge', by: 'H' });
  P(s, 'H').tokens = TOKENS.max;
  eq(err(s, { type: 'giveToken', by: 'G' }), 'max');
  P(s, 'H').tokens = TOKENS.max - 1;
  eq(P(apply(s, { type: 'giveToken', by: 'G' }), 'H').tokens, TOKENS.max);
});

test('Marke zurücknehmen: nur Host, danach erneut vergebbar', () => {
  let s = locked({ guests: ['G', 'F'] }, 0);
  s = apply(s, { type: 'endChallenge', by: 'H' });
  eq(err(s, { type: 'revokeToken', by: 'H' }), 'forbidden', 'nichts vergeben');
  s = apply(s, { type: 'giveToken', by: 'G' });
  eq(err(s, { type: 'revokeToken', by: 'F' }), 'forbidden');
  s = apply(s, { type: 'revokeToken', by: 'H' });
  eq(P(s, 'H').tokens, 2);
  eq(s.card.grant, null);
  eq(s.tokenLog[1], { r: 1, k: 'revoked', p: 'H', name: 'Host', by: 'H', byName: 'Host', n: 2 });
  s = apply(s, { type: 'giveToken', by: 'F' });
  eq(P(s, 'H').tokens, 3);
  eq(s.tokenLog.map((e) => e.k), ['got', 'revoked', 'got']);
});

test('Später Beitritt bekommt Startmarken, Neues Spiel setzt zurück', () => {
  let s = locked({ guests: ['G', 'F'] }, 0);
  s = apply(s, { type: 'challenge', by: 'G', slot: 1 });
  s = apply(s, { type: 'giveToken', by: 'F' });
  s = apply(s, { type: 'addPlayer', by: 'system', id: 'N', name: 'Neu' });
  eq(P(s, 'N').tokens, TOKENS.start);
  ok(s.tokenLog.length === 2);
  s = apply(s, { type: 'reset', by: 'H' });
  eq(s.players.map((p) => p.tokens), [2, 2, 2, 2]);
  eq(s.tokenLog, []);
  eq(s.settings.tokens, true, 'Einstellung bleibt');
});

test('Marken-Protokoll wird nicht wie der Verlauf gekürzt, hat aber eine Obergrenze', () => {
  let s = locked({ guests: ['G', 'F'] }, 0);
  s = apply(s, { type: 'endChallenge', by: 'H' });
  for (let i = 0; i < 40; i++) {
    s = apply(s, { type: 'giveToken', by: 'G' });
    s = apply(s, { type: 'revokeToken', by: 'H' });
  }
  eq(s.tokenLog.length, 80);
  eq(s.log.length, 30);
  for (let i = 0; i < 300; i++) {
    s = apply(s, { type: 'giveToken', by: 'G' });
    s = apply(s, { type: 'revokeToken', by: 'H' });
  }
  eq(s.tokenLog.length, TOKENS.logLength);
  eq(publicView(s, ctx).tokenLog.length, TOKENS.logLength);
});

test('Alte gespeicherte Spiele lassen sich laden', () => {
  let s = game({ tokens: false });
  delete s.settings.tokens;
  delete s.tokenLog;
  for (const p of s.players) delete p.tokens;
  s = upgradeGame(JSON.parse(JSON.stringify(s)));
  eq(s.settings.tokens, false);
  eq(s.settings.target, 5);
  eq(s.players.map((p) => p.tokens), [2, 2]);
  eq(s.tokenLog, []);
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H' });
  eq(s.phase, 'reveal');
  ok(publicView(s, ctx).card.song);
});

test('Protokoll: neue Gast-Aktionen', () => {
  const p = (o) => parseGuestMessage(JSON.stringify(o));
  eq(p({ t: 'act', a: 'challenge', slot: 2 }), { t: 'act', a: 'challenge', slot: 2 });
  eq(p({ t: 'act', a: 'challenge', slot: null }), null);
  eq(p({ t: 'act', a: 'challenge' }), null);
  eq(p({ t: 'act', a: 'pass' }), { t: 'act', a: 'pass' });
  eq(p({ t: 'act', a: 'giveToken' }), { t: 'act', a: 'giveToken' });
  eq(p({ t: 'act', a: 'endChallenge' }), null, 'nur der Host');
  eq(p({ t: 'act', a: 'revokeToken' }), null, 'nur der Host');
});
