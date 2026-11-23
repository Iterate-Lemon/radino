// Oberfläche von RaDino. Liest nur app.getState() und ruft nur app.actions.* auf
// (siehe docs/UI-SCHNITTSTELLE.md). Aufbau:
//   pixel.js  Pixelschrift, Dino, Symbole
//   skala.js  die Zeitleiste als Senderskala mit Songkarten
//   klang.js  leise Klänge zu Knöpfen und Animationen
//   namen.js  Namensvorschläge für die Startseite
//   ui.js     Bildschirme: Start, Verbinden, Lobby, Spiel (mit Spielende)
// Jeder Bildschirm wird einmal gebaut und danach nur aktualisiert, damit
// Animationen, Eingaben und Fokus erhalten bleiben.
// Sicherheit: Texte werden ausschließlich als Textknoten eingefügt (kein innerHTML).

import { h, erneuere } from './dom.js';
import { pixeltext, pixelzeile, kannPixel, dino, symbol, marke, wuerfel } from './pixel.js';
import { Skala, lueckenText } from './skala.js';
import { spiele, starteKlang, klangAn, schalteKlang } from './klang.js';
import { zufallsName } from './namen.js';

const MODE_TEXT = {
  host: ['Nur der Host spielt ab', 'Die anderen hören über einen Discord-Stream mit. Beliebig viele Spieler.'],
  everyone: ['Jeder hört selbst', 'Jeder braucht Spotify Premium. Höchstens 5 Konten.'],
  test: ['Testmodus ohne Musik', 'Zum Ausprobieren. Es wird nichts abgespielt.'],
};
const SPOTIFY_STATUS = {
  off: 'nicht verbunden',
  login: 'nicht angemeldet',
  connecting: 'verbindet …',
  ready: 'bereit',
  error: 'Fehler',
};
const CONNECTION = {
  idle: 'startet …',
  connecting: 'verbindet …',
  online: 'verbunden',
  retrying: 'Verbindung wird wiederhergestellt …',
  reconnecting: 'Verbindung wird wiederhergestellt …',
  'host-missing': 'Host nicht erreichbar …',
  rejected: 'abgelehnt',
  kicked: 'entfernt',
  error: 'Fehler',
};
const FAIL_REASON = {
  unavailable: 'Song nicht verfügbar',
  timeout: 'Song lädt nicht',
  'not-ready': 'Player nicht bereit',
  auth: 'Anmeldung abgelaufen',
  premium: 'Premium nötig',
  network: 'keine Verbindung',
  'rate-limit': 'zu viele Anfragen',
  'not-allowed': 'unbekannter Song',
  stalled: 'Player reagiert nicht',
  'no-ack': 'keine Rückmeldung',
  error: 'Fehler',
};
const AUDIO_STATE = { idle: 'bereit', preparing: 'lädt …', ready: 'bereit', playing: 'läuft', stopped: 'angehalten' };
const START_OFFSETS = [0, 30, 60];
const SEITE_BREIT = 1320; // übliche Breite der Seite (wie .seite in ui.css)
const KARTE_PLATZ = 98; // Platz je Karte auf der Skala, bei dem sie noch Titel und Interpret zeigt
const MARKEN_PLAETZE = 5; // so viele Marken kann ein Spieler höchstens haben
const SONGDATEN_URL = 'https://github.com/andygruber/songseeker-hitster-playlists';

// ── Bausteine ────────────────────────────────────────────────────────────────

// Text eines Hauptknopfs in Pixelschrift. Den Namen für Vorleseprogramme trägt der Knopf selbst.
function pixelLabel(label) {
  const s = pixeltext(label);
  s.removeAttribute('role');
  s.removeAttribute('aria-label');
  s.setAttribute('aria-hidden', 'true');
  return s;
}
// 'haupt' = die eine Hauptaktion (orange), 'neben' = Nebenaktion mit leichtem orangen Schimmer
const knopf = (label, onclick, cls = '', attrs = {}) => (cls.includes('haupt') || cls.includes('neben')
  ? h('button', { type: 'button', class: `knopf ${cls}`.trim(), onclick, 'aria-label': label, ...attrs }, pixelLabel(label))
  : h('button', { type: 'button', class: `knopf ${cls}`.trim(), onclick, ...attrs }, label));
const textknopf = (label, onclick, attrs = {}) => h('button', { type: 'button', class: 'textknopf', onclick, ...attrs }, label);
// Textknopf mit einem Pixel-Symbol davor
const symbolknopf = (name, label, onclick, attrs = {}) => h('button', { type: 'button', onclick, ...attrs, class: `textknopf mit-symbol ${attrs.class || ''}`.trim() }, symbol(name), h('span', {}, label));
const etikett = (text) => h('h2', { class: 'etikett' }, pixeltext(text));

// Regel „Marken“: der Markenstand als fünf Plätze, die belegten sind gefüllt.
// frisch = die zuletzt dazugekommene Marke blinkt kurz auf.
function markenReihe(n, frisch = false) {
  return h('span', { class: 'markenstand', role: 'img', 'aria-label': n === 1 ? '1 Marke' : `${n} Marken`, title: n === 1 ? '1 Marke' : `${n} Marken` },
    Array.from({ length: MARKEN_PLAETZE }, (_, i) => {
      const s = symbol(i < n ? 'marke' : 'platz');
      if (i >= n) s.classList.add('leer');
      else if (frisch && i === n - 1) s.classList.add('frisch');
      return s;
    }));
}
// Text mit einer Marke davor
const mitMarke = (tag, attrs, ...inhalt) => h(tag, { ...attrs, class: `${attrs.class || ''} mit-marke`.trim() }, marke(), h('span', {}, inhalt));

function wortmarke() {
  const ra = pixeltext('RA', 'ra');
  const dn = pixeltext('DINO', 'dn');
  for (const s of [ra, dn]) {
    s.removeAttribute('role');
    s.removeAttribute('aria-label');
    s.setAttribute('aria-hidden', 'true');
  }
  return h('span', { class: 'wortmarke', role: 'img', 'aria-label': 'RaDino' }, ra, dn);
}
const lockup = () => h('span', { class: 'lockup' }, dino('steht'), wortmarke());

// Überschrift in Pixelschrift. Enthält sie Zeichen, die die Pixelschrift nicht
// kennt (etwa in Spielernamen), erscheint sie in normaler Schrift.
function setzeTitel(el, text, klasse = '') {
  if (el.dataset.text === text && el.dataset.klasse === klasse) return;
  el.dataset.text = text;
  el.dataset.klasse = klasse;
  if (!kannPixel(text)) {
    el.className = `${klasse} klar`.trim();
    el.style.removeProperty('--p');
    el.replaceChildren(text);
    return;
  }
  const zeile = pixelzeile(text);
  const spalten = [...zeile.children].reduce((sum, s) => sum + Number(s.dataset.cols) + 4, 0);
  el.className = klasse;
  if (spalten > 150) el.style.setProperty('--p', '4px');
  else el.style.removeProperty('--p');
  el.replaceChildren(zeile);
}

// Rückfrage im Stil der Oberfläche. Liefert true bei Bestätigung.
function frage(text, bestaetigen, { abbrechen = 'Abbrechen', inhalt = null } = {}) {
  return new Promise((resolve) => {
    let antwort = false;
    const d = h('dialog', { class: 'frage' },
      h('p', {}, text),
      inhalt,
      h('div', { class: 'frage-knoepfe' },
        abbrechen ? knopf(abbrechen, () => d.close()) : null,
        knopf(bestaetigen, () => { antwort = true; d.close(); }, 'haupt')));
    d.addEventListener('close', () => { d.remove(); resolve(antwort); });
    document.body.append(d);
    d.showModal();
  });
}

// Falls die Zwischenablage gesperrt ist: Link zum Markieren anzeigen.
function zeigeLink(url) {
  const feld = h('input', { class: 'linkfeld', readonly: true, value: url, 'aria-label': 'Einladungslink', onfocus: (e) => e.target.select() });
  frage('Der Link ließ sich nicht automatisch kopieren. Bitte von Hand kopieren:', 'Fertig', { abbrechen: null, inhalt: feld });
  feld.focus();
}

