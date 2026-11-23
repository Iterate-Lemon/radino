// Abspiel-Steuerung über mehrere Browser.
//
// Ablauf pro Song (Host = "Director", jeder Teilnehmer = "Client"):
//   1. Director -> alle: prepare(track, pos)   Client lädt Track stumm und hält an
//   2. Client -> Director: ack(ok | Grund)
//   3. Director -> alle: start(at = Host-Uhrzeit + Puffer)
//   4. Client rechnet "at" mit dem gemessenen Uhrzeit-Versatz in lokale Zeit um,
//      startet genau dann und korrigiert danach eine Abweichung per seek().
// Im Modus "Nur der Host spielt ab" ist der Host der einzige Teilnehmer.

import { Emitter, now } from '../lib/util.js';

const PREPARE_TIMEOUT = 14000; // Host wartet so lange auf alle Rückmeldungen
const CLIENT_PREPARE_LIMIT = 13000; // Teilnehmer gibt nach dieser Zeit auf
const START_DELAY = 700; // ms Puffer zwischen Startbefehl und Start
const DRIFT_TOLERANCE = 250; // ms
const TRACK_SPECIFIC = ['unavailable', 'timeout']; // Gründe, die am Song selbst liegen

export class AudioClient extends Emitter {
  constructor({ music = null, toLocalTime, sendAck, isAllowedTrack }) {
    super();
    this.music = music;
    this.toLocalTime = toLocalTime;
    this.sendAck = sendAck;
    this.isAllowedTrack = isAllowedTrack;
    this.latest = 0; // höchste bekannte seq
    this.prepared = null; // { seq, pos }
    this.pendingStart = null;
    this.timers = [];
    this.queue = Promise.resolve();
    this.state = 'idle'; // idle | preparing | ready | playing | stopped | error
    this.reason = '';
    this.drift = null;
  }

  /** Nach (Wieder-)Beitritt: Zählerstand vergessen (der Host kann neu gestartet sein). */
  reset() {
    this.latest = 0;
    this.prepared = null;
    this.pendingStart = null;
    this.#clearTimers();
    this.music?.cancel?.();
  }

  setMusic(music) {
    if (this.music && this.music !== music) this.music.stop?.();
    this.music = music;
  }

