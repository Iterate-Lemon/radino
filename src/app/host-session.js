// Host-Sitzung: hält den echten Spielstand, prüft alle Aktionen über den
// Reducer, verteilt die öffentliche Sicht an alle und steuert die Musik.
// Der Spielstand wird laufend im Browser gespeichert, damit ein Neuladen
// oder ein kurzer Absturz des Host-Tabs das Spiel nicht beendet.

import { peerOptions } from '../net/peer-options.js';
import { Emitter, randomCode, local } from '../lib/util.js';
import { createGame, reduce, publicView, playerById, upgradeGame, LIMITS } from '../core/game.js';
import { PeerHost } from '../net/peer-host.js';
import { safeEqual, makeInviteHash, PROTOCOL_VERSION } from '../net/protocol.js';
import { AudioClient, AudioDirector } from './audio-sync.js';
import { gameContext, buildDeck, trackFor, markBadTrack, TEST_TRACK } from './songs.js';
import { appRootUrl } from '../music/spotify-auth.js';

const SAVE_KEY = 'radino.host';
const SAVE_MAX_AGE = 3 * 24 * 3600 * 1000;
const MAX_AUTO_SKIPS = 3;

export function loadSavedHost() {
  const s = local.read(SAVE_KEY);
  if (!s || s.v !== 1 || Date.now() - s.savedAt > SAVE_MAX_AGE) return null;
  return s;
}

export function discardSavedHost() {
  local.remove(SAVE_KEY);
}