async function kopiereLink(app) {
  const url = app.getState().room?.inviteUrl;
  const ok = await app.actions.copyInvite();
  if (!ok && url) zeigeLink(url);
}

function fehlerKasten(text, aktionen) {
  return h('div', { class: 'melde fehler', role: 'alert' }, h('p', {}, text), h('div', { class: 'melde-aktionen' }, aktionen));
}

function spotifyTeile(state, a) {
  const sp = state.spotify;
  const status = h('span', { class: `punkt-status ${sp.status === 'ready' ? '' : sp.status === 'error' ? 'fehler' : 'warn'}`.trim() },
    `Spotify: ${SPOTIFY_STATUS[sp.status] || sp.status}`);
  const teile = [];
  if (!sp.configured) {
    teile.push(h('div', { class: 'zeile' }, status));
    teile.push(h('p', { class: 'klein fehlertext' }, 'In config.js ist noch keine Spotify-Client-ID eingetragen (siehe Anleitung).'));
    return teile;
  }
  if (!sp.loggedIn || sp.status === 'login') {
    teile.push(h('div', { class: 'zeile' }, status, knopf('Bei Spotify anmelden', a.spotifyLogin, '', { 'data-fk': 'sp-login' })));
    teile.push(h('p', { class: 'klein' }, 'Es öffnet sich ein kleines Fenster. Nötig: Spotify Premium und ein vom Einrichter freigeschaltetes Konto.'));
  } else {
    teile.push(h('div', { class: 'zeile' }, status, textknopf('Abmelden', a.spotifyLogout, { 'data-fk': 'sp-logout' })));
  }
  if (sp.message) teile.push(h('p', { class: `klein ${sp.status === 'error' ? 'fehlertext' : ''}`.trim() }, sp.message));
  return teile;
}

// Kopfzeile im Raum: Schriftzug, Spielstand, Verbindung, Verlassen.
function baueKopf(app) {
  const lage = h('span', { class: 'lage' });
  const status = h('span', { class: 'punkt-status', role: 'status' });
  const raus = h('span', {});
  const el = h('header', { class: 'kopf' }, lockup(), lage, status, raus);
  return {
    el,
    // halten = true: Die Lage bleibt stehen, solange sich eine Karte noch umdreht (sie verriete sonst das Ergebnis).
    update(state, halten = false) {
      const r = state.room;
      const g = r.game;
      const laeuft = g && (g.phase === 'turn' || g.phase === 'challenge' || g.phase === 'reveal');
      if (!halten) {
      // Ist das Kartenziel erreicht, steht hier, wie es um das Spielende steht.
      const namen = (ids) => (ids || []).map((id) => (id === r.me ? 'du' : g.players.find((p) => p.id === id)?.name ?? '?')).join(' & ');
      const ch = laeuft ? g.chase : null;
      const ziel = !laeuft ? '' : !ch ? `Ziel: ${g.settings.target} Karten`
        : g.out?.length || ch.ids.length > 1 ? `Gleichstand bei ${ch.count} Karten: ${namen(ch.ids)}`
          : `Letzte Runde: ${namen(ch.ids)} ${ch.ids[0] === r.me ? 'hast' : 'hat'} ${ch.count} Karten`;
      lage.textContent = laeuft
        ? `Karte ${g.round}  ·  noch ${g.deckLeft.toLocaleString('de-DE')} im Stapel  ·  ${ziel}`
        : '';
      lage.classList.toggle('hell', laeuft && !!ch);
      }
      const c = r.connection;
      status.className = `punkt-status ${c === 'online' ? '' : ['rejected', 'kicked', 'error'].includes(c) ? 'fehler' : 'warn'}`.trim();
      status.textContent = CONNECTION[c] || c;
      erneuere(raus, r.isHost, () => textknopf(r.isHost ? 'Raum schließen' : 'Verlassen', async () => {
        const ok = await frage(r.isHost ? 'Raum schließen? Das Spiel endet für alle.' : 'Raum verlassen?', r.isHost ? 'Schließen' : 'Verlassen');
        if (ok) app.actions.leaveRoom();
      }, { 'data-fk': 'raus' }));
    },
  };
}

// Meldungen unter der Kopfzeile: Fehler, Verbindungsprobleme, Spotify im laufenden Spiel.
function baueMeldungen(app, { spotify = false } = {}) {
  const a = app.actions;
  const el = h('div', { class: 'meldungen' });
  return {
    el,
    update(state) {
      const r = state.room;
      const sp = state.spotify;
      const raus = r && ['rejected', 'kicked'].includes(r.connection);
      const gestoert = r && r.connection !== 'online' && !raus;
      const spZeigen = spotify && sp.needed && sp.status !== 'ready';
      erneuere(el, [state.error, raus, gestoert && [r.connection, r.connectionMessage], spZeigen && sp], () => [
        state.error ? fehlerKasten(state.error, raus ? knopf('Zur Startseite', a.leaveRoom) : knopf('OK', a.dismissError, '', { 'data-fk': 'fehler-ok' })) : null,
        gestoert ? h('div', { class: 'melde warn', role: 'status' },
          h('p', {}, CONNECTION[r.connection] || r.connection, r.connectionMessage ? h('span', { class: 'leise' }, ` ${r.connectionMessage}`) : null)) : null,
        spZeigen ? h('div', { class: 'melde warn' }, spotifyTeile(state, a)) : null,
      ]);
    },
  };
}

function naechsterSpieler(g, aktivId) {
  const n = g.order.length;
  const idx = g.order.indexOf(aktivId);
  if (!n || idx < 0) return null;
  const raus = g.out || [];
  for (let i = 1; i <= n; i++) {
    const p = g.players.find((x) => x.id === g.order[(idx + i) % n]);
    if (p?.connected && !raus.includes(p.id)) return p;
  }
  return g.players.find((x) => x.id === g.order[(idx + 1) % n]) || null;
}

function musikMarke(g, p) {
  const mode = g.settings.mode;
  const hoert = mode === 'everyone' || mode === 'test' || (mode === 'host' && p.host);
  const au = g.audio?.[p.id];
  if (!hoert || !au) return null;
  if (typeof au.play === 'string' && au.play.startsWith('failed')) {
    const grund = au.play.split(':')[1];
    return { text: FAIL_REASON[grund] || 'Musikfehler', art: 'fehler' };
  }
  if (au.play === 'late') return { text: 'Musik verspätet', art: 'warn' };
  if (au.s && au.s !== 'ready') return { text: `Musik: ${SPOTIFY_STATUS[au.s] || au.s}`, art: au.s === 'error' ? 'fehler' : 'warn' };
  return { text: 'Musik bereit', art: '' };
}

// Regel „Marken“: wer die Karte bekommen hat. Ältere Spielstände kannten nur einen Dieb.
const diebeVon = (c) => (Array.isArray(c?.wonBy) ? c.wonBy : c?.wonBy ? [c.wonBy] : []);
// „Anna“, „Anna und Ben“, „Anna, Ben und Cem“
const aufzaehlen = (namen) => (namen.length < 2 ? namen.join('') : `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`);

// ── Start ────────────────────────────────────────────────────────────────────