  #set(state, reason = '') {
    this.state = state;
    this.reason = reason;
    this.emit('change');
  }

  #clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  handle(cmd) {
    if (cmd.c === 'stop') {
      this.latest++;
      this.prepared = null;
      this.pendingStart = null;
      this.#clearTimers();
      this.music?.cancel?.();
      this.queue = this.queue.then(() => this.music?.stop()).catch(() => {});
      this.#set('stopped');
      return;
    }
    if (cmd.c === 'prepare') {
      this.latest = Math.max(this.latest, cmd.seq);
      this.#clearTimers();
      this.pendingStart = null;
      this.music?.cancel?.(); // eine noch laufende Vorbereitung abbrechen
      this.queue = this.queue.then(() => this.#prepare(cmd)).catch((e) => console.warn(e));
      return;
    }
    if (cmd.c === 'start') {
      if (cmd.seq !== this.latest) return;
      if (this.prepared?.seq === cmd.seq) this.#scheduleStart(cmd);
      else this.pendingStart = cmd; // Vorbereitung läuft noch
    }
  }

  async #prepare(cmd) {
    if (cmd.seq !== this.latest) return; // längst überholt
    if (!this.music || this.music.status !== 'ready') {
      this.sendAck({ seq: cmd.seq, ok: false, reason: 'not-ready' });
      this.#set('error', 'not-ready');
      return;
    }
    if (!this.isAllowedTrack(cmd.track)) {
      this.sendAck({ seq: cmd.seq, ok: false, reason: 'not-allowed' });
      this.#set('error', 'not-allowed');
      return;
    }
    this.#set('preparing');
    let limit;
    const r = await Promise.race([
      this.music.prepare(cmd.track, cmd.pos),
      new Promise((resolve) => (limit = setTimeout(() => resolve({ ok: false, reason: 'stalled' }), CLIENT_PREPARE_LIMIT))),
    ]);
    clearTimeout(limit);
    if (r.reason === 'stalled') this.music.cancel?.();
    if (cmd.seq !== this.latest) {
      if (r.reason !== 'cancelled') await this.music.stop();
      return;
    }
    if (!r.ok) {
      this.sendAck({ seq: cmd.seq, ok: false, reason: r.reason || 'error' });
      this.#set('error', r.reason || 'error');
      return;
    }
    this.prepared = { seq: cmd.seq, pos: cmd.pos };
    this.#set('ready');
    this.sendAck({ seq: cmd.seq, ok: true });
    if (this.pendingStart?.seq === cmd.seq) {
      const s = this.pendingStart;
      this.pendingStart = null;
      this.#scheduleStart(s);
    }
  }

  #scheduleStart(cmd) {
    const at = this.toLocalTime(cmd.at);
    const seq = cmd.seq;
    const run = async () => {
      if (seq !== this.latest) return;
      const late = now() - at;
      await this.music.start();
      if (late > DRIFT_TOLERANCE) await this.music.seek(this.prepared.pos + late);
      this.#set('playing');
      this.timers.push(setTimeout(() => this.#checkDrift(seq, at), 1500));
      this.timers.push(setTimeout(() => this.#checkDrift(seq, at), 5000));
    };
    this.timers.push(setTimeout(run, Math.max(0, at - now())));
  }

  async #checkDrift(seq, at) {
    if (seq !== this.latest || !this.prepared) return;
    const actual = await this.music.position();
    if (actual == null || seq !== this.latest) return;
    const expected = this.prepared.pos + (now() - at);
    this.drift = Math.round(actual - expected);
    if (Math.abs(this.drift) > DRIFT_TOLERANCE) {
      await this.music.seek(this.prepared.pos + (now() - at) + 30);
    }
    this.emit('change');
  }
}

export class AudioDirector extends Emitter {
  /**
   * participants(): Spieler-IDs, die mithören sollen
   * send(pid, msg): an einen Teilnehmer schicken (lokal oder übers Netz)
   * isOnline(pid): ob der Teilnehmer gerade verbunden ist
   */
  constructor({ participants, send, isOnline }) {
    super();
    this.participants = participants;
    this.send = send;
    this.isOnline = isOnline;
    this.seq = 0;
    this.current = null;
    this.last = null;
    this.timer = null;
    this.everyone = new Set(); // alle, die je einen Befehl bekommen haben
  }

  play({ trackId, pos, round }) {
    clearTimeout(this.timer);
    const seq = ++this.seq;
    const parts = this.participants();
    this.current = { seq, trackId, pos, round, parts, acks: new Map(), started: false };
    this.last = { trackId, pos, round };
    // Wer nicht mehr teilnimmt (z. B. Moduswechsel), soll still sein.
    for (const pid of this.everyone) if (!parts.includes(pid)) this.send(pid, { t: 'audio', c: 'stop' });
    for (const pid of parts) {
      this.everyone.add(pid);
      this.send(pid, { t: 'audio', c: 'prepare', seq, track: trackId, pos });
    }
    this.timer = setTimeout(() => this.#maybeStart(true), PREPARE_TIMEOUT);
    this.emit('change');
    if (!parts.length) this.#maybeStart(true);
  }

  replay(fallback = null) {
    const what = this.last || fallback;
    if (what) this.play(what);
  }

  stop() {
    clearTimeout(this.timer);
    this.seq++;
    this.current = null;
    for (const pid of this.everyone) this.send(pid, { t: 'audio', c: 'stop' });
    this.emit('change');
  }

  onAck(pid, { seq, ok, reason }) {
    const c = this.current;
    if (!c || seq !== c.seq || !c.parts.includes(pid)) return;
    c.acks.set(pid, { ok, reason });
    this.emit('change');
    this.#maybeStart(false);
  }

  onLeave() {
    if (this.current && !this.current.started) this.#maybeStart(false);
  }

  #maybeStart(timeout) {
    const c = this.current;
    if (!c || c.started) return;
    const waiting = c.parts.filter((p) => !c.acks.has(p) && this.isOnline(p));
    if (waiting.length && !timeout) return;
    clearTimeout(this.timer);
    c.started = true;
    const okParts = c.parts.filter((p) => c.acks.get(p)?.ok);
    if (!okParts.length) {
      const reasons = c.parts.map((p) => c.acks.get(p)?.reason || 'no-ack');
      const trackSpecific = reasons.length > 0 && reasons.every((r) => TRACK_SPECIFIC.includes(r));
      this.emit('failed', { round: c.round, trackId: c.trackId, reasons, trackSpecific });
      this.emit('change');
      return;
    }
    const at = now() + START_DELAY;
    // Auch Nachzügler bekommen den Start; sie steigen mit Ausgleich später ein.
    for (const pid of c.parts) this.send(pid, { t: 'audio', c: 'start', seq: c.seq, at });
    this.emit('started', { round: c.round, okCount: okParts.length });
    this.emit('change');
  }

  /** Abspielstatus je Spieler für die Anzeige. */
  statusFor(pid) {
    const c = this.current;
    if (!c || !c.parts.includes(pid)) return null;
    const ack = c.acks.get(pid);
    if (!ack) return c.started ? 'late' : 'preparing';
    if (!ack.ok) return `failed:${ack.reason}`;
    return c.started ? 'playing' : 'ready';
  }
}
