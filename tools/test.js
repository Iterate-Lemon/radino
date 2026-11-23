// Funktionstest (Prototyp-Prüfung): Spotify-Login, verdecktes Abspielen, Netzwerk.

import { CONFIG } from '../config.js';
import { spotifyAuth, redirectUri } from '../src/music/spotify-auth.js';
import { SpotifyMusic } from '../src/music/spotify-music.js';
import { getMe } from '../src/music/spotify-api.js';
import { RelayPeer } from '../src/net/relay-peer.js';

const DEFAULT_TRACK = '4uLU6hMCjMI75M1A2tKUQC';
const music = new SpotifyMusic();
const $ = (id) => document.getElementById(id);
const out = { me: null, play: '', net: [] };

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const fill = (el, ...c) => el.replaceChildren(...c.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));

function renderSpotify() {
  fill(
    $('spotify'),
    h('h2', {}, '1. Spotify-Anmeldung'),
    h('p', { class: 'hint' }, `Redirect-URI dieser Installation (genau so im Dashboard eintragen): `, h('code', {}, redirectUri())),
    !spotifyAuth.configured
      ? h('p', { class: 'error-text' }, 'In config.js fehlt die Client-ID.')
      : spotifyAuth.loggedIn
        ? h('p', {}, 'Angemeldet', out.me ? ` als ${out.me}` : '', '. ', h('button', { type: 'button', class: 'small', onclick: () => spotifyAuth.logout() }, 'Abmelden'))
        : h('button', { type: 'button', class: 'primary', onclick: () => spotifyAuth.login() }, 'Bei Spotify anmelden'),
    h('p', {}, 'Player: ', h('span', { class: `badge s-${music.status}` }, music.status), ' ', music.message || ''),
    spotifyAuth.loggedIn && music.status !== 'ready'
      ? h('button', { type: 'button', onclick: () => music.connect() }, 'Player verbinden')
      : null,
  );
}

function renderPlay() {
  fill(
    $('play'),
    h('h2', {}, '2. Song verdeckt abspielen'),
    h('p', { class: 'hint' }, 'Spielt einen Track, ohne Titel oder Cover anzuzeigen. Achte darauf, ob irgendwo im Browser (z. B. Medien-Symbol oben rechts) der Titel erscheint.'),
    h('label', { class: 'field' }, 'Spotify-Track-ID ', h('input', { id: 'track', value: DEFAULT_TRACK, size: 26 })),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'primary', disabled: music.status !== 'ready', onclick: playTest }, 'Laden + abspielen'),
      h('button', { type: 'button', onclick: () => music.stop() }, 'Stopp'),
    ),
    out.play ? h('p', {}, out.play) : null,
  );
}

async function playTest() {
  music.activate();
  const id = $('track').value.trim();
  out.play = 'Lädt …';
  renderPlay();
  const t0 = performance.now();
  const r = await music.prepare(id, 0);
  const t1 = performance.now();
  if (!r.ok) {
    out.play = `Fehlgeschlagen: ${r.reason}`;
    return renderPlay();
  }
  await music.start();
  await new Promise((res) => setTimeout(res, 1500));
  const pos = await music.position();
  out.play = `OK – vorbereitet in ${Math.round(t1 - t0)} ms, Position nach 1,5 s: ${Math.round(pos)} ms. Hörst du Musik?`;
  renderPlay();
}

function renderNet() {
  fill(
    $('net'),
    h('h2', {}, '3. Verbindungstechnik'),
    h('button', { type: 'button', onclick: netTest }, 'Test starten'),
    h('ul', {}, out.net.map((l) => h('li', {}, l))),
  );
}

async function netTest() {
  out.net = ['läuft …'];
  renderNet();
  const lines = [];
  // Jeden Verbindungsdienst einzeln prüfen: zwei Teilnehmer in diesem Browser,
  // gleicher Code wie im Spiel, Nachricht hin und zurück.
  for (const url of CONFIG.relays) lines.push(await loopTest(url));
  const ok = lines.filter((l) => l.startsWith('✓')).length;
  lines.push(ok ? 'Ergebnis: Mitspielen klappt von diesem Gerät und Netz aus (ein erreichbarer Dienst genügt).' : 'Ergebnis: Kein Verbindungsdienst erreichbar. Blockiert ein Werbeblocker, eine Firewall oder das Netz WebSocket-Verbindungen?');
  out.net = lines;
  renderNet();
}

async function loopTest(url) {
  const name = new URL(url).hostname;
  const opts = { relays: [url], secret: 'funktionstest' };
  const a = new RelayPeer(opts);
  const b = new RelayPeer(opts);
  const opened = (p) => new Promise((res) => {
    p.on('open', () => res(true));
    p.on('error', () => res(false));
    setTimeout(() => res(false), 10000);
  });
  try {
    const t0 = performance.now();
    if (!(await opened(a)) || !(await opened(b))) return `✗ ${name}: nicht erreichbar`;
    a.on('connection', (conn) => conn.on('data', (d) => conn.send('pong:' + d)));
    const c = b.connect(a.id);
    return await new Promise((res) => {
      let sent = 0;
      c.on('open', () => {
        sent = performance.now();
        c.send('ping');
      });
      c.on('data', (d) => res(d === 'pong:ping' ? `✓ ${name}: erreichbar, Nachricht hin und zurück in ${Math.round(performance.now() - sent)} ms (Aufbau ${Math.round(sent - t0)} ms)` : `✗ ${name}: falsche Antwort`));
      setTimeout(() => res(`✗ ${name}: verbunden, aber keine Antwort`), 10000);
    });
  } finally {
    setTimeout(() => (a.destroy(), b.destroy()), 500);
  }
}

function render() {
  renderSpotify();
  renderPlay();
  renderNet();
}

music.on('status', render);
spotifyAuth.on('change', () => {
  if (spotifyAuth.loggedIn) music.connect();
  render();
});
if (spotifyAuth.loggedIn) {
  getMe()
    .then((me) => {
      out.me = me?.display_name || me?.id;
      render();
    })
    .catch(() => {});
  music.connect();
}
document.addEventListener('pointerdown', () => music.activate(), { capture: true });
render();
console.info('RaDino Funktionstest, Client-ID gesetzt:', !!CONFIG.spotifyClientId);