function startAnsicht(app) {
  const a = app.actions;
  const meldung = h('div', { class: 'meldungen' });
  const formPlatz = h('div', {});
  const gespeichert = h('div', {});
  const fuss = h('p', { class: 'fuss' });
  let eingabe = null;
  // Namensvorschlag: Wer noch keinen Namen gespeichert hat, findet einen gewürfelten im Feld.
  // Gespeichert wird er erst, wenn man damit ein Spiel erstellt oder beitritt.
  let vorschlag = app.getState().name ? null : zufallsName();
  let augen = 1 + Math.floor(Math.random() * 6);

  const laeufer = h('div', { class: 'laeufer' }, dino('steht'));
  const deko = h('div', { class: 'dekoskala', 'aria-hidden': 'true' },
    h('div', { class: 'strich-linie' }),
    h('ol', {}, [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((j) => h('li', {}, pixeltext(j)))),
    laeufer);

  const el = h('main', { class: 'seite start' },
    h('div', { class: 'start-inhalt' },
      h('h1', {}, wortmarke()),
      h('p', { class: 'unterzeile' }, 'Das Musik-Zeitleisten-Spiel für Freunde.'),
      meldung, formPlatz, gespeichert),
    deko, fuss);

  // Der Dino läuft auf der Skala der Maus hinterher, in ganzen Pixelschritten.
  let x = null;
  let ziel = null;
  let pose = 'steht';
  const stelle = (neu) => { if (neu !== pose) { pose = neu; laeufer.replaceChildren(dino(neu)); } };
  const bewege = (e) => {
    const r = deko.getBoundingClientRect();
    ziel = Math.min(Math.max(e.clientX - r.left, 60), r.width - 60);
  };
  const takt = setInterval(() => {
    if (x === null) {
      if (!deko.clientWidth) return;
      x = Math.round(deko.clientWidth * 0.62);
      ziel = x;
      laeufer.style.transform = `translateX(${x}px)`;
    }
    const d = ziel - x;
    if (Math.abs(d) < 10) return stelle('steht');
    x += Math.sign(d) * 10;
    laeufer.classList.toggle('links', d < 0);
    stelle(pose === 'hinten' ? 'vorn' : 'hinten');
    laeufer.style.transform = `translateX(${x}px)`;
  }, 110);
  window.addEventListener('pointermove', bewege);

  function update(state) {
    erneuere(meldung, state.error, () => (state.error ? fehlerKasten(state.error, knopf('OK', a.dismissError, '', { 'data-fk': 'fehler-ok' })) : null));

    const beitreten = !!state.invite;
    erneuere(formPlatz, beitreten, () => {
      eingabe = h('input', {
        maxlength: 24, value: state.name || vorschlag || '', placeholder: 'z. B. Anna', autocomplete: 'nickname', 'data-fk': 'name',
        onchange: (e) => a.setName(e.target.value),
      });
      // Der Würfel schlägt einen neuen Namen vor. Er kippt dabei einmal ums Eck und zeigt danach eine andere Zahl.
      const wuerfelKnopf = h('button', {
        type: 'button', class: 'wuerfel-knopf', 'aria-label': 'Neuen Namen würfeln', title: 'Neuen Namen würfeln',
        'data-fk': 'wuerfeln', 'data-klang': 'aus',
        onclick: () => {
          vorschlag = zufallsName(Math.random, eingabe.value);
          augen = 1 + ((augen + Math.floor(Math.random() * 5)) % 6);
          wuerfelKnopf.replaceChildren(wuerfel(augen));
          wuerfelKnopf.classList.remove('rollt');
          void wuerfelKnopf.offsetWidth;
          wuerfelKnopf.classList.add('rollt');
          spiele('wuerfel');
          eingabe.value = vorschlag;
          a.setName(vorschlag);
        },
      }, wuerfel(augen));
      const los = (e) => {
        e.preventDefault();
        a.setName(eingabe.value);
        if (beitreten) a.joinRoom();
        else a.createRoom();
      };
      return [
        beitreten ? h('p', { class: 'einladung' }, 'Du wurdest zu einem Spiel eingeladen.') : null,
        h('form', { class: 'start-form', onsubmit: los },
          h('label', { class: 'feld' }, h('span', { class: 'etikett' }, pixeltext('Dein Name')), h('span', { class: 'name-zeile' }, eingabe, wuerfelKnopf)),
          h('button', { type: 'submit', class: 'knopf haupt', 'data-fk': 'los', 'aria-label': beitreten ? 'Beitreten' : 'Spiel erstellen' },
            pixelLabel(beitreten ? 'Beitreten' : 'Spiel erstellen'))),
        beitreten ? null : h('p', { class: 'hinweis' }, 'Du wirst Host: Dein Tab muss während des Spiels offen bleiben.'),
      ];
    });
    const name = state.name || vorschlag || '';
    if (eingabe && document.activeElement !== eingabe && eingabe.value !== name) eingabe.value = name;

    const s = state.savedRoom && !beitreten ? state.savedRoom : null;
    erneuere(gespeichert, s && [s.savedAt, s.players], () => {
      if (!s) return null;
      const minuten = Math.max(1, Math.round((Date.now() - s.savedAt) / 60000));
      return h('div', { class: 'gespeichert' },
        h('p', {}, h('span', { class: 'leise' }, 'Laufendes Spiel '), `vor ${minuten} Min. gespeichert, ${s.players} Spieler`),
        textknopf('Fortsetzen', a.resumeRoom, { 'data-fk': 'weiter' }),
        textknopf('Verwerfen', a.discardSavedRoom, { 'data-fk': 'weg' }));
    });

    erneuere(fuss, [state.songCount, state.playableCount], () => [
      `${state.songCount.toLocaleString('de-DE')} Songs, davon ${state.playableCount.toLocaleString('de-DE')} mit Spotify verknüpft. Songdaten: `,
      h('a', { href: SONGDATEN_URL, target: '_blank', rel: 'noopener noreferrer' }, 'songseeker-hitster-playlists'),
      ' (MIT-Lizenz). Musik über Spotify.',
    ]);
  }

  return { el, update, weg: () => { window.removeEventListener('pointermove', bewege); clearInterval(takt); } };
}

// ── Verbinden (Gast wartet auf den ersten Spielstand) ────────────────────────

function verbindenAnsicht(app) {
  const kopf = baueKopf(app);
  const meldungen = baueMeldungen(app);
  const titel = h('h1');
  setzeTitel(titel, 'Verbinde …');
  const el = h('div', { class: 'seite' }, kopf.el, meldungen.el,
    h('main', {}, h('div', { class: 'ansage' }, h('div', { class: 'links' }, titel,
      h('p', { class: 'unter' }, 'Der Raum wird gesucht. Der Tab des Hosts muss geöffnet sein.')))));
  return { el, update(state) { kopf.update(state); meldungen.update(state); } };
}

// ── Lobby ────────────────────────────────────────────────────────────────────

function lobbyAnsicht(app) {
  const a = app.actions;
  const kopf = baueKopf(app);
  const meldungen = baueMeldungen(app);
  const titel = h('h1');
  const unter = h('p', { class: 'unter' });
  const einladen = h('section', { class: 'block' });
  const spieler = h('section', { class: 'block' });
  const spotify = h('section', { class: 'block' });
  const musik = h('section', { class: 'block' });
  const regeln = h('section', { class: 'block' });
  const editionen = h('section', { class: 'block' });
  const startleiste = h('div', {});
  setzeTitel(titel, 'Lobby');

  const el = h('div', { class: 'seite' }, kopf.el, meldungen.el,
    h('main', {},
      h('div', { class: 'ansage' }, h('div', { class: 'links' }, titel, unter)),
      h('div', { class: 'lobby-raster' }, h('div', {}, einladen, spieler, spotify), h('div', {}, musik, regeln, editionen)),
      startleiste));

  function update(state) {
    const r = state.room;
    const g = r.game;
    const s = g.settings;
    const edit = r.can.editSettings;
    kopf.update(state);
    meldungen.update(state);
    unter.textContent = r.isHost ? 'Lade deine Freunde ein und stell das Spiel ein.' : 'Gleich geht es los. Der Host stellt das Spiel ein und startet.';

    erneuere(einladen, [r.isHost, r.inviteUrl, s.mode], () => (r.isHost ? [
      etikett('Einladen'),
      h('div', { class: 'linkzeile' },
        h('input', { class: 'linkfeld', readonly: true, value: r.inviteUrl, 'aria-label': 'Einladungslink', 'data-fk': 'link', onfocus: (e) => e.target.select() }),
        knopf('Link kopieren', () => kopiereLink(app), '', { 'data-fk': 'kopieren' })),
      h('p', { class: 'klein' }, 'Wer den Link hat, kann beitreten. Gib ihn nur an Freunde.'),
      s.mode === 'host' ? h('p', { class: 'klein' }, 'Damit die anderen mithören: Teile diesen Tab mit Ton in Discord (Bildschirm übertragen → Tab mit Audio).') : null,
    ] : [
      etikett('Warte auf den Start'),
      h('p', {}, 'Der Host startet das Spiel, sobald alle da sind.'),
    ]));

    erneuere(spieler, [g.players, g.audio, r.can.kick, r.me, s.mode], () => [
      etikett(`Spieler · ${g.players.length}`),
      h('ul', { class: 'spieler' }, g.players.map((p) => {
        const m = p.connected ? musikMarke(g, p) : null;
        return h('li', { class: p.connected ? '' : 'getrennt' },
          h('span', { class: 'name' }, p.name),
          p.host ? h('span', { class: 'marke' }, 'Host') : null,
          p.id === r.me ? h('span', { class: 'marke' }, 'du') : null,
          !p.connected ? h('span', { class: 'punkt-status aus' }, 'getrennt')
            : m ? h('span', { class: `punkt-status ${m.art}`.trim() }, m.text)
              : h('span', { class: 'punkt-status' }, 'verbunden'),
          r.can.kick && !p.host ? textknopf('entfernen', async () => {
            if (await frage(`${p.name} aus dem Raum entfernen?`, 'Entfernen')) a.kick(p.id);
          }, { 'data-fk': `kick-${p.id}` }) : null);
      })),
    ]);

    spotify.hidden = !state.spotify.needed;
    erneuere(spotify, state.spotify.needed && state.spotify, () => (state.spotify.needed ? [etikett('Spotify'), spotifyTeile(state, a)] : null));

    const modi = ['host', 'everyone', ...(state.testMode || s.mode === 'test' ? ['test'] : [])];
    erneuere(musik, [modi, s.mode, edit], () => [
      etikett('Musik'),
      modi.map((m) => h('label', { class: `wahl${edit ? '' : ' fest'}` },
        h('input', { type: 'radio', name: 'modus', value: m, checked: s.mode === m, disabled: !edit, 'data-fk': `modus-${m}`, onchange: () => a.updateSettings({ mode: m }) }),
        h('span', { class: 'knopfpunkt' }),
        h('span', {}, h('b', {}, MODE_TEXT[m][0]), h('span', { class: 'text' }, MODE_TEXT[m][1])))),
    ]);

    erneuere(regeln, [s.target, s.startAt, s.tokens, edit], () => [
      etikett('Regeln'),
      h('div', { class: 'zeile' }, h('span', {}, 'Karten zum Sieg ', h('span', { class: 'leise' }, '(mit Startkarte)')),
        h('div', { class: 'zaehlwerk' },
          h('button', { type: 'button', 'aria-label': 'weniger', disabled: !edit || s.target <= 2, 'data-fk': 'ziel-minus', onclick: () => a.updateSettings({ target: s.target - 1 }) }, '−'),
          h('output', { 'aria-label': `${s.target} Karten` }, pixeltext(s.target)),
          h('button', { type: 'button', 'aria-label': 'mehr', disabled: !edit || s.target >= 30, 'data-fk': 'ziel-plus', onclick: () => a.updateSettings({ target: s.target + 1 }) }, '+'))),
      h('div', { class: 'zeile' }, h('span', {}, 'Abspielen ab'),
        h('div', { class: 'segmente', role: 'group', 'aria-label': 'Abspielen ab' }, START_OFFSETS.map((v) => h('button', {
          type: 'button', 'aria-pressed': String(s.startAt === v), disabled: !edit, 'data-fk': `ab-${v}`,
          onclick: () => a.updateSettings({ startAt: v }),
        }, v === 0 ? 'Songanfang' : `Sekunde ${v}`)))),
      // Regel „Marken“: ein Schiebeschalter wie an einem Radio
      h('div', { class: 'zeile' },
        h('span', {}, mitMarke('span', {}, 'Marken'),
          h('span', { class: 'klein regeltext' }, 'Wer eine Marke einsetzt, zweifelt eine gelegte Karte an und bekommt sie, wenn der eigene Tipp stimmt.')),
        h('button', {
          type: 'button', class: 'schalter', role: 'switch', 'aria-checked': String(!!s.tokens), 'aria-label': 'Marken', disabled: !edit, 'data-fk': 'marken',
          onclick: () => a.updateSettings({ tokens: !s.tokens }),
        }, pixelLabel(s.tokens ? 'An' : 'Aus'), h('span', { class: 'bahn' }))),
    ]);

    erneuere(editionen, [state.editions, s.editions, s.mode, edit], () => [
      etikett('Editionen'),
      h('div', { class: 'editionen' }, state.editions.map((e) => h('label', { class: `haken${edit ? '' : ' fest'}` },
        h('input', {
          type: 'checkbox', checked: s.editions.includes(e.id), disabled: !edit, 'data-fk': `ed-${e.id}`,
          onchange: (ev) => {
            const set = new Set(s.editions);
            if (ev.target.checked) set.add(e.id);
            else set.delete(e.id);
            a.updateSettings({ editions: [...set] });
          },
        }),
        h('span', { class: 'kasten' }, symbol('haken')),
        h('span', { class: 'ename' }, e.name),
        h('span', { class: 'anzahl', title: s.mode === 'test' ? `${e.count} Songs` : `${e.playable} von ${e.count} Songs spielbar` },
          s.mode === 'test' ? e.count : e.playable === e.count ? e.count : `${e.playable}/${e.count}`)))),
    ]);

    erneuere(startleiste, [r.isHost, r.can.start, r.startBlocker, g.players.length], () => (r.isHost ? h('div', { class: 'startleiste' },
      knopf('Spiel starten', a.startGame, 'haupt', { disabled: !r.can.start, 'data-fk': 'start' }),
      h('span', { class: 'leise' }, r.startBlocker || `${g.players.length} Spieler im Raum`)) : null));
  }

  return { el, update };
}

// ── Spiel (Zug, Aufdecken, Spielende) ────────────────────────────────────────

function spielAnsicht(app) {
  const a = app.actions;
  const kopf = baueKopf(app);
  const meldungen = baueMeldungen(app, { spotify: true });
  const titel = h('h1');
  const unter = h('p', { class: 'unter' });
  const tonStatus = h('span', { class: 'ton-status' });
  const tonKnoepfe = h('span', { class: 'ton-knoepfe' });
  const tonMerken = h('span', { class: 'ton-knoepfe' }); // aktuelles Lied im eigenen Spotify-Konto speichern
  const regler = h('input', { type: 'range', min: 0, max: 1, step: 0.05, 'aria-label': 'Lautstärke', oninput: (e) => a.setVolume(e.target.value) });
  const lautstaerke = h('label', { class: 'lautstaerke' }, 'Lautstärke', regler);
  const ton = h('div', { class: 'ton' }, tonStatus, tonKnoepfe, tonMerken, lautstaerke);
  const aktion = h('div', { class: 'aktion' });
  const reihenPlatz = h('div', {});
  const verlauf = h('ol', { class: 'verlauf' });
  const verlaufBlock = h('section', {}, etikett('Verlauf'), verlauf);
  const hostleiste = h('div', {});
  // Regel „Marken“: die Frist zum Anzweifeln als Skalenstriche, die nacheinander erlöschen
  const FRIST_STRICHE = 20; // ein Strich je Sekunde (TOKENS.challengeMs in src/core/game.js)
  const fristStriche = h('span', { class: 'frist-striche', 'aria-hidden': 'true' }, Array.from({ length: FRIST_STRICHE }, () => h('i')));
  const fristZahl = h('span', { class: 'frist-zahl', 'aria-hidden': 'true' });
  const frist = h('span', { class: 'frist', role: 'timer', hidden: true }, fristStriche, fristZahl);
  let fristSek = null;
  const protokoll = h('ol', { class: 'protokoll-liste' });
  const protokollZahl = h('span', { class: 'p-zahl' });
  const protokollBlock = h('details', { class: 'protokoll' },
    h('summary', { 'data-fk': 'protokoll' }, h('span', { class: 'klappe', 'aria-hidden': 'true' }), h('span', { class: 'etikett' }, pixeltext('Marken-Protokoll')), protokollZahl),
    protokoll);
  const markenVorher = new Map(); // Markenstand je Spieler beim letzten Zeichnen
  const tick = () => {
    const ende = app.getState().room?.challenge?.endsAt;
    const sek = ende ? Math.max(0, Math.ceil((ende - Date.now()) / 1000)) : null;
    if (sek === fristSek) return;
    fristSek = sek;
    frist.hidden = sek === null;
    if (sek === null) return;
    [...fristStriche.children].forEach((el, i) => el.classList.toggle('aus', i >= sek));
    fristZahl.replaceChildren(pixeltext(sek));
    frist.classList.toggle('knapp', sek <= 3);
    frist.setAttribute('aria-label', `noch ${sek} Sekunden`);
  };
  const uhrTimer = setInterval(tick, 250);
  let tot = false;
  let gesehen = { runde: null, locked: false };
  let rollt = null; // Runde, deren Karte sich gerade umdreht
  let endeRuhig = false; // Spielende: Siegkarte ist gelandet, die Skala rückt nach oben
  let endeTimer = null;
  let klaut = null; // Runde, deren Karte gerade zu einem Anzweifler wandert
  let gelandet = null; // eben geklaute Karte (Song-ID): blinkt kurz in der Zeile des Diebs
  let tippStand = { runde: null, zahl: 0 }; // wie viele Anzweifler in dieser Runde schon getippt haben (für den Klang)
  let landeTimer = null;

  const zweifleAn = () => {
    const s = skala.tippWahl?.slot;
    if (s !== null && s !== undefined) a.challenge(s);
  };
  const skala = new Skala({
    onSelect: (i) => { a.selectSlot(i); update(app.getState()); },
    onLock: () => a.lockIn(),
    onTipp: () => update(app.getState()),
    onTippFest: zweifleAn,
  });
  // Wohin eine geklaute Karte fliegt: an ihren Platz in der Zeile des Diebs.
  const zielDerKarte = (spielerId, platz) => {
    const mini = [...reihenPlatz.querySelectorAll('.reihe')].find((el) => el.dataset.spieler === spielerId)?.querySelector('.mini');
    return mini?.children[platz] || mini?.lastElementChild || mini || null;
  };

  const el = h('div', { class: 'seite spiel' }, kopf.el, meldungen.el,
    h('main', {},
      h('div', { class: 'ansage' }, h('div', { class: 'links' }, titel, unter), ton),
      skala.el,
      aktion,
      h('div', { class: 'unten' },
        h('section', {}, etikett('Zeitleisten'), reihenPlatz),
        verlaufBlock),
      hostleiste,
      protokollBlock));

  function update(state) {
    if (tot || !state.room?.game) return;
    const r = state.room;
    const g = r.game;
    const c = g.card;
    const diebe = diebeVon(c);
    const spieler = (id) => g.players.find((p) => p.id === id) || null;
    meldungen.update(state);
    // Die Seite wächst mit der längsten Zeitleiste, damit die Karten möglichst lange in
    // voller Größe nebeneinander passen. Sie richtet sich nach allen Spielern, damit die
    // Breite nicht bei jedem Zug springt. Schmaler als das Fenster wird sie dadurch nie.
    const plaetze = Math.max(0, ...g.players.map((p) => p.timeline.length)) + 1;
    const bedarf = plaetze * KARTE_PLATZ + 10 + 96;
    el.style.maxWidth = bedarf > SEITE_BREIT ? `${bedarf}px` : '';

    // Aufdecken inszenieren: Wird die eben noch verdeckte Karte festgelegt, dreht sie
    // sich erst um und die Ziffern rasten ein. So lange bleibt die Auflösung verborgen.
    if (c?.locked && c.song && gesehen.runde === c.round && !gesehen.locked && rollt !== c.round) {
      rollt = c.round;
      gesehen = { runde: c.round, locked: true };
      skala.rolle(c.song).then(() => {
        if (rollt !== c.round) return;
        rollt = null;
        // Regel „Marken“: Haben Anzweifler die Karte bekommen, wandert sie jetzt zu ihnen.
        const diebe = diebeVon(c);
        if (diebe.length) klaut = c.round;
        update(app.getState());
        if (klaut !== c.round) return;
        const jetzt = app.getState().room;
        const sp = (id) => jetzt?.game?.players.find((p) => p.id === id);
        const ich = diebe.includes(jetzt?.me);
        // Namensschild: „Du klaust“, „Anna klaut“, „Anna & Ben klauen“, „Du & Anna klaut“
        const reihe = ich ? [jetzt.me, ...diebe.filter((id) => id !== jetzt.me)] : diebe;
        const namen = reihe.map((id) => (id === jetzt?.me ? 'Du' : sp(id)?.name ?? '?'));
        const schild = reihe.length === 1 ? (ich ? 'Du klaust' : `${namen[0]} klaut`) : `${namen.join(' & ')} ${ich ? 'klaut' : 'klauen'}`;
        const ziele = () => diebe.map((id) => zielDerKarte(id, sp(id) ? sp(id).timeline.findIndex((s) => s.id === c.song.id) : 0));
        skala.klau(schild, ziele).then(() => {
          if (klaut !== c.round) return;
          klaut = null;
          gelandet = c.song.id;
          clearTimeout(landeTimer);
          landeTimer = setTimeout(() => { gelandet = null; update(app.getState()); }, 2400);
          update(app.getState());
        });
      });
    }
    if (rollt !== null && (!c || c.round !== rollt)) rollt = null;
    if (klaut !== null && (!c || c.round !== klaut || g.phase !== 'reveal' || !diebeVon(c).length)) { klaut = null; skala.klauAbbruch(); }
    if (rollt === null) gesehen = { runde: c?.round ?? null, locked: !!c?.locked };
    const verdeckt = rollt !== null;
    kopf.update(state, verdeckt);

    const phase = verdeckt ? 'turn' : g.phase;
    const mitMarken = !!g.settings.tokens;
    // Klang, sobald jemand eine Marke steckt: auch für verdeckte Tipps, man hört nur, dass, nicht wo.
    // Nicht beim ersten Zeichnen einer Runde (Neuladen) und nicht beim Aufdecken.
    if (mitMarken && g.phase === 'challenge' && c?.challenge) {
      const zahl = c.challenge.picks.length;
      if (tippStand.runde === c.round && zahl > tippStand.zahl) spiele('tipp');
      tippStand = { runde: c.round, zahl };
    }
    const wer = (id) => (id === r.me ? 'du' : spieler(id)?.name ?? '?');
    const aktiv = spieler(c?.by ?? g.activeId);
    const ichDran = !!aktiv && aktiv.id === r.me;
    const darfWaehlen = r.can.select && !verdeckt;

    // Wessen Zeitleiste auf der Skala hängt
    let zeige = aktiv;
    if (phase === 'ended') zeige = r.winners[0] || aktiv;
    let stationen = zeige ? zeige.timeline : [];
    if (verdeckt && c.correct) stationen = stationen.filter((s) => s.id !== c.song.id);

    let modus = 'ruhe';
    if (phase === 'turn' || phase === 'challenge') modus = darfWaehlen ? 'waehlen' : 'zuschauen';
    else if (phase === 'reveal') modus = 'offen';
    else if (c?.locked && c.song && zeige && c.by === zeige.id && !endeRuhig) modus = 'offen';
    // Am Spielende wird der Platz über der Skala nicht mehr gebraucht: Kurz nachdem
    // die Siegkarte gelandet ist, rückt die Skala nach oben und der Dino feiert darauf.
    if (phase !== 'ended') {
      endeRuhig = false;
      clearTimeout(endeTimer);
      endeTimer = null;
    } else if (modus === 'offen' && !endeTimer) {
      endeTimer = setTimeout(() => { endeRuhig = true; update(app.getState()); }, 1400);
    }
    skala.el.hidden = !zeige;
    // Regel „Marken“: die Marken der Anzweifler auf der Skala, nach dem Aufdecken mit Urteil.
    // Vorher kennt der Spielstand die Lücken der anderen nicht: Dann steckt nur die eigene Marke.
    let zweifel = null;
    if (mitMarken && c?.challenge && (modus === 'zuschauen' || modus === 'offen')) {
      const offen = modus === 'offen';
      // Liegt die neue Karte schon in der Zeitleiste, rücken die Lücken rechts von ihr um eins weiter.
      const neu = offen && c.correct ? stationen.findIndex((s) => s.id === c.song.id) : -1;
      const eigene = r.challenge?.mine ?? null;
      const gesteckt = c.locked ? c.challenge.picks : eigene !== null ? [{ p: r.me, slot: eigene }] : [];
      zweifel = {
        frei: phase === 'challenge' && r.can.challenge && r.challenge ? r.challenge.freeSlots : [],
        tipps: gesteckt.map((t) => ({
          key: t.p,
          slot: neu >= 0 && t.slot > neu ? t.slot + 1 : t.slot,
          name: wer(t.p),
          ich: t.p === r.me,
          urteil: !offen ? null : !c.correct && c.correctSlots?.includes(t.slot) ? 'gut' : 'schlecht',
        })),
      };
    }
    skala.update({
      stations: stationen,
      slot: c?.slot ?? null,
      mode: modus,
      reveal: modus === 'offen' ? c : null,
      runde: c?.round ?? null,
      dino: phase === 'ended' && r.winners.length > 0,
      fest: !!c?.fixed,
      zweifel,
      dieb: diebe.length ? aufzaehlen(diebe.map((id) => (id === r.me ? 'dir' : spieler(id)?.name ?? '?'))) : null,
      geklaut: diebe.length > 0 && klaut !== c.round,
    });
    const slot = modus === 'waehlen' ? skala.view.slot : c?.slot ?? null;
    const tipp = skala.tippWahl?.slot ?? null;

    // Überschrift
    el.classList.toggle('ende', phase === 'ended');
    if (phase === 'ended') {
      const namen = r.winners.map((p) => p.name);
      const nurIch = r.winners.length === 1 && r.winners[0].id === r.me;
      setzeTitel(titel, !namen.length ? 'Spiel beendet.' : nurIch ? 'Du gewinnst!' : `${namen.join(' & ')} ${namen.length > 1 ? 'gewinnen' : 'gewinnt'}!`, namen.length ? 'gut' : '');
      const grund = g.endReason === 'target' ? `${Math.max(g.settings.target, r.winners[0]?.timeline.length ?? 0)} Karten erreicht.` : g.endReason === 'deck' ? 'Der Stapel ist leer.' : 'Der Host hat das Spiel beendet.';
      unter.textContent = zeige ? `${grund} Das ist die Zeitleiste von ${zeige.id === r.me ? 'dir' : zeige.name}:` : grund;
    } else if (phase === 'reveal') {
      const s = c.song;
      if (ichDran) setzeTitel(titel, c.correct ? 'Richtig!' : 'Leider falsch.', c.correct ? 'gut' : 'falsch');
      else if (diebe.length) {
        // „Anna klaut die Karte!“, „Anna und Ben klauen …“, „Du und Anna klaut …“
        const ich = diebe.includes(r.me);
        const reihe = ich ? [r.me, ...diebe.filter((id) => id !== r.me)] : diebe;
        const namen = aufzaehlen(reihe.map((id) => (id === r.me ? 'Du' : spieler(id)?.name ?? '?')));
        setzeTitel(titel, `${namen} ${reihe.length === 1 ? (ich ? 'klaust' : 'klaut') : ich ? 'klaut' : 'klauen'} die Karte!`, 'gut');
      }
      else setzeTitel(titel, `${aktiv?.name ?? '?'} liegt ${c.correct ? 'richtig!' : 'falsch.'}`, c.correct ? 'gut' : 'falsch');
      // Kartenziel erreicht, aber noch nicht gewonnen: sagen, wie es weitergeht.
      const ch = g.chase;
      let ende = '';
      if (ch && ch.left.length) ende = ` ${ch.count} Karten sind erreicht: Wer in dieser Runde noch dran ist, darf nachziehen.`;
      else if (ch) ende = ` Gleichstand bei ${ch.count} Karten: ${ch.ids.map(wer).join(' und ')} spielen weiter${g.out?.length ? ', alle anderen sind raus' : ''}.`;
      unter.textContent = `${s.a} – ${s.t} ist von ${s.y}. ${c.correct ? 'Die Karte bleibt.' : diebe.length ? `Die Karte geht an ${aufzaehlen(diebe.map((id) => (id === r.me ? 'dich' : spieler(id)?.name ?? '?')))}.` : 'Die Karte ist weg.'}${ende}`;
    } else if (phase === 'challenge') {
      setzeTitel(titel, 'Anzweifeln?');
      unter.textContent = ichDran ? 'Deine Lücke steht fest. Die anderen dürfen jetzt anzweifeln.'
        : r.can.challenge ? `${aktiv?.name ?? '?'} hat festgelegt. Liegt die Karte woanders? Dann steck eine Marke in die richtige Lücke. Wo die anderen tippen, siehst du erst beim Aufdecken.`
          : `${aktiv?.name ?? '?'} hat festgelegt. Wer anzweifelt, steckt eine Marke in eine andere Lücke. Die Tipps kommen beim Aufdecken.`;
    } else {
      setzeTitel(titel, ichDran ? 'Du bist dran!' : `${aktiv?.name ?? '?'} ist dran.`);
      unter.textContent = ichDran ? 'Wo gehört dieser Song in deine Zeitleiste?' : `Der Song wird in die Zeitleiste von ${aktiv?.name ?? '?'} eingeordnet.`;
    }

    // Ton
    const mode = g.settings.mode;
    const hoert = mode === 'everyone' || mode === 'test' || (mode === 'host' && r.isHost);
    const my = r.myAudio;
    const spielt = phase !== 'ended' && hoert && my.state === 'playing';
    const pausiert = !!g.musicPaused; // gilt für alle: Erst „Weiter“ lässt wieder Musik laufen
    ton.classList.toggle('still', !spielt);
    ton.style.display = phase === 'ended' ? 'none' : '';
    erneuere(tonStatus, [hoert, my.state, my.reason, mode === 'everyone' && my.drift, pausiert], () => {
      if (pausiert) return h('span', { class: 'pausiert', role: 'status' }, symbol('pause'), 'Musik pausiert');
      if (!hoert) return h('span', {}, 'Die Musik kommt vom Host (z. B. über Discord).');
      const text = my.state === 'error' ? FAIL_REASON[my.reason] || 'Musikfehler' : AUDIO_STATE[my.state] || '';
      const versatz = mode === 'everyone' && my.drift !== null && my.drift !== undefined ? ` (Versatz ${my.drift} ms)` : '';
      return [h('span', { class: 'pegel', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i'))), h('span', { class: my.state === 'error' ? 'fehlertext' : '' }, text + versatz)];
    });
    erneuere(tonKnoepfe, [!!r.can.audioControl && !verdeckt, pausiert], () => (r.can.audioControl && !verdeckt ? [
      textknopf('Nochmal', a.replay, { 'data-fk': 'nochmal', title: 'Song von vorn abspielen' }),
      pausiert
        ? symbolknopf('spiel', 'Weiter', a.resumeMusic, { 'data-fk': 'pause', class: 'hell', title: 'Musik weiterspielen' })
        : symbolknopf('pause', 'Pause', a.pauseMusic, { 'data-fk': 'pause', title: 'Musik anhalten, bis jemand weiterspielt' }),
    ] : null));
    const merken = r.can.saveSong ? 'idle' : r.songSave === 'idle' ? null : r.songSave;
    erneuere(tonMerken, merken, () => {
      if (merken === 'idle') return symbolknopf('herz', 'Speichern', a.saveSong, { 'data-fk': 'merken', title: 'Dieses Lied in deinen Lieblingssongs bei Spotify speichern' });
      if (merken === 'saving') return h('span', { class: 'gemerkt' }, symbol('herz'), 'Speichert …');
      if (merken === 'saved') return h('span', { class: 'gemerkt da', role: 'status' }, symbol('herz'), 'Gespeichert');
      return null;
    });
    lautstaerke.style.display = hoert ? '' : 'none';
    if (document.activeElement !== regler) regler.value = state.volume;

    // Aktionszeile
    const tl = zeige ? stationen : [];
    const naechster = phase === 'reveal' && aktiv ? naechsterSpieler(g, aktiv.id) : null;
    tick();
    erneuere(aktion, [phase, verdeckt, darfWaehlen, slot, r.can, aktiv && [aktiv.id, aktiv.name, aktiv.connected], naechster?.name, tl.map((s) => s.y), r.isHost,
      mitMarken && [r.challenge, tipp, c?.grant, r.mePlayer?.tokens, g.players.map((p) => p.name)]], () => {
      if (verdeckt) return null;
      const teile = [];
      const rechts = [];
      if (phase === 'challenge' && r.challenge) {
        // Regel „Marken“: Die Lücke wird auf der Skala gewählt, hier wird nur bestätigt oder gepasst.
        const ch = r.challenge;
        if (r.can.challenge) {
          teile.push(knopf('Anzweifeln', zweifleAn, 'haupt', { disabled: tipp === null, 'data-fk': 'haupt', 'data-klang': 'aus' }));
          teile.push(h('span', { class: 'wo' }, tipp === null ? 'Klick auf eine freie Lücke. Das kostet eine Marke.' : [h('b', {}, lueckenText(tl, tipp)), ' · kostet eine Marke']));
          teile.push(knopf('Passen', a.passChallenge, '', { 'data-fk': 'passen' }));
        } else {
          teile.push(h('span', { class: 'wo' },
            ch.mine !== null ? ['Dein Tipp: ', h('b', {}, lueckenText(tl, ch.mine))]
              : ch.picks.some((t) => t.p === r.me) ? 'Du hast angezweifelt.'
              : ch.passed.includes(r.me) ? 'Du passt.'
                : ichDran ? 'Deine Lücke steht fest.'
                  : r.mePlayer && r.mePlayer.tokens < 1 ? 'Du hast keine Marke zum Anzweifeln.' : ''));
        }
        // Wer schon getippt oder gepasst hat. Wohin, zeigt erst das Aufdecken.
        const stand = [
          ch.picks.length && `Getippt: ${ch.picks.map((t) => wer(t.p)).join(', ')}`,
          ch.passed.length && `Gepasst: ${ch.passed.map(wer).join(', ')}`,
          ch.pending.length && `Offen: ${ch.pending.map(wer).join(', ')}`,
        ].filter(Boolean);
        if (stand.length) rechts.push(h('span', { class: 'wo zweifel-stand' }, stand.join(' · ')));
        rechts.push(frist);
        if (r.can.endChallenge) rechts.push(textknopf('Jetzt aufdecken', a.endChallenge, { 'data-fk': 'aufdecken' }));
        teile.push(h('div', { class: 'rechts' }, rechts));
        return teile;
      }
      if (phase === 'ended') {
        if (r.can.reset) {
          teile.push(knopf('Neues Spiel', a.newGame, 'haupt', { 'data-fk': 'neu' }));
          teile.push(h('span', { class: 'wo' }, 'Zurück in die Lobby, alle bleiben im Raum.'));
        } else {
          teile.push(h('span', { class: 'wo' }, 'Der Host kann ein neues Spiel starten.'));
        }
        return teile;
      }
      if (phase === 'reveal') {
        if (r.can.next) teile.push(knopf('Weiter', a.nextTurn, 'haupt', { 'data-fk': 'haupt' }));
        teile.push(h('span', { class: 'wo' }, r.can.next
          ? (naechster ? `Als Nächstes: ${naechster.id === r.me ? 'du' : naechster.name}` : '')
          : `${aktiv?.name ?? 'Der aktive Spieler'} oder der Host macht weiter.`));
        if (mitMarken) {
          // Marke für den aktiven Spieler: eine ruhige Nebenaktion am rechten Rand
          if (c.grant) {
            rechts.push(mitMarke('span', { class: 'wo' }, `Marke für ${aktiv?.id === r.me ? 'dich' : aktiv?.name ?? '?'} von ${c.grant.by === r.me ? 'dir' : wer(c.grant.by)}`));
            if (r.can.revokeToken) rechts.push(textknopf('zurücknehmen', a.revokeToken, { 'data-fk': 'marke-zurueck' }));
          } else if (r.can.giveToken) {
            rechts.push(h('span', { class: 'wo' }, 'Titel und Interpret gewusst?'));
            const name = aktiv?.name ?? '';
            const label = name && name.length <= 12 && kannPixel(name) ? `Marke für ${name}` : 'Marke geben';
            rechts.push(h('button', { type: 'button', class: 'knopf neben', onclick: a.giveToken, 'aria-label': `Marke für ${name || 'den aktiven Spieler'}`, 'data-fk': 'marke-geben', 'data-klang': 'aus' }, marke(), pixelLabel(label)));
          }
          if (rechts.length) teile.push(h('div', { class: 'rechts' }, rechts));
        }
        return teile;
      }
      if (darfWaehlen) {
        teile.push(knopf('Festlegen', a.lockIn, 'haupt', { disabled: slot === null, 'data-fk': 'haupt', 'data-klang': 'aus' }));
        teile.push(h('span', { class: 'wo' }, slot === null ? 'Wähle eine Lücke: klicken, die Karte ziehen oder ← →' : h('b', {}, lueckenText(tl, slot))));
      } else {
        teile.push(h('span', { class: 'wo' }, slot === null ? `${aktiv?.name ?? '?'} überlegt …` : [`${aktiv?.name ?? '?'} zeigt auf: `, h('b', {}, lueckenText(tl, slot))]));
        if (r.can.skipTurn && aktiv && !aktiv.connected) rechts.push(knopf(`${aktiv.name} überspringen (getrennt)`, a.skipTurn, '', { 'data-fk': 'skip-getrennt' }));
      }
      if (r.can.skipSong) rechts.push(knopf('Song überspringen', a.skipSong, 'neben', { title: 'Falls der Song nicht verfügbar ist', 'data-fk': 'skip-song' }));
      if (rechts.length) teile.push(h('div', { class: 'rechts' }, rechts));
      return teile;
    });

    // Zeitleisten aller Spieler
    const ziel = g.settings.target;
    const liste = phase === 'ended' ? [...g.players].sort((x, y) => y.timeline.length - x.timeline.length) : g.players;
    const markiert = phase === 'ended' ? null : aktiv?.id;
    const unterwegs = verdeckt || (klaut !== null && klaut === c?.round); // Karte dreht sich noch oder fliegt zum Dieb
    const zeigbar = unterwegs && (c.correct || diebe.length) ? c.song.id : null; // noch nicht verraten
    erneuere(reihenPlatz, [liste.map((p) => [p.id, p.name, p.connected, p.host, p.timeline.map((s) => s.y), musikMarke(g, p), mitMarken && p.tokens]), markiert, ziel, r.me, r.can.kick, zeigbar, gelandet, g.out], () => {
      const ausgeschieden = g.out || [];
      if (mitMarken && liste.some((p) => p.tokens > (markenVorher.get(p.id) ?? p.tokens))) spiele('marke');
      return h('ul', { class: 'reihen' }, liste.map((p) => {
        const karten = zeigbar ? p.timeline.filter((s) => s.id !== zeigbar) : p.timeline;
        const m = p.connected ? musikMarke(g, p) : null;
        const striche = Math.max(karten.length, ziel <= 12 ? ziel : 0);
        const mehrMarken = mitMarken && p.tokens > (markenVorher.get(p.id) ?? p.tokens);
        if (mitMarken) markenVorher.set(p.id, p.tokens);
        const raus = phase !== 'ended' && ausgeschieden.includes(p.id); // nach einem Gleichstand ausgeschieden
        return h('li', { class: `reihe${mitMarken ? ' mit-marken' : ''}${p.id === markiert ? ' dran' : ''}${p.connected && !raus ? '' : ' getrennt'}`, 'data-spieler': p.id },
          h('span', { class: 'wer' },
            h('span', { class: 'name' }, p.name),
            p.id === r.me ? h('span', { class: 'marke' }, 'du') : null,
            raus ? h('span', { class: 'marke' }, 'raus') : !p.connected ? h('span', { class: 'marke' }, 'getrennt') : m && m.art ? h('span', { class: `marke ${m.art}` }, m.text) : null),
          mitMarken ? markenReihe(p.tokens, mehrMarken) : null,
          h('span', { class: 'stand', role: 'img', 'aria-label': `${karten.length} von ${ziel} Karten` }, pixeltext(`${karten.length}/${ziel}`)),
          h('ol', { class: 'mini', 'aria-label': `Zeitleiste von ${p.name}` },
            Array.from({ length: striche }, (_, i) => (karten[i] ? h('li', { class: gelandet && karten[i].id === gelandet ? 'geklaut' : '' }, pixeltext(karten[i].y)) : h('li', { class: 'leer', 'aria-hidden': 'true' })))),
          r.can.kick && !p.host ? textknopf('entfernen', async () => {
            if (await frage(`${p.name} aus dem Raum entfernen?`, 'Entfernen')) a.kick(p.id);
          }, { 'data-fk': `kick-${p.id}` }) : null);
      }));
    });

    // Verlauf
    // Während die Karte sich umdreht, bleiben ihre Einträge (gelegt, ggf. geklaut) verborgen.
    let geklautZahl = 0; // ein Eintrag je Anzweifler, der die Karte bekommt
    for (let i = g.log.length - 1; i >= 0 && g.log[i].k === 'stolen'; i--) geklautZahl += 1;
    const verborgen = verdeckt ? geklautZahl + 1 : klaut !== null ? geklautZahl : 0;
    const eintraege = (verborgen ? g.log.slice(0, -verborgen) : g.log).slice(-6).reverse();
    verlaufBlock.style.display = eintraege.length ? '' : 'none';
    erneuere(verlauf, [eintraege, g.players.map((p) => [p.id, p.name])], () => eintraege.map((e) => {
      const name = spieler(e.p)?.name || '?';
      const lied = e.song ? `${e.song.a} – ${e.song.t} (${e.song.y})` : '';
      if (e.k === 'placed') return h('li', { class: e.ok ? 'ok' : 'nein' }, symbol(e.ok ? 'haken' : 'kreuz'), h('span', {}, h('span', { class: 'wer' }, `${name} · `), lied));
      if (e.k === 'skipped') return h('li', {}, h('span', {}), h('span', {}, h('span', { class: 'wer' }, `Übersprungen${e.reason === 'unavailable' ? ' (nicht verfügbar)' : ''} · `), lied));
      if (e.k === 'turnSkipped') return h('li', {}, h('span', {}), h('span', { class: 'wer' }, `${name} wurde übersprungen`));
      if (e.k === 'joined') return h('li', {}, h('span', {}), h('span', { class: 'wer' }, `${name} ist beigetreten`));
      if (e.k === 'left') return h('li', {}, h('span', {}), h('span', { class: 'wer' }, `${e.name} wurde entfernt`));
      if (e.k === 'stolen') return h('li', { class: 'ok' }, symbol('marke'), h('span', { class: 'wer' }, `${name} klaut die Karte von ${spieler(e.from)?.name || '?'}`));
      if (e.k === 'token') return h('li', {}, symbol('marke'), h('span', { class: 'wer' }, `${name} bekommt eine Marke von ${spieler(e.by)?.name || '?'}`));
      if (e.k === 'tokenRevoked') return h('li', { class: 'zurueck' }, symbol('platz'), h('span', { class: 'wer' }, `Marke von ${name} zurückgenommen`));
      return null;
    }));

    // Werkzeuge des Hosts
    erneuere(hostleiste, [r.isHost, r.can.skipTurn, r.can.endGame, r.can.reset, phase], () => (r.isHost ? h('div', { class: 'hostleiste' },
      h('span', { class: 'etikett' }, pixeltext('Host')),
      textknopf('Einladungslink kopieren', () => kopiereLink(app), { 'data-fk': 'kopieren' }),
      r.can.skipTurn ? textknopf('Zug überspringen', a.skipTurn, { 'data-fk': 'skip-zug' }) : null,
      r.can.endGame ? textknopf('Spiel beenden', async () => {
        if (await frage('Spiel wirklich beenden?', 'Beenden')) a.endGame();
      }, { 'data-fk': 'beenden' }) : null,
      r.can.reset && phase !== 'ended' ? textknopf('Zurück zur Lobby', async () => {
        if (await frage('Zurück zur Lobby? Der Spielstand geht verloren.', 'Zur Lobby')) a.newGame();
      }, { 'data-fk': 'lobby' }) : null) : null));

    // Marken-Protokoll: ganz unten und zugeklappt, zum Nachschauen. Neueste Einträge oben.
    protokollBlock.hidden = !mitMarken;
    const zeilen = mitMarken ? g.tokenLog.slice().reverse() : [];
    protokollZahl.textContent = zeilen.length === 1 ? '1 Eintrag' : `${zeilen.length} Einträge`;
    erneuere(protokoll, [zeilen, verdeckt && c.round], () => (zeilen.length ? zeilen.map((e) => {
      let was = '';
      if (e.k === 'got') was = `bekommt eine Marke von ${e.byName}`;
      else if (e.k === 'revoked') was = `gibt die Marke wieder ab, zurückgenommen von ${e.byName}`;
      else if (e.k === 'spent') {
        const offen = e.won === null || (verdeckt && e.r === c.round);
        was = `zweifelt an: ${offen ? 'noch offen' : e.won ? 'Karte geklaut' : 'kein Treffer'}`;
      }
      return h('li', {},
        h('span', { class: 'p-karte' }, `Karte ${e.r}`),
        h('span', { class: 'p-wer' }, e.name),
        h('span', { class: 'p-was' }, was),
        markenReihe(e.n));
    }) : h('li', { class: 'p-leer' }, 'Noch hat niemand eine Marke eingesetzt oder bekommen.')));
  }

  return { el, update, weg: () => { tot = true; clearTimeout(endeTimer); clearTimeout(landeTimer); clearInterval(uhrTimer); skala.entfernen(); } };
}

// ── Einhängen ────────────────────────────────────────────────────────────────

export function renderMessage(root, title, text) {
  const titel = h('h1');
  setzeTitel(titel, title);
  root.replaceChildren(h('div', { class: 'seite' },
    h('header', { class: 'kopf' }, lockup()),
    h('main', {}, h('div', { class: 'ansage' }, h('div', { class: 'links' }, titel, h('p', { class: 'unter' }, text || ''))))));
}

const ANSICHTEN = { start: startAnsicht, verbinden: verbindenAnsicht, lobby: lobbyAnsicht, spiel: spielAnsicht };

function artVon(state) {
  if (state.screen !== 'room' || !state.room) return 'start';
  if (!state.room.game) return 'verbinden';
  return state.room.game.phase === 'lobby' ? 'lobby' : 'spiel';
}

export function mountUI(root, app) {
  let art = null;
  let ansicht = null;
  let geplant = false;
  const hinweis = h('div', { class: 'hinweis-fenster', role: 'status' });
  const platz = h('div', {});
  // Klänge der Oberfläche: ein kleiner Schalter in der Ecke, auf allen Bildschirmen
  starteKlang();
  const klangKnopf = h('button', { type: 'button', class: 'klang-schalter', 'data-klang': 'aus', onclick: () => { schalteKlang(!klangAn()); zeigeKlang(); } });
  const zeigeKlang = () => {
    const an = klangAn();
    klangKnopf.replaceChildren(symbol(an ? 'ton' : 'tonAus'));
    klangKnopf.classList.toggle('aus', !an);
    klangKnopf.setAttribute('aria-pressed', String(an));
    klangKnopf.setAttribute('aria-label', 'Klänge');
    klangKnopf.title = an ? 'Klänge sind an (Knöpfe und Karten)' : 'Klänge sind aus';
  };
  zeigeKlang();
  root.replaceChildren(platz, hinweis, klangKnopf);

  const zeichne = () => {
    geplant = false;
    const state = app.getState();
    const neu = artVon(state);
    if (neu !== art) {
      ansicht?.weg?.();
      art = neu;
      ansicht = ANSICHTEN[art](app);
      platz.replaceChildren(ansicht.el);
      window.scrollTo(0, 0);
    }
    ansicht.update(state);
    hinweis.textContent = state.notice || '';
    hinweis.classList.toggle('da', !!state.notice);
  };
  app.subscribe(() => {
    if (!geplant) {
      geplant = true;
      requestAnimationFrame(zeichne);
    }
  });
  zeichne();
}
