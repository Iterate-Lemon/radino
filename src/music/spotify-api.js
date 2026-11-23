// Schmale Hülle um die Spotify Web API (nur die wenigen nötigen Aufrufe).

import { spotifyAuth } from './spotify-auth.js';
import { sleep } from '../lib/util.js';

const API = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  constructor(status, message, reason) {
    super(message || `Spotify-API-Fehler ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

/** Aufruf mit Token, Wiederholung bei 401 (Token erneuern), 429 (warten) und 5xx. */
export async function spotifyFetch(path, { method = 'GET', query, body, retries = 3, maxWait = 30, timeout = 10000 } = {}) {
  const url = new URL(API + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
  let forceRefresh = false;
  for (let attempt = 0; ; attempt++) {
    const token = await spotifyAuth.getAccessToken({ force: forceRefresh });
    forceRefresh = false;
    let res;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
      res = await fetch(url, {
        signal: abort.signal,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new SpotifyApiError(0, 'Keine Verbindung zu Spotify.');
    }
    clearTimeout(timer);
    if (res.status === 204 || res.status === 202) return null;
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (res.ok) return data;

    const message = data?.error?.message || data?.error_description || text.slice(0, 200);
    const reason = data?.error?.reason;
    if (res.status === 401 && attempt < retries) {
      forceRefresh = true;
      continue;
    }
    if (res.status === 429 && reason !== 'QUOTA_EXCEEDED' && attempt < retries) {
      const wait = Number(res.headers.get('Retry-After')) || 2;
      if (wait <= maxWait) {
        await sleep(wait * 1000);
        continue;
      }
    }
    if (res.status >= 500 && attempt < retries) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    throw new SpotifyApiError(res.status, message, reason);
  }
}

export const getMe = () => spotifyFetch('/me');

export const playTrack = (deviceId, trackId, positionMs = 0) =>
  spotifyFetch('/me/player/play', {
    method: 'PUT',
    query: { device_id: deviceId },
    body: { uris: [`spotify:track:${trackId}`], position_ms: positionMs },
    retries: 1,
    maxWait: 2,
    timeout: 6000,
  });

export const transferTo = (deviceId) =>
  spotifyFetch('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play: false }, retries: 1, maxWait: 2, timeout: 6000 });

export const setRepeatOff = (deviceId) =>
  spotifyFetch('/me/player/repeat', { method: 'PUT', query: { state: 'off', device_id: deviceId }, retries: 0 }).catch(() => {});

/** Lied in die Bibliothek („Lieblingssongs“) des angemeldeten Kontos legen. Braucht user-library-modify. */
export const saveTrack = (trackId) =>
  spotifyFetch('/me/library', { method: 'PUT', query: { uris: `spotify:track:${trackId}` }, retries: 1, maxWait: 5 });

export const search = (q, { market, limit = 10, type = 'track' } = {}) =>
  spotifyFetch('/search', { query: { q, type, limit, market } });
