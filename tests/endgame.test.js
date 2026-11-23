import { test, eq, seededRng } from './harness.js';
import { createGame, reduce, publicView } from '../src/core/game.js';

// Testsongs: id -> Jahr
const YEARS = { a: 1970, b: 1980, c: 1990, d: 2000, e: 2010, g: 1965, h: 2020, i: 1975, j: 1999, k: 1985 };
const ctx = { yearOf: (id) => YEARS[id] ?? 1950, info: (id) => ({ t: 'T' + id, a: 'A' + id, y: YEARS[id] ?? 1950 }), rng: seededRng(3) };

function apply(state, action) {
  const r = reduce(state, action, ctx);
  if (r.error) throw new Error(`Aktion ${action.type} abgelehnt: ${r.error}`);
  return r.state;
}

/** Spiel mit fester Reihenfolge; alle haben die Karte c (1990), der Stapel ist `deck`. */
function game({ order = ['H', 'G'], target = 2, deck, tokens = false }) {
  let s = createGame({ target, tokens });
  for (const id of order) s = apply(s, { type: 'addPlayer', by: 'system', id, name: id, host: id === 'H' });
  s = apply(s, { type: 'start', by: 'H', deck: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'] });
  s = JSON.parse(JSON.stringify(s));
  s.order = order.slice();
  s.turn = 0;
  for (const p of s.players) p.timeline = ['c'];
  s.card = { s: deck[0], by: order[0], slot: null, locked: false, correct: null, round: 1 };
  s.deck = deck.slice(1);
  return s;
}
// Der Spieler am Zug legt richtig (true) oder falsch und gibt danach weiter, falls das Spiel noch läuft.
function zug(s, richtig, weiter = true) {
  const by = s.card.by;
  const frueher = YEARS[s.card.s] < 1990; // alle Testkarten liegen klar vor oder nach den Karten der Zeitleiste
  const tl = s.players.find((p) => p.id === by).timeline;
  const gut = frueher ? 0 : tl.length;
  s = apply(s, { type: 'select', by, slot: richtig ? gut : frueher ? tl.length : 0 });
  s = apply(s, { type: 'lock', by });
  if (weiter && s.phase === 'reveal') s = apply(s, { type: 'next', by });
  return s;
}
const karten = (s, id) => s.players.find((p) => p.id === id).timeline.length;

test('Nachziehen: Wer das Ziel zuerst erreicht, gewinnt erst nach dem Ende der Runde', () => {
  let s = game({ deck: ['a', 'd', 'e'] });
  s = zug(s, true, false);
  eq(karten(s, 'H'), 2);
  eq(s.phase, 'reveal', 'Spiel läuft weiter');
  eq(publicView(s, ctx).chase, { count: 2, ids: ['H'], left: ['G'] });
  s = apply(s, { type: 'next', by: 'H' });
  eq(s.card.by, 'G');
  s = zug(s, false);
  eq(s.phase, 'ended');
  eq(s.winners, ['H']);
  eq(s.endReason, 'target');
  eq(publicView(s, ctx).chase, null);
});

test('Nachziehen: Der Letzte der Runde gewinnt sofort', () => {
  let s = game({ deck: ['a', 'd', 'e'] });
  s = zug(s, false);
  s = zug(s, true, false);
  eq(s.phase, 'ended');
  eq(s.winners, ['G']);
});

test('Gleichstand: Es geht weiter, bis nach einer Runde einer allein vorn liegt', () => {
  let s = game({ deck: ['a', 'd', 'g', 'e', 'i', 'h'] });
  s = zug(s, true);
  s = zug(s, true, false);
  eq(s.phase, 'reveal', 'beide haben 2 Karten');
  eq(s.out, []);
  eq(publicView(s, ctx).chase, { count: 2, ids: ['H', 'G'], left: [] });
  s = apply(s, { type: 'next', by: 'G' });
  s = zug(s, false); // H falsch
  s = zug(s, false); // G falsch: weiter Gleichstand
  eq(s.phase, 'turn');
  s = zug(s, false); // H falsch
  s = zug(s, true, false); // G richtig
  eq(s.phase, 'ended');
  eq(s.winners, ['G']);
  eq(karten(s, 'G'), 3);
});

test('Gleichstand: Wer das Ziel in der Runde nicht erreicht, scheidet aus', () => {
  let s = game({ order: ['H', 'G', 'K'], deck: ['a', 'd', 'e', 'g', 'h', 'i', 'j'], tokens: true });
  const ohne = (st) => (st.phase === 'challenge' ? apply(st, { type: 'endChallenge', by: 'H' }) : st);
  const z = (st, richtig, weiter = true) => {
    const by = st.card.by;
    const frueher = YEARS[st.card.s] < 1990;
    const tl = st.players.find((p) => p.id === by).timeline;
    st = apply(st, { type: 'select', by, slot: richtig === frueher ? 0 : tl.length });
    st = ohne(apply(st, { type: 'lock', by }));
    if (weiter && st.phase === 'reveal') st = apply(st, { type: 'next', by: 'H' });
    return st;
  };
  s = z(s, true); // H: 2
  s = z(s, true); // G: 2
  s = z(s, false, false); // K bleibt bei 1
  eq(s.phase, 'reveal');
  eq(s.out, ['K']);
  s = apply(s, { type: 'next', by: 'H' });
  eq(s.card.by, 'H');
  // Wer ausgeschieden ist, zweifelt nicht mehr an und kommt nicht mehr dran.
  s = apply(s, { type: 'select', by: 'H', slot: 0 });
  s = apply(s, { type: 'lock', by: 'H' });
  eq(publicView(s, ctx).card.challenge.pending, ['G']);
  s = ohne(s);
  s = apply(s, { type: 'next', by: 'H' });
  eq(s.card.by, 'G');
  s = z(s, false, false); // H hat 3, G bleibt bei 2
  eq(s.phase, 'ended');
  eq(s.winners, ['H']);
});

test('Nachziehen: Getrennte Spieler halten das Rundenende nicht auf', () => {
  let s = game({ deck: ['a', 'd'] });
  s = apply(s, { type: 'setConnected', by: 'system', id: 'G', connected: false });
  s = zug(s, true, false);
  eq(s.phase, 'ended');
  eq(s.winners, ['H']);
});
