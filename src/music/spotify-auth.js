// Spotify-Anmeldung mit "Authorization Code + PKCE" – ohne Client Secret.
// Tokens bleiben ausschließlich in diesem Browser (localStorage) und werden
// nie an Mitspieler gesendet.

import { CONFIG } from '../../config.js';
import { Emitter, local } from '../lib/util.js';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-library-modify', // „Lied in Spotify speichern“
];
const TOKEN_KEY = 'radino.spotify.token';
const PKCE_KEY = 'radino.spotify.pkce';
const ACCOUNTS = 'https://accounts.spotify.com';
const CHANNEL = 'radino-auth';

/** Wurzeladresse der App (dort landet Spotify nach dem Login). */
export const appRootUrl = new URL('../../', import.meta.url).href;

export function redirectUri() {
  return CONFIG.spotifyRedirectUri || appRootUrl;
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}

export class NotLoggedIn extends Error {
  constructor(msg = 'Nicht bei Spotify angemeldet') {
    super(msg);
    this.name = 'NotLoggedIn';
  }
}

class SpotifyAuth extends Emitter {
  constructor() {
    super();
    this.refreshing = null;
    try {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e) => {
        if (e.data?.type === 'login') this.emit('change', e.data);
      };
    } catch {
      this.channel = null;
    }
    window.addEventListener('storage', (e) => {
      if (e.key === TOKEN_KEY) this.emit('change', { type: 'storage' });
    });
  }

  get configured() {
    return /^[0-9a-f]{32}$/i.test(CONFIG.spotifyClientId || '');
  }

  get loggedIn() {
    return !!local.read(TOKEN_KEY)?.refresh;
  }

  /** Hat die aktuelle Anmeldung diese Erlaubnis? (Ältere Anmeldungen kennen neue Erlaubnisse nicht.) */
  hasScope(scope) {
    return String(local.read(TOKEN_KEY)?.scope || '').split(/\s+/).includes(scope);
  }

  /**
   * Startet den Login. Standard: kleines Popup-Fenster, damit die Seite (und
   * damit die Spielverbindung) offen bleibt. Wenn Popups blockiert sind,
   * wird die ganze Seite umgeleitet; `resume` beschreibt, wohin es danach geht.
   */
  async login({ resume = null, popup = true } = {}) {
    if (!this.configured) throw new Error('Keine Spotify-Client-ID in config.js eingetragen.');
    const verifier = randomVerifier();
    const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
    // Modus steckt im state selbst ("p." = Popup, "r." = Umleitung), damit ein
    // Popup sich auch ohne passenden Speichereintrag nie als volle App startet.
    const popupWanted = popup && typeof window.open === 'function';
    const state = (popupWanted ? 'p.' : 'r.') + nonce;
    const params = new URLSearchParams({
      client_id: CONFIG.spotifyClientId,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await challengeFor(verifier),
      scope: SCOPES.join(' '),
      state,
    });
    const url = `${ACCOUNTS}/authorize?${params}`;
    if (popupWanted) {
      local.write(PKCE_KEY, { state, verifier, at: Date.now() });
      const win = window.open(url, 'radino-spotify-login', 'popup,width=520,height=760');
      if (win) return;
      // Popup blockiert -> mit Umleitung noch einmal von vorn
      return this.login({ resume, popup: false });
    }
    local.write(PKCE_KEY, { state, verifier, resume, at: Date.now() });
    window.location.assign(url);
  }

  /**
   * Muss beim Laden jeder Seite zuerst aufgerufen werden. Erkennt die
   * Rückkehr von Spotify (?code=…&state=…), tauscht den Code gegen Tokens
   * und räumt die Adresse wieder auf.
   */
  async handleRedirect() {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    const error = q.get('error');
    const state = q.get('state');
    if (!state || (!code && !error)) return { handled: false };

    const pending = local.read(PKCE_KEY);
    local.remove(PKCE_KEY);
    const clean = new URL(window.location.href);
    clean.search = '';
    window.history.replaceState(null, '', clean.href);

    const result = { handled: true, mode: state.startsWith('p.') ? 'popup' : 'redirect', resume: pending?.resume || null, ok: false };
    if (!pending || pending.state !== state || Date.now() - pending.at > 15 * 60 * 1000) {
      result.error = 'Die Anmeldung ist abgelaufen oder ungültig. Bitte noch einmal versuchen.';
    } else if (error) {
      result.error = error === 'access_denied' ? 'Anmeldung bei Spotify abgebrochen.' : `Spotify meldet: ${error}`;
    } else {
      try {
        const tokens = await this.#tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri(),
          code_verifier: pending.verifier,
        });
        this.#store(tokens);
        result.ok = true;
      } catch (e) {
        result.error = `Anmeldung fehlgeschlagen: ${e.message}`;
      }
    }
    this.channel?.postMessage({ type: 'login', ok: result.ok, error: result.error });
    this.emit('change', { type: 'login', ok: result.ok, error: result.error });
    return result;
  }

  async #tokenRequest(fields) {
    const res = await fetch(`${ACCOUNTS}/api/token`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CONFIG.spotifyClientId, ...fields }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* leer */
    }
    if (!res.ok) {
      const err = new Error(data?.error_description || data?.error || `HTTP ${res.status}`);
      err.code = data?.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  #store(t, previous = null) {
    local.write(TOKEN_KEY, {
      access: t.access_token,
      refresh: t.refresh_token || previous?.refresh,
      expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
      scope: t.scope || previous?.scope || '',
    });
  }

  /** Gültiges Access-Token liefern (erneuert es bei Bedarf automatisch). */
  async getAccessToken({ force = false } = {}) {
    const t = local.read(TOKEN_KEY);
    if (!t?.refresh) throw new NotLoggedIn();
    if (!force && t.access && t.expiresAt - Date.now() > 90 * 1000) return t.access;
    if (!this.refreshing) {
      this.refreshing = this.#refresh(force ? t.access : null).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async #refresh(staleAccess) {
    const run = async () => {
      // Ein anderer Tab könnte inzwischen erneuert haben.
      const t = local.read(TOKEN_KEY);
      if (!t?.refresh) throw new NotLoggedIn();
      if (t.access && t.access !== staleAccess && t.expiresAt - Date.now() > 90 * 1000) return t.access;
      try {
        const fresh = await this.#tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
        this.#store(fresh, t);
        return fresh.access_token;
      } catch (e) {
        if (e.code === 'invalid_grant' || e.status === 400) {
          // Refresh-Token abgelaufen (spätestens nach 6 Monaten) oder widerrufen.
          local.remove(TOKEN_KEY);
          this.emit('change', { type: 'expired' });
          throw new NotLoggedIn('Die Spotify-Anmeldung ist abgelaufen. Bitte neu anmelden.');
        }
        throw e;
      }
    };
    if (navigator.locks?.request) return navigator.locks.request('radino-spotify-refresh', run);
    return run();
  }

  logout() {
    local.remove(TOKEN_KEY);
    this.emit('change', { type: 'logout' });
  }
}

export const spotifyAuth = new SpotifyAuth();
