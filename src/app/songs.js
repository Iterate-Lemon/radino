// Songdatenbank laden und Stapel bauen.

import { shuffle } from '../core/rules.js';
import { cryptoRng, local } from '../lib/util.js';

const BAD_KEY = 'radino.badTracks';
export const TEST_TRACK = 'testtesttesttesttestte'; // Platzhalter im Testmodus

export async function loadSongs(url = new URL('../../data/songs.json', import.meta.url)) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Songliste konnte nicht geladen werden (${res.status}).`);
  const data = await res.json();
  const byId = new Map();
  const spotifyIds = new Set();
  for (const s of data.songs) {
    byId.set(s.id, s);
    if (s.sp) spotifyIds.add(s.sp);
  }
  const editions = data.editions.map((e) => ({
    ...e,
    playable: data.songs.filter((s) => s.sp && s.e.includes(e.id)).length,
  }));
  return { songs: data.songs, byId, spotifyIds, editions };
}

/** Kontext für die Spiellogik (Jahr und Anzeige-Infos zu einer Song-ID). */
export function gameContext(db, rng = cryptoRng) {
  return {
    yearOf: (id) => db.byId.get(id)?.y ?? 0,
    info: (id) => {
      const s = db.byId.get(id);
      return s ? { t: s.t, a: s.a, y: s.y, img: s.img || null } : { t: '?', a: '?', y: 0, img: null };
    },
    rng,
  };
}

export function badTracks() {
  return new Set(local.read(BAD_KEY, []));
}

export function markBadTrack(trackId) {
  const list = local.read(BAD_KEY, []);
  if (!list.includes(trackId)) {
    list.push(trackId);
    local.write(BAD_KEY, list.slice(-500));
  }
}

/** Gemischter Stapel aus den gewählten Editionen. */
export function buildDeck(db, { editions, requireSpotify }) {
  const bad = badTracks();
  const wanted = new Set(editions);
  const ids = db.songs
    .filter((s) => s.e.some((e) => wanted.has(e)))
    .filter((s) => !requireSpotify || (s.sp && !bad.has(s.sp)))
    .map((s) => s.id);
  return shuffle(ids, cryptoRng);
}

export function trackFor(db, songId, mode) {
  const s = db.byId.get(songId);
  if (mode === 'test') return s?.sp || TEST_TRACK;
  return s?.sp || null;
}
