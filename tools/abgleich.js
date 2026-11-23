// Spotify-Abgleich: ermittelt einmalig die Track-IDs für data/songs.json.
// Läuft komplett im Browser mit dem eigenen Spotify-Login (kein Client Secret).
// Fortschritt wird im Browser gespeichert; Abbrechen und Fortsetzen ist jederzeit möglich.

import { CONFIG } from '../config.js';
import { spotifyAuth } from '../src/music/spotify-auth.js';
import { search, SpotifyApiError } from '../src/music/spotify-api.js';
import { loadSongs } from '../src/app/songs.js';
import { local, sleep } from '../src/lib/util.js';
import { scoreTrack, candidateInfo, searchQuery, pickImage } from './match-core.js';

const KEY = 'radino.match';
const PAUSE_MS = 120;

let db = null;
let results = local.read(KEY, { v: 1, results: {} }).results;
let running = false;
let stopRequested = false;
let lastError = '';
let reviewPage = 0;
let showDecided = false;

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren würde null als Text "null" einfügen – daher filtern.
function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

function save() {
  local.write(KEY, { v: 1, results });
}

function stats() {
  const s = { total: db.songs.length, ok: 0, review: 0, none: 0, open: 0 };
  for (const song of db.songs) {
    const r = results[song.id];
    if (!r) {
      if (song.sp) s.ok++;
      else s.open++;
    } else if (r.status === 'ok' || (r.decided && r.sp)) s.ok++;
    else if (r.status === 'review' && !r.decided) s.review++;
    else s.none++;
  }
  return s;
}

// ── Abgleich ─────────────────────────────────────────────────────────────────

async function searchTracks(q) {
  const data = await search(q, { market: CONFIG.market, limit: 10 });
  return data?.tracks?.items?.filter(Boolean) || [];
}

