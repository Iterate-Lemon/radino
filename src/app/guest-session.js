// Gast-Sitzung: verbindet sich mit dem Host, zeigt dessen Spielstand an und
// schickt eigene Spielzüge. Im Modus "Jeder hört selbst" spielt der Gast die
// Songs mit seinem eigenen Spotify-Konto synchron ab.

import { peerOptions } from '../net/peer-options.js';
import { Emitter, session } from '../lib/util.js';
import { PeerGuest } from '../net/peer-guest.js';
import { PROTOCOL_VERSION } from '../net/protocol.js';
import { AudioClient } from './audio-sync.js';

export class GuestSession extends Emitter {
  constructor({ db, invite, name, musicFor }) {
    super();
    this.role = 'guest';
    this.db = db;
    this.invite = invite;
    this.name = name;
    this.musicFor = musicFor;
    this.seatKey = `radino.seat.${invite.roomId}`;
    this.seat = session.read(this.seatKey);
    this.me = this.seat?.pid || null;
    this.game = null;
    this.notice = null;
    this.mode = null;

    this.transport = new PeerGuest({
      roomId: invite.roomId,
      peerOptions: peerOptions(),
      makeHello: () => ({
        t: 'hello',
        v: PROTOCOL_VERSION,
        key: invite.key,
        name: this.name,
        ...(this.seat ? { pid: this.seat.pid, token: this.seat.token } : {}),
      }),
    });
    this.audio = new AudioClient({
      toLocalTime: (t) => this.transport.toLocalTime(t),
      sendAck: (ack) => this.transport.send({ t: 'audio-ack', ...ack }),
      isAllowedTrack: (id) => this.mode === 'test' || this.db.spotifyIds.has(id),
    });
    this.audio.on('change', () => this.emit('change'));

    this.transport.on('status', () => this.emit('change'));
    this.transport.on('message', (msg) => this.#onMessage(msg));
  }

  start() {
    this.transport.start();
  }

  get music() {
    return this.audio.music;
  }

  #onMessage(msg) {
    switch (msg.t) {
      case 'welcome':
        this.seat = { pid: msg.pid, token: msg.token };
        this.me = msg.pid;
        session.write(this.seatKey, this.seat);
        this.audio.reset(); // Host könnte neu gestartet sein -> Zähler zurücksetzen
        this.reportAudio();
        break;
      case 'state':
        this.game = msg.view;
        this.#applyMode(msg.view?.settings?.mode);
        break;
      case 'audio':
        this.audio.handle(msg);
        break;
      case 'kicked':
        session.remove(this.seatKey);
        break;
    }
    this.emit('change');
  }

  #applyMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const music = mode === 'everyone' || mode === 'test' ? this.musicFor(mode) : null;
    if (music !== this.audio.music) {
      this.musicOff?.();
      this.audio.setMusic(music);
      this.musicOff = music?.on('status', () => {
        this.reportAudio();
        this.emit('change');
      });
      if (music && music.status === 'off') music.connect();
    }
    this.reportAudio();
  }

  reportAudio() {
    const m = this.audio.music;
    this.transport.send({ t: 'audio-state', s: m ? m.status : 'off', msg: (m?.message || '').slice(0, 120) });
  }

  view() {
    return this.game;
  }

  get connection() {
    return { status: this.transport.status };
  }

  act(type, payload = {}) {
    const msg = { t: 'act', a: type };
    if ('slot' in payload) msg.slot = payload.slot;
    if (this.game?.card?.round !== undefined && type === 'skipSong') msg.round = this.game.card.round;
    this.transport.send(msg);
    return null;
  }

  ctl(c) {
    this.music?.activate?.();
    this.transport.send({ t: 'ctl', c });
  }

  rename(name) {
    this.name = name;
    this.transport.send({ t: 'rename', name });
  }

  close() {
    this.audio.handle({ c: 'stop' });
    this.musicOff?.();
    this.transport.stop(true);
    session.remove(this.seatKey);
  }
}
