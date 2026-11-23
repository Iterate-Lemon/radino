// Musikquelle "Spotify": Web Playback SDK im eigenen Browser.
// Zeigt nie Titel/Interpret an – die App liest aus dem SDK-Zustand nur,
// ob der richtige Track läuft.
//
// Schnittstelle jeder Musikquelle (siehe auch mock-music.js):
//   status        'off' | 'login' | 'connecting' | 'ready' | 'error'
//   message       Klartext zum Status
//   connect()     Verbindung aufbauen (bei Spotify: SDK laden, Gerät anmelden)
//   activate()    in einem Klick-Handler aufrufen (Autoplay-Freigabe des Browsers)
//   prepare(trackId, posMs) -> {ok, reason}   Track laden, stumm anhalten, bereit machen
//   start()       vorbereiteten Track losspielen (schnell, für Synchronität)
//   stop()        anhalten
//   position()    aktuelle Position in ms (oder null)
//   seek(ms), setVolume(0..1), disconnect()
//   Ereignis 'status' (status, message)

import { Emitter, sleep } from '../lib/util.js';
import { spotifyAuth, NotLoggedIn } from './spotify-auth.js';
import { playTrack, transferTo, getMe, setRepeatOff, SpotifyApiError } from './spotify-api.js';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
let sdkPromise = null;