async function matchSong(song) {
  const seen = new Map();
  const add = (tracks) => {
    for (const t of tracks) if (t?.id && !seen.has(t.id)) seen.set(t.id, { t, s: scoreTrack(song, t) });
  };

  if (song.isrc) {
    const tracks = await searchTracks(`isrc:${song.isrc}`);
    add(tracks);
    const best = [...seen.values()].filter((c) => c.t.is_playable !== false).sort((a, b) => b.s.score - a.s.score)[0];
    if (best && best.s.title >= 0.6 && best.s.artist >= 0.5) {
      return { status: 'ok', m: 'isrc', sp: best.t.id, img: pickImage(best.t.album) };
    }
    await sleep(PAUSE_MS);
  }

  add(await searchTracks(searchQuery(song)));
  if (seen.size < 3) {
    await sleep(PAUSE_MS);
    add(await searchTracks(`${song.t} ${song.a}`.replace(/["“”]/g, '')));
  }

  const ranked = [...seen.values()].sort((a, b) => b.s.score - a.s.score);
  const top = ranked[0];
  if (top && top.t.is_playable !== false && top.s.score >= 0.85 && top.s.title >= 0.8 && top.s.artist >= 0.75) {
    return { status: 'ok', m: 'search', sp: top.t.id, img: pickImage(top.t.album) };
  }
  if (!top) return { status: 'none', cands: [] };
  return { status: 'review', cands: ranked.slice(0, 5).map((c) => candidateInfo(c.t, c.s)) };
}

async function run({ recheck = false } = {}) {
  if (running) return;
  running = true;
  stopRequested = false;
  lastError = '';
  render();
  try {
    for (const song of db.songs) {
      if (stopRequested) break;
      const r = results[song.id];
      if (!recheck && (r || song.sp)) continue;
      if (r?.m === 'manual' || r?.decided) continue;
      try {
        results[song.id] = await matchSong(song);
      } catch (e) {
        if (e instanceof SpotifyApiError && e.status === 429) {
          lastError =
            e.reason === 'QUOTA_EXCEEDED'
              ? 'Spotify-Kontingent für heute erschöpft. Fortschritt ist gespeichert – später einfach fortsetzen.'
              : 'Spotify bremst gerade (zu viele Anfragen). Kurz warten und fortsetzen.';
          break;
        }
        if (e.name === 'NotLoggedIn') {
          lastError = 'Spotify-Anmeldung abgelaufen. Bitte neu anmelden und fortsetzen.';
          break;
        }
        if (e instanceof SpotifyApiError && e.status === 403) {
          lastError = 'Spotify verweigert den Zugriff (403). Ist dein Konto in der Developer-App unter „User Management“ eingetragen?';
          break;
        }
        results[song.id] = { status: 'none', cands: [], error: String(e.message || e).slice(0, 120) };
      }
      save();
      renderRun();
      await sleep(PAUSE_MS);
    }
  } finally {
    running = false;
    save();
    render();
  }
}

// ── Oberfläche ───────────────────────────────────────────────────────────────

function renderLogin() {
  const box = $('login');
  if (!spotifyAuth.configured) {
    fill(box, h('h2', {}, '1. Spotify'), h('p', { class: 'error-text' }, 'In config.js ist noch keine Client-ID eingetragen (siehe Anleitung, Schritt 2).'));
    return;
  }
  fill(box, 
    h('h2', {}, '1. Spotify'),
    spotifyAuth.loggedIn
      ? h('p', {}, 'Angemeldet. ', h('button', { type: 'button', class: 'small', onclick: () => spotifyAuth.logout() }, 'Abmelden'))
      : h('p', {}, h('button', { type: 'button', class: 'primary', onclick: () => spotifyAuth.login({ resume: null }) }, 'Bei Spotify anmelden')),
  );
}

function renderRun() {
  const s = stats();
  const done = s.total - s.open;
  fill($('run'), 
    h('h2', {}, '2. Abgleich'),
    h('progress', { class: 'progress', max: s.total, value: done }),
    h('p', { class: 'stats' }, `${done} von ${s.total} bearbeitet · ${s.ok} gefunden · ${s.review} zu prüfen · ${s.none} ohne Treffer · ${s.open} offen`),
    h(
      'div',
      { class: 'row' },
      running
        ? h('button', { type: 'button', onclick: () => (stopRequested = true) }, 'Pause')
        : h('button', { type: 'button', class: 'primary', disabled: !spotifyAuth.loggedIn || !s.open, onclick: () => run() }, done ? 'Fortsetzen' : 'Abgleich starten'),
      running ? h('span', { class: 'muted' }, 'läuft … (dauert etwa 10–20 Minuten, Tab offen lassen)') : null,
    ),
    lastError ? h('p', { class: 'error-text' }, lastError) : null,
  );
}

function chooseCandidate(song, choice) {
  const r = results[song.id];
  if (choice === 'none') {
    results[song.id] = { ...r, status: 'review', decided: true, sp: null, img: null, m: 'manual' };
  } else {
    const c = r.cands.find((x) => x.id === choice);
    results[song.id] = { ...r, status: 'review', decided: true, sp: c.id, img: c.img, m: 'manual' };
  }
  save();
  renderRun();
  renderExport();
}

function renderReview() {
  const items = db.songs.filter((s) => results[s.id]?.status === 'review' && (showDecided || !results[s.id].decided));
  const perPage = 20;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  reviewPage = Math.min(reviewPage, pages - 1);
  const slice = items.slice(reviewPage * perPage, (reviewPage + 1) * perPage);
  fill($('review'), 
    h('h2', {}, '3. Unsichere Treffer prüfen'),
    h(
      'p',
      { class: 'hint' },
      'Bei diesen Songs war die Zuordnung nicht eindeutig. Wähle die passende Aufnahme (Link öffnet Spotify zum Reinhören) oder „Keiner passt“. ',
      'Unbearbeitete Songs werden beim Export einfach weggelassen.',
    ),
    h(
      'label',
      { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: showDecided,
        onchange: (e) => {
          showDecided = e.target.checked;
          renderReview();
        },
      }),
      ' auch bereits entschiedene anzeigen',
    ),
    items.length ? null : h('p', {}, 'Nichts zu prüfen.'),
    slice.map((song) => {
      const r = results[song.id];
      const name = `pick-${song.id}`;
      return h(
        'div',
        { class: 'rv' },
        h('h3', {}, `${song.a} – ${song.t} (${song.y})`),
        h(
          'div',
          { class: 'cands' },
          r.cands.map((c) =>
            h(
              'label',
              {},
              h('input', { type: 'radio', name, checked: r.decided && r.sp === c.id, onchange: () => chooseCandidate(song, c.id) }),
              c.img ? h('img', { src: c.img, alt: '' }) : null,
              h('span', {}, `${c.artists} – ${c.name} · ${c.album} (${c.year}) · Ähnlichkeit ${Math.round(c.score * 100)} %${c.playable ? '' : ' · NICHT abspielbar'}`),
              h('a', { href: `https://open.spotify.com/track/${c.id}`, target: '_blank', rel: 'noopener noreferrer' }, 'anhören'),
            ),
          ),
          h('label', {}, h('input', { type: 'radio', name, checked: r.decided && !r.sp, onchange: () => chooseCandidate(song, 'none') }), 'Keiner passt (Song weglassen)'),
        ),
      );
    }),
    pages > 1
      ? h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', disabled: reviewPage === 0, onclick: () => (reviewPage--, renderReview()) }, '← zurück'),
          h('span', {}, `Seite ${reviewPage + 1} von ${pages}`),
          h('button', { type: 'button', disabled: reviewPage >= pages - 1, onclick: () => (reviewPage++, renderReview()) }, 'weiter →'),
        )
      : null,
  );
}

function mergedSongs() {
  let count = 0;
  const songs = db.raw.songs.map((s) => {
    const r = results[s.id];
    const out = { ...s };
    if (r && (r.status === 'ok' || (r.decided && r.sp))) {
      out.sp = r.sp;
      if (r.img) out.img = r.img;
      else delete out.img;
      out.m = r.m;
    } else if (r && r.decided && !r.sp) {
      delete out.sp;
      delete out.img;
      out.m = 'none';
    }
    if (out.sp) count++;
    return out;
  });
  return { songs, count };
}

function renderExport() {
  const { count } = mergedSongs();
  fill($('export'), 
    h('h2', {}, '4. Ergebnis speichern'),
    h('p', {}, `${count} von ${db.songs.length} Songs haben eine Spotify-ID.`),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          type: 'button',
          class: 'primary',
          onclick: () => {
            const { songs } = mergedSongs();
            const data = { ...db.raw, songs, matched: new Date().toISOString().slice(0, 10) };
            const blob = new Blob([JSON.stringify(data) + '\n'], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: 'songs.json' });
            document.body.append(a);
            a.click();
            setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
          },
        },
        'songs.json herunterladen',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'small',
          onclick: () => {
            if (!confirm('Gesamten Abgleich-Fortschritt in diesem Browser löschen?')) return;
            results = {};
            save();
            render();
          },
        },
        'Fortschritt zurücksetzen',
      ),
    ),
    h('p', { class: 'hint' }, 'Die heruntergeladene Datei ersetzt im Repository die Datei data/songs.json (siehe Anleitung).'),
  );
}

function render() {
  renderLogin();
  renderRun();
  renderReview();
  renderExport();
}

async function boot() {
  const res = await fetch(new URL('../data/songs.json', import.meta.url), { cache: 'no-cache' });
  const raw = await res.json();
  db = await loadSongs();
  db.raw = raw;
  spotifyAuth.on('change', render);
  render();
}

boot().catch((e) => {
  document.querySelector('main').append(h('p', { class: 'error-text' }, `Fehler: ${e.message}`));
});
