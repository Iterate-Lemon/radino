import { test, eq, ok } from './harness.js';
import { parseGuestMessage, parseHostMessage, parseInvite, makeInviteHash, safeEqual } from '../src/net/protocol.js';

const KEY = 'abcdefghijklmnopqrstuvwxyz';

test('Protokoll: gültiges hello', () => {
  const m = parseGuestMessage(JSON.stringify({ t: 'hello', v: 1, key: KEY, name: 'Anna' }));
  eq(m, { t: 'hello', key: KEY, name: 'Anna', pid: undefined, token: undefined });
});

test('Protokoll: ungültige Gastnachrichten werden verworfen', () => {
  const bad = [
    'kein json',
    '[1,2]',
    JSON.stringify({ t: 'hello', v: 1, key: 'zu-kurz', name: 'x' }),
    JSON.stringify({ t: 'hello', v: 2, key: KEY, name: 'x' }),
    JSON.stringify({ t: 'act', a: 'start' }),
    JSON.stringify({ t: 'act', a: 'select', slot: -1 }),
    JSON.stringify({ t: 'act', a: 'select', slot: '1' }),
    JSON.stringify({ t: 'act', a: 'removePlayer' }),
    JSON.stringify({ t: 'audio-state', s: '<img>' }),
    JSON.stringify({ t: 'x'.repeat(3000) }),
    JSON.stringify({ t: '__proto__' }),
  ];
  for (const raw of bad) eq(parseGuestMessage(raw), null, raw.slice(0, 40));
});

test('Protokoll: act select übernimmt nur erlaubte Felder', () => {
  const m = parseGuestMessage(JSON.stringify({ t: 'act', a: 'select', slot: 2, evil: 1 }));
  eq(m, { t: 'act', a: 'select', slot: 2 });
});

test('Protokoll: Host-Audio prüft Track-ID', () => {
  ok(parseHostMessage(JSON.stringify({ t: 'audio', c: 'prepare', seq: 1, track: '4uLU6hMCjMI75M1A2tKUQC', pos: 0 })));
  eq(parseHostMessage(JSON.stringify({ t: 'audio', c: 'prepare', seq: 1, track: 'spotify:track:x', pos: 0 })), null);
});

test('Einladungslink', () => {
  const room = 'a'.repeat(26);
  const key = 'b'.repeat(26);
  eq(parseInvite(makeInviteHash(room, key)), { roomId: room, key });
  eq(parseInvite('#join=abc-def'), null);
  ok(safeEqual(key, 'b'.repeat(26)));
  ok(!safeEqual(key, 'c'.repeat(26)));
});