function loadSdk() {
  if (window.Spotify?.Player) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error('Spotify-Player konnte nicht geladen werden (Werbeblocker?).'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

function matches(state, trackId) {
  const t = state?.track_window?.current_track;
  if (!t) return false;
  return t.id === trackId || t.linked_from?.id === trackId || t.uri === `spotify:track:${trackId}`;
}

function withTimeout(promise, ms, fallback) {
  let t;
  return Promise.race([promise, new Promise((resolve) => (t = setTimeout(() => resolve(fallback), ms)))]).finally(() => clearTimeout(t));
}

class Cancelled extends Error {}

export class SpotifyMusic extends Emitter {
  constructor() {
    super();
    this.kind = 'spotify';
    this.player = null;
    this.deviceId = null;
    this.status = 'off';
    this.message = '';
    this.volume = 0.8;
    this.expected = null; // Track, der gerade laufen darf
    this.waiters = new Set();
    this.lastError = null;
    this.connecting = null;
    this.generation = 0; // erhöht sich bei jedem prepare/stop -> ältere Vorgänge brechen ab
    spotifyAuth.on('change', (e) => {
      if (e.type === 'logout' || e.type === 'expired') {
        this.disconnect();
        this.#set('login', e.type === 'expired' ? 'Spotify-Anmeldung abgelaufen. Bitte neu anmelden.' : '');
      }
    });
  }

  #set(status, message = '') {
    this.status = status;
    this.message = message;
    this.emit('status', status, message);
  }

  async connect() {
    if (this.status === 'ready' && this.player) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.#connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async #connect() {
    if (!spotifyAuth.configured) return this.#set('error', 'In config.js ist noch keine Spotify-Client-ID eingetragen.');
    if (!spotifyAuth.loggedIn) return this.#set('login', '');
    this.#set('connecting', 'Verbinde mit Spotify …');
    try {
      await getMe(); // prüft Freischaltung (Development Mode: nur eingetragene Nutzer)
    } catch (e) {
      if (e instanceof NotLoggedIn) return this.#set('login', e.message);
      if (e instanceof SpotifyApiError && e.status === 403) {
        return this.#set(
          'error',
          'Dein Spotify-Konto ist für diese App nicht freigeschaltet. Der Einrichter muss deine Spotify-E-Mail im Developer Dashboard unter „User Management“ eintragen.',
        );
      }
      return this.#set('error', `Spotify nicht erreichbar: ${e.message}`);
    }
    try {
      const ok = await withTimeout(loadSdk().then(() => true), 20000, false);
      if (!ok) return this.#set('error', 'Spotify-Player lädt nicht (Netzwerk oder Werbeblocker?). Seite neu laden.');
    } catch (e) {
      return this.#set('error', e.message);
    }
    this.disconnect(false);
    const fetchToken = (cb, attempt = 0) => {
      spotifyAuth
        .getAccessToken()
        .then(cb)
        .catch((e) => {
          if (e instanceof NotLoggedIn) return this.#set('login', e.message);
          // Netzwerkfehler o. Ä.: erneut versuchen, statt den Nutzer abzumelden
          setTimeout(() => fetchToken(cb, attempt + 1), Math.min(10000, 1000 * 2 ** attempt));
        });
    };
    const player = new window.Spotify.Player({
      name: 'RaDino',
      volume: this.volume,
      getOAuthToken: (cb) => fetchToken(cb),
    });
    this.player = player;

    let firstReady;
    const ready = new Promise((resolve) => {
      firstReady = resolve;
      setTimeout(() => resolve(false), 15000);
    });
    // 'ready' kommt auch nach jeder Unterbrechung erneut (ggf. mit neuer Geräte-ID).
    player.addListener('ready', ({ device_id }) => {
      if (this.player !== player) return;
      this.deviceId = device_id;
      if (this.status === 'connecting') this.#set('ready', '');
      firstReady(true);
    });
    player.addListener('not_ready', () => {
      if (this.player !== player) return;
      this.#set('connecting', 'Spotify-Verbindung unterbrochen, verbinde neu …');
    });
    player.addListener('initialization_error', ({ message }) => {
      this.#set('error', `Dieser Browser kann Spotify nicht abspielen (${message}). Bitte Chrome oder Edge verwenden.`);
    });
    player.addListener('authentication_error', () => {
      this.#set('login', 'Spotify-Anmeldung ungültig. Bitte neu anmelden.');
    });
    player.addListener('account_error', () => {
      this.#set('error', 'Für das Abspielen wird Spotify Premium benötigt.');
    });
    player.addListener('playback_error', ({ message }) => {
      this.lastError = message || 'playback_error';
      for (const w of this.waiters) w.fail('unavailable');
    });
    player.addListener('autoplay_failed', () => {
      this.#set('ready', 'Der Browser hat das automatische Abspielen blockiert. Einmal auf die Seite klicken.');
    });
    player.addListener('player_state_changed', (state) => this.#onState(state));

    const connected = await withTimeout(player.connect(), 15000, false);
    if (!connected) return this.#set('error', 'Spotify-Player konnte nicht starten. Seite neu laden?');
    if (!(await ready)) return this.#set('error', 'Spotify-Player meldet sich nicht. Seite neu laden?');
    if (this.status !== 'error' && this.status !== 'login') this.#set('ready', '');
  }

  #onState(state) {
    for (const w of [...this.waiters]) w.check(state);
    // Sicherung: Spielt Spotify etwas anderes als den aktuellen Song (z. B. Autoplay
    // nach dem Songende), wird sofort angehalten.
    if (state && !state.paused && this.expected && !matches(state, this.expected)) {
      this.player?.pause();
    }
    if (state && !state.paused && !this.expected) this.player?.pause();
  }

  #waitFor(predicate, timeout) {
    return new Promise((resolve) => {
      const w = {
        check: (state) => {
          if (predicate(state)) done(state);
        },
        fail: (reason) => done(null, reason),
      };
      const done = (state, reason) => {
        clearTimeout(timer);
        this.waiters.delete(w);
        resolve({ state, reason });
      };
      const timer = setTimeout(() => done(null, 'timeout'), timeout);
      this.waiters.add(w);
      this.player?.getCurrentState().then((s) => s && w.check(s));
    });
  }

  activate() {
    try {
      this.player?.activateElement?.();
    } catch {
      /* egal */
    }
  }

  /** Laufende Vorbereitung abbrechen (neuer Song oder Stopp). */
  cancel() {
    this.generation++;
  }

  async prepare(trackId, posMs = 0) {
    if (this.status !== 'ready' || !this.player || !this.deviceId) return { ok: false, reason: 'not-ready' };
    const gen = ++this.generation;
    const check = () => {
      if (gen !== this.generation) throw new Cancelled();
    };
    this.expected = trackId;
    this.lastError = null;
    const p = this.player;
    try {
      await p.setVolume(0);
      // Läuft noch etwas (z. B. "Nochmal abspielen"), erst anhalten – sonst würde
      // der alte Zustand fälschlich als "neuer Track läuft" erkannt.
      const current = await p.getCurrentState().catch(() => null);
      if (current && !current.paused) {
        await p.pause().catch(() => {});
        await this.#waitFor((s) => s.paused, 2000);
      }
      check();
      let attempt = 0;
      for (;;) {
        try {
          await playTrack(this.deviceId, trackId, posMs);
          break;
        } catch (e) {
          if (e instanceof SpotifyApiError && e.status === 404 && attempt === 0) {
            // Gerät noch nicht bekannt -> einmal übertragen und erneut versuchen
            attempt++;
            await transferTo(this.deviceId).catch(() => {});
            await sleep(800);
            check();
            continue;
          }
          throw e;
        }
      }
      check();
      const { state, reason } = await this.#waitFor((s) => matches(s, trackId) && !s.paused && !s.loading, 8000);
      check();
      if (!state) {
        await p.pause().catch(() => {});
        await p.setVolume(this.volume);
        return { ok: false, reason: reason === 'unavailable' ? 'unavailable' : 'timeout' };
      }
      await p.pause();
      await this.#waitFor((s) => s.paused, 2000);
      check();
      await p.seek(posMs);
      await p.setVolume(this.volume);
      setRepeatOff(this.deviceId);
      return { ok: true, duration: state.duration };
    } catch (e) {
      if (e instanceof Cancelled) return { ok: false, reason: 'cancelled' };
      await p.setVolume(this.volume).catch(() => {});
      if (e instanceof NotLoggedIn) {
        this.#set('login', e.message);
        return { ok: false, reason: 'auth' };
      }
      if (e instanceof SpotifyApiError) {
        if (e.status === 403 && /premium/i.test(e.message)) return { ok: false, reason: 'premium' };
        if (e.status === 403) return { ok: false, reason: 'unavailable' };
        if (e.status === 404) return { ok: false, reason: 'not-ready' };
        if (e.status === 429) return { ok: false, reason: 'rate-limit' };
        if (e.status === 0) return { ok: false, reason: 'network' };
      }
      console.warn('Spotify prepare', e);
      return { ok: false, reason: 'error' };
    }
  }

  async start() {
    if (!this.player) return;
    await this.player.resume();
  }

  async stop() {
    this.generation++;
    this.expected = null;
    if (!this.player) return;
    const s = await this.player.getCurrentState().catch(() => null);
    if (s && !s.paused) await this.player.pause().catch(() => {});
  }

  async position() {
    const s = await this.player?.getCurrentState().catch(() => null);
    if (!s) return null;
    if (!s.paused && typeof s.timestamp === 'number' && Math.abs(Date.now() - s.timestamp) < 10000) {
      return s.position + (Date.now() - s.timestamp);
    }
    return s.position;
  }

  async seek(ms) {
    await this.player?.seek(Math.max(0, Math.round(ms))).catch(() => {});
  }

  async setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    await this.player?.setVolume(this.volume).catch(() => {});
  }

  disconnect(updateStatus = true) {
    try {
      this.player?.disconnect();
    } catch {
      /* egal */
    }
    this.player = null;
    this.deviceId = null;
    if (updateStatus) this.#set(spotifyAuth.loggedIn ? 'off' : 'login', '');
  }
}