export class HostSession extends Emitter {
  /**
   * db: Songdatenbank, name: Name des Hosts, saved: gespeicherter Raum (optional)
   * musicFor(mode): liefert die Musikquelle für einen Modus (Spotify / Test / null)
   */
  constructor({ db, name, saved, musicFor, defaults }) {
    super();
    this.role = 'host';
    this.db = db;
    this.ctx = gameContext(db);
    this.musicFor = musicFor;
    this.notice = null;
    this.autoSkips = 0;
    this.audioStates = new Map(); // pid -> { s, msg }
    this.broadcastQueued = false;

    if (saved) {
      this.roomId = saved.roomId;
      this.joinKey = saved.joinKey;
      this.me = saved.hostPid;
      this.tokens = saved.tokens || {};
      this.game = upgradeGame(saved.game); // ältere Spielstände ergänzen
      for (const p of this.game.players) if (!p.host) p.connected = false;
    } else {
      this.roomId = randomCode(26);
      this.joinKey = randomCode(26);
      this.me = 'p' + randomCode(12);
      this.tokens = {};
      this.game = createGame(defaults);
      this.#dispatch({ type: 'addPlayer', by: 'system', id: this.me, name, host: true }, { quiet: true });
    }

    this.local = new AudioClient({
      toLocalTime: (t) => t,
      sendAck: (ack) => this.director.onAck(this.me, ack),
      isAllowedTrack: (id) => this.game.settings.mode === 'test' || this.db.spotifyIds.has(id),
    });
    this.local.on('change', () => this.#changed());

    this.director = new AudioDirector({
      participants: () => this.#participants(),
      send: (pid, msg) => (pid === this.me ? this.local.handle(msg) : this.transport.send(pid, msg)),
      isOnline: (pid) => pid === this.me || this.transport.isConnected(pid),
    });
    this.director.on('change', () => this.#changed());
    this.director.on('failed', (f) => this.#onPlaybackFailed(f));
    this.director.on('started', () => {
      this.autoSkips = 0;
    });

    this.transport = new PeerHost({ roomId: this.roomId, peerOptions: peerOptions(this.joinKey) });
    this.transport.on('status', () => this.#changed());
    this.transport.on('hello', (client, msg) => this.#onHello(client, msg));
    this.transport.on('message', (pid, msg) => this.#onMessage(pid, msg));
    this.transport.on('leave', (pid) => {
      if (playerById(this.game, pid)) this.#dispatch({ type: 'setConnected', by: 'system', id: pid, connected: false });
      this.director.onLeave(pid);
    });

    this.#applyMode();
    this.#armChallenge(); // gespeichertes Spiel mitten in der Anzweifel-Phase
  }

  start() {
    this.transport.start();
    this.#save();
  }

  get inviteUrl() {
    // Entwickler-Schalter (?test, ?fakenet) werden in den Link übernommen.
    const q = new URLSearchParams(window.location.search);
    const dev = ['test', 'fakenet'].filter((k) => q.has(k));
    return appRootUrl + (dev.length ? `?${dev.join('&')}` : '') + makeInviteHash(this.roomId, this.joinKey);
  }

  get music() {
    return this.local.music;
  }

  // ── Musik ────────────────────────────────────────────────────────────────

  #applyMode() {
    const music = this.musicFor(this.game.settings.mode);
    if (music !== this.local.music) {
      this.musicOff?.();
      this.local.setMusic(music);
      this.musicOff = music?.on('status', (s, msg) => {
        this.audioStates.set(this.me, { s, msg });
        this.#changed();
      });
      if (music && music.status === 'off') music.connect();
    }
    this.audioStates.set(this.me, { s: music?.status || 'off', msg: music?.message || '' });
  }

  #participants() {
    const mode = this.game.settings.mode;
    if (mode === 'host') return [this.me];
    // Jeder hört selbst / Test: alle verbundenen Spieler mit bereitem Player
    return this.game.players
      .filter((p) => p.id === this.me || (p.connected && this.transport.isConnected(p.id)))
      .filter((p) => this.audioStates.get(p.id)?.s === 'ready')
      .map((p) => p.id);
  }

  #runEffects(effects) {
    for (const e of effects) {
      if (e.type === 'play') {
        const trackId = trackFor(this.db, e.songId, this.game.settings.mode);
        if (!trackId) continue;
        this.director.play({ trackId, pos: this.game.settings.startAt * 1000, round: e.round });
      } else if (e.type === 'stop') {
        this.director.stop();
      }
    }
  }

  #onPlaybackFailed({ round, trackId, reasons, trackSpecific }) {
    if (this.game.phase !== 'turn' || this.game.card?.round !== round) return;
    if (trackSpecific && this.autoSkips < MAX_AUTO_SKIPS) {
      this.autoSkips++;
      // Nur eindeutig gesperrte Songs merken (nicht bloß langsam geladene).
      if (trackId !== TEST_TRACK && reasons.every((r) => r === 'unavailable')) markBadTrack(trackId);
      this.setNotice('Song ist bei Spotify nicht verfügbar – es kommt automatisch ein neuer.');
      this.#dispatch({ type: 'skipSong', by: 'system', reason: 'unavailable', round });
      return;
    }
    const why = {
      'not-ready': 'Spotify ist nicht verbunden',
      auth: 'die Spotify-Anmeldung ist abgelaufen',
      premium: 'Spotify Premium wird benötigt',
      'rate-limit': 'Spotify hat zu viele Anfragen gemeldet',
      network: 'keine Verbindung zu Spotify',
      'not-allowed': 'der Song ist nicht in der Songliste',
      'no-ack': 'keine Rückmeldung vom Player',
      stalled: 'der Player reagiert nicht',
      timeout: 'der Song lädt nicht',
    };
    const reason = reasons.map((r) => why[r]).find(Boolean) || 'unbekannter Fehler';
    this.setNotice(`Song konnte nicht abgespielt werden: ${reason}. „Nochmal abspielen“ oder „Song überspringen“.`);
  }

  // ── Netzwerk ─────────────────────────────────────────────────────────────

  #onHello(client, msg) {
    if (!safeEqual(msg.key, this.joinKey)) return this.transport.reject(client, 'bad-key');
    let pid = null;
    const known = msg.pid && this.tokens[msg.pid];
    if (known && safeEqual(msg.token || '', this.tokens[msg.pid]) && playerById(this.game, msg.pid)) {
      pid = msg.pid;
      this.#dispatch({ type: 'setConnected', by: 'system', id: pid, connected: true }, { quiet: true });
      if (msg.name && playerById(this.game, pid).name !== msg.name) {
        this.#dispatch({ type: 'rename', by: 'system', id: pid, name: msg.name }, { quiet: true });
      }
    } else {
      if (this.game.players.length >= LIMITS.maxPlayers) return this.transport.reject(client, 'full');
      pid = 'p' + randomCode(12);
      const err = this.#dispatch({ type: 'addPlayer', by: 'system', id: pid, name: msg.name }, { quiet: true });
      if (err) return this.transport.reject(client, err);
      this.tokens[pid] = randomCode(26);
    }
    this.transport.accept(client, pid, { t: 'welcome', v: PROTOCOL_VERSION, pid, token: this.tokens[pid] });
    this.#save();
    this.#changed();
  }

  #onMessage(pid, msg) {
    if (!playerById(this.game, pid)) return;
    switch (msg.t) {
      case 'act': {
        const action = { type: msg.a, by: pid };
        if ('slot' in msg) action.slot = msg.slot;
        if ('round' in msg) action.round = msg.round;
        this.#dispatch(action);
        break;
      }
      case 'ctl':
        if (this.#mayControlAudio(pid)) msg.c === 'replay' ? this.#replay() : this.director.stop();
        break;
      case 'audio-ack':
        this.director.onAck(pid, msg);
        break;
      case 'audio-state':
        this.audioStates.set(pid, { s: msg.s, msg: msg.msg || '' });
        this.#changed();
        break;
      case 'rename':
        this.#dispatch({ type: 'rename', by: pid, id: pid, name: msg.name });
        break;
    }
  }

  #mayControlAudio(pid) {
    return pid === this.me || (this.game.card && this.game.card.by === pid && this.game.phase !== 'lobby');
  }

