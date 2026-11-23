// Funktionstest (Prototyp-Prüfung): Spotify-Login, verdecktes Abspielen, Netzwerk.

import { CONFIG } from '../config.js';
import { spotifyAuth, redirectUri } from '../src/music/spotify-auth.js';
import { SpotifyMusic } from '../src/music/spotify-music.js';
import { getMe } from '../src/music/spotify-api.js';
import { peerOptions } from '../src/net/peer-options.js';
import { watchIce } from '../src/net/peer-guest.js';

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
  // a) Vermittlungsdienst
  await new Promise((resolve) => {
    const p = new window.Peer({ debug: 0, ...peerOptions() });
    const done = (msg) => {
      lines.push(msg);
      p.destroy();
      resolve();
    };
    p.on('open', () => done('✓ Vermittlungsdienst (PeerJS) erreichbar'));
    p.on('error', (e) => done(`✗ Vermittlungsdienst nicht erreichbar (${e.type})`));
    setTimeout(() => done('✗ Vermittlungsdienst antwortet nicht'), 10000);
  });
  // b) Netzwerk-Kandidaten (STUN/TURN)
  const opts = peerOptions();
  const iceServers = opts.config?.iceServers || [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ];
  const pc = new RTCPeerConnection({ iceServers });
  pc.createDataChannel('t');
  const types = new Set();
  pc.onicecandidate = (e) => e.candidate && types.add(e.candidate.type || (e.candidate.candidate.match(/typ (\w+)/) || [])[1]);
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((r) => setTimeout(r, 6000));
  pc.close();
  lines.push(types.has('srflx') ? '✓ Öffentliche Adresse ermittelt (STUN)' : '✗ Keine öffentliche Adresse (STUN blockiert?)');
  lines.push(
    types.has('relay')
      ? '✓ Weiterleitungs-Server erreichbar (TURN) – Verbindungen klappen auch in schwierigen Netzen'
      : '– Kein Weiterleitungs-Server erreichbar (TURN). Meist trotzdem kein Problem; bei Verbindungsproblemen siehe Anleitung.',
  );
  // c) Selbsttest: zwei Teilnehmer im selben Browser, gleicher Code wie im Spiel
  lines.push(await loopTest());
  out.net = lines;
  renderNet();
}

async function loopTest() {
  const opts = { debug: 0, ...peerOptions() };
  const a = new window.Peer(opts);
  const b = new window.Peer(opts);
  const opened = (p) => new Promise((res) => {
    p.on('open', () => res(true));
    p.on('error', () => res(false));
    setTimeout(() => res(false), 10000);
  });
  try {
    if (!(await opened(a)) || !(await opened(b))) return '✗ Selbsttest: Vermittlungsdienst antwortet nicht';
    a.on('connection', (conn) => conn.on('data', (d) => conn.send('pong:' + d)));
    const c = b.connect(a.id, { reliable: true, serialization: 'raw' });
    const diag = watchIce(c, 'Selbsttest');
    return await new Promise((res) => {
      c.on('open', () => c.send('ping'));
      c.on('data', (d) => res(d === 'pong:ping' ? '✓ Selbsttest: Direktverbindung im selben Browser klappt (Spiel-Code in Ordnung)' : '✗ Selbsttest: falsche Antwort'));
      setTimeout(() => res(`✗ Selbsttest: keine Direktverbindung (Status: ${diag.ice}, Adressen: ${[...diag.local].join(', ') || 'keine'})`), 15000);
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
