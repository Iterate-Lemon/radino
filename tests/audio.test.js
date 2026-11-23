import { test, eq, ok } from './harness.js';
import { AudioDirector } from '../src/app/audio-sync.js';
import { parseGuestMessage } from '../src/net/protocol.js';

// jsc kennt keine Zeitgeber zum Abbrechen und keine genaue Uhr: Dort laufen die
// Tests ohne die Warte-Timer und mit der einfachen Uhr.
if (typeof clearTimeout === 'undefined') {
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {};
}
if (typeof performance === 'undefined' || !Number.isFinite(performance.timeOrigin)) {
  globalThis.performance = { timeOrigin: 0, now: () => Date.now() };
}

const A = '4uLU6hMCjMI75M1A2tKUQC';
const B = '7ouMYWpwJ422jRcDASZB7P';

function director() {
  const sent = [];
  const d = new AudioDirector({ participants: () => ['H'], send: (pid, msg) => sent.push(msg), isOnline: () => true });
  const take = () => sent.splice(0).map((m) => (m.c === 'prepare' ? `prepare:${m.track}:${m.pos}` : m.c));
  return { d, sent, take };
}

test('Pause: hält an und spielt an derselben Stelle weiter', () => {
  const { d, sent, take } = director();
  d.play({ trackId: A, pos: 30000, round: 1 });
  d.onAck('H', { seq: sent[0].seq, ok: true, duration: 200000 });
  eq(take(), [`prepare:${A}:30000`, 'start']);
  d.current.at -= 5700; // so tun, als liefe der Song seit 5 Sekunden (Start war 0,7 s nach dem Befehl)
  d.pause();
  ok(d.paused);
  eq(take(), ['stop']);
  eq(d.statusFor('H'), null);
  d.pause(); // doppelt drücken ändert nichts
  eq(take(), []);
  ok(d.resume());
  ok(!d.paused);
  const [m] = sent.splice(0);
  eq([m.c, m.track], ['prepare', A]);
  ok(m.pos >= 35000 && m.pos < 36000 && Number.isInteger(m.pos), `Stelle ${m.pos}`);
  eq(d.resume(), false); // nicht pausiert: nichts passiert
  d.stop();
});

test('Pause: ein neuer Song wartet, bis weitergespielt wird', () => {
  const { d, sent, take } = director();
  d.play({ trackId: A, pos: 0, round: 1 });
  d.onAck('H', { seq: sent[0].seq, ok: true });
  take();
  d.pause();
  take();
  d.play({ trackId: B, pos: 0, round: 2 }); // nächste Runde beginnt in der Pause
  eq(take(), []);
  ok(d.paused);
  ok(d.resume());
  eq(take(), [`prepare:${B}:0`]);
  d.stop();
});

test('Pause: nach dem Songende und nach Stopp gibt es nichts zum Weiterspielen', () => {
  const { d, sent, take } = director();
  d.play({ trackId: A, pos: 0, round: 1 });
  d.onAck('H', { seq: sent[0].seq, ok: true, duration: 180000 });
  d.current.at -= 179500;
  d.pause();
  eq(d.resume(), false);
  d.pause();
  d.stop(); // Spielende oder neue Lobby hebt die Pause auf
  ok(!d.paused);
  take();
  d.play({ trackId: B, pos: 0, round: 1 });
  eq(take(), [`prepare:${B}:0`]);
  d.stop();
});

test('Protokoll: Musik-Bedienung der Gäste', () => {
  for (const c of ['replay', 'stop', 'pause', 'resume']) eq(parseGuestMessage(JSON.stringify({ t: 'ctl', c })), { t: 'ctl', c });
  eq(parseGuestMessage(JSON.stringify({ t: 'ctl', c: 'lauter' })), null);
  eq(parseGuestMessage(JSON.stringify({ t: 'audio-ack', seq: 3, ok: true, duration: 201500 })).duration, 201500);
  eq(parseGuestMessage(JSON.stringify({ t: 'audio-ack', seq: 3, ok: true, duration: 'lang' })).duration, undefined);
});