  // ── Zustand ──────────────────────────────────────────────────────────────

  #dispatch(action, { quiet = false } = {}) {
    const prevMode = this.game.settings.mode;
    // Das Zeitlimit der Anzweifel-Phase läuft nach der Uhr des Hosts.
    if (action.type === 'lock') action = { ...action, now: Date.now() };
    const r = reduce(this.game, action, this.ctx);
    if (r.error) {
      if (!quiet && action.by === this.me) console.info('Aktion abgelehnt:', action.type, r.error);
      return r.error;
    }
    this.game = r.state;
    if (this.game.settings.mode !== prevMode && this.local) this.#applyMode();
    this.#armChallenge();
    this.#save();
    this.#changed();
    this.#runEffects(r.effects);
    return null;
  }

  /** Stellt den Timer, der die Anzweifel-Phase nach Ablauf des Zeitlimits beendet. */
  #armChallenge() {
    const card = this.game.card;
    const until = this.game.phase === 'challenge' ? card?.challenge?.until ?? null : null;
    const key = until === null ? null : `${card.round}:${until}`;
    if (key === this.challengeKey) return;
    this.challengeKey = key;
    clearTimeout(this.challengeTimer);
    if (key === null) return;
    const round = card.round;
    this.challengeTimer = setTimeout(() => {
      this.challengeKey = null;
      this.#dispatch({ type: 'endChallenge', by: 'system', round }, { quiet: true });
    }, Math.max(0, until - Date.now()));
  }

  #save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      local.write(SAVE_KEY, {
        v: 1,
        savedAt: Date.now(),
        roomId: this.roomId,
        joinKey: this.joinKey,
        hostPid: this.me,
        tokens: this.tokens,
        game: this.game,
      });
    }, 200);
  }

  /** Öffentliche Sicht + Abspielstatus je Spieler. Gleiche Sicht für alle. */
  #view() {
    const v = publicView(this.game, this.ctx);
    v.audio = {};
    for (const p of this.game.players) {
      const st = this.audioStates.get(p.id) || { s: 'off', msg: '' };
      v.audio[p.id] = { s: st.s, msg: st.msg, play: this.director?.statusFor(p.id) || null };
    }
    return v;
  }

  #changed() {
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    setTimeout(() => {
      this.broadcastQueued = false;
      if (!this.transport) return;
      this.cachedView = this.#view();
      this.transport.broadcast({ t: 'state', view: this.cachedView });
      this.emit('change');
    }, 30);
  }

  view() {
    return this.cachedView || this.#view();
  }

  get connection() {
    return { status: this.transport.status };
  }

  setNotice(text) {
    this.notice = text;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.emit('change');
    }, 8000);
    this.emit('change');
  }

  // ── Aktionen des Hosts (aus der Oberfläche) ───────────────────────────────

  act(type, payload = {}) {
    if (type === 'start') {
      const s = this.game.settings;
      const deck = buildDeck(this.db, { editions: s.editions, requireSpotify: s.mode !== 'test' });
      const err = this.#dispatch({ type: 'start', by: this.me, deck });
      if (err === 'deck-too-small') this.setNotice('Zu wenige Songs in den gewählten Editionen.');
      return err;
    }
    if (type === 'removePlayer') {
      const err = this.#dispatch({ type, by: this.me, id: payload.id });
      if (!err) {
        this.transport.kick(payload.id);
        delete this.tokens[payload.id];
        this.audioStates.delete(payload.id);
      }
      return err;
    }
    return this.#dispatch({ type, by: this.me, ...payload });
  }

  ctl(c) {
    this.music?.activate?.();
    if (c === 'replay') this.#replay();
    else this.director.stop();
  }

  /** Aktuellen Song neu starten – auch nach einem Neuladen des Hosts. */
  #replay() {
    const card = this.game.card;
    let fallback = null;
    if (card && (this.game.phase === 'turn' || this.game.phase === 'challenge' || this.game.phase === 'reveal')) {
      const trackId = trackFor(this.db, card.s, this.game.settings.mode);
      if (trackId) fallback = { trackId, pos: this.game.settings.startAt * 1000, round: card.round };
    }
    // Immer den Song der aktuellen Karte nehmen (der zuletzt gespielte könnte veraltet sein).
    if (fallback) this.director.play(fallback);
    else this.director.replay();
  }

  rename(name) {
    this.#dispatch({ type: 'rename', by: this.me, id: this.me, name });
  }

  close({ forget = true } = {}) {
    this.director.stop();
    this.transport.stop();
    this.musicOff?.();
    clearTimeout(this.saveTimer);
    clearTimeout(this.challengeTimer);
    if (forget) discardSavedHost();
  }
}
