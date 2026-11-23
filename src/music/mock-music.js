// Musikquelle für den Testmodus: simuliert das Abspielen ohne Ton.
// Gleiche Schnittstelle wie spotify-music.js. Nützlich zum Testen von
// Spiellogik, Verbindungen und Oberfläche ohne Spotify-Konto.

import { Emitter, sleep } from '../lib/util.js';

export class MockMusic extends Emitter {
  constructor() {
    super();
    this.kind = 'mock';
    this.status = 'off';
    this.message = '';
    this.volume = 0.8;
    this.startedAt = null;
    this.pos = 0;
    this.track = null;
  }
  async connect() {
    this.status = 'ready';
    this.message = 'Testmodus: keine echte Musik';
    this.emit('status', this.status, this.message);
  }
  activate() {}
  cancel() {}
  async prepare(trackId, posMs = 0) {
    await sleep(150 + Math.random() * 400);
    this.track = trackId;
    this.pos = posMs;
    this.startedAt = null;
    return { ok: true, duration: 180000 };
  }
  async start() {
    this.startedAt = Date.now();
  }
  async stop() {
    if (this.startedAt) this.pos += Date.now() - this.startedAt;
    this.startedAt = null;
  }
  async position() {
    return this.startedAt ? this.pos + (Date.now() - this.startedAt) : this.pos;
  }
  async seek(ms) {
    this.pos = ms;
    if (this.startedAt) this.startedAt = Date.now();
  }
  async setVolume(v) {
    this.volume = v;
  }
  disconnect() {
    this.status = 'off';
  }
}
