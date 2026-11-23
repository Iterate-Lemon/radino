// Oberfläche von RaDino. Liest nur app.getState() und ruft nur app.actions.* auf
// (siehe docs/UI-SCHNITTSTELLE.md). Aufbau:
//   pixel.js  Pixelschrift, Dino, Symbole
//   skala.js  die Zeitleiste als Senderskala mit Songkarten
//   ui.js     Bildschirme: Start, Verbinden, Lobby, Spiel (mit Spielende)
// Jeder Bildschirm wird einmal gebaut und danach nur aktualisiert, damit
// Animationen, Eingaben und Fokus erhalten bleiben.
// Sicherheit: Texte werden ausschließlich als Textknoten eingefügt (kein innerHTML).

import { h, erneuere } from './dom.js';
import { pixeltext, pixelzeile, kannPixel, dino, symbol } from './pixel.js';
import { Skala, lueckenText } from './skala.js';

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
const knopf = (label, onclick, cls = '', attrs = {}) => (cls.includes('haupt')
  ? h('button', { type: 'button', class: `knopf ${cls}`.trim(), onclick, 'aria-label': label, ...attrs }, pixelLabel(label))
  : h('button', { type: 'button', class: `knopf ${cls}`.trim(), onclick, ...attrs }, label));
const textknopf = (label, onclick, attrs = {}) => h('button', { type: 'button', class: 'textknopf', onclick, ...attrs }, label);
const etikett = (text) => h('h2', { class: 'etikett' }, pixeltext(text));

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
    update(state) {
      const r = state.room;
      const g = r.game;
      const laeuft = g && (g.phase === 'turn' || g.phase === 'reveal');
      lage.textContent = laeuft
        ? `Karte ${g.round}  ·  noch ${g.deckLeft.toLocaleString('de-DE')} im Stapel  ·  Ziel: ${g.settings.target} Karten`
        : '';
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
  for (let i = 1; i <= n; i++) {
    const p = g.players.find((x) => x.id === g.order[(idx + i) % n]);
    if (p?.connected) return p;
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

// ── Start ────────────────────────────────────────────────────────────────────

function startAnsicht(app) {
  const a = app.actions;
  const meldung = h('div', { class: 'meldungen' });
  const formPlatz = h('div', {});
  const gespeichert = h('div', {});
  const fuss = h('p', { class: 'fuss' });
  let eingabe = null;

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
        maxlength: 24, value: state.name, placeholder: 'z. B. Anna', autocomplete: 'nickname', 'data-fk': 'name',
        onchange: (e) => a.setName(e.target.value),
      });
      const los = (e) => {
        e.preventDefault();
        a.setName(eingabe.value);
        if (beitreten) a.joinRoom();
        else a.createRoom();
      };
      return [
        beitreten ? h('p', { class: 'einladung' }, 'Du wurdest zu einem Spiel eingeladen.') : null,
        h('form', { class: 'start-form', onsubmit: los },
          h('label', { class: 'feld' }, h('span', { class: 'etikett' }, pixeltext('Dein Name')), eingabe),
          h('button', { type: 'submit', class: 'knopf haupt', 'data-fk': 'los', 'aria-label': beitreten ? 'Beitreten' : 'Spiel erstellen' },
            pixelLabel(beitreten ? 'Beitreten' : 'Spiel erstellen'))),
        beitreten ? null : h('p', { class: 'hinweis' }, 'Du wirst Host: Dein Tab muss während des Spiels offen bleiben.'),
      ];
    });
    if (eingabe && document.activeElement !== eingabe && eingabe.value !== state.name) eingabe.value = state.name;

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

    erneuere(regeln, [s.target, s.startAt, edit], () => [
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
  const siegerDino = dino('steht', 'sieger-dino');
  const tonStatus = h('span', { class: 'ton-status' });
  const tonKnoepfe = h('span', { class: 'ton-knoepfe' });
  const regler = h('input', { type: 'range', min: 0, max: 1, step: 0.05, 'aria-label': 'Lautstärke', oninput: (e) => a.setVolume(e.target.value) });
  const lautstaerke = h('label', { class: 'lautstaerke' }, 'Lautstärke', regler);
  const ton = h('div', { class: 'ton' }, tonStatus, tonKnoepfe, lautstaerke);
  const aktion = h('div', { class: 'aktion' });
  const reihenPlatz = h('div', {});
  const verlauf = h('ol', { class: 'verlauf' });
  const verlaufBlock = h('section', {}, etikett('Verlauf'), verlauf);
  const hostleiste = h('div', {});
  let tot = false;
  let gesehen = { runde: null, locked: false };
  let rollt = null; // Runde, deren Karte sich gerade umdreht

  const skala = new Skala({
    onSelect: (i) => { a.selectSlot(i); update(app.getState()); },
    onLock: () => a.lockIn(),
  });

  const el = h('div', { class: 'seite spiel' }, kopf.el, meldungen.el,
    h('main', {},
      h('div', { class: 'ansage' }, h('div', { class: 'links' }, titel, unter), siegerDino, ton),
      skala.el,
      aktion,
      h('div', { class: 'unten' },
        h('section', {}, etikett('Zeitleisten'), reihenPlatz),
        verlaufBlock),
      hostleiste));

  function update(state) {
    if (tot || !state.room?.game) return;
    const r = state.room;
    const g = r.game;
    const c = g.card;
    const spieler = (id) => g.players.find((p) => p.id === id) || null;
    kopf.update(state);
    meldungen.update(state);

    // Aufdecken inszenieren: Wird die eben noch verdeckte Karte festgelegt, dreht sie
    // sich erst um und die Ziffern rasten ein. So lange bleibt die Auflösung verborgen.
    if (c?.locked && c.song && gesehen.runde === c.round && !gesehen.locked && rollt !== c.round) {
      rollt = c.round;
      gesehen = { runde: c.round, locked: true };
      skala.rolle(c.song).then(() => {
        if (rollt !== c.round) return;
        rollt = null;
        update(app.getState());
      });
    }
    if (rollt !== null && (!c || c.round !== rollt)) rollt = null;
    if (rollt === null) gesehen = { runde: c?.round ?? null, locked: !!c?.locked };
    const verdeckt = rollt !== null;

    const phase = verdeckt ? 'turn' : g.phase;
    const aktiv = spieler(c?.by ?? g.activeId);
    const ichDran = !!aktiv && aktiv.id === r.me;
    const darfWaehlen = r.can.select && !verdeckt;

    // Wessen Zeitleiste auf der Skala hängt
    let zeige = aktiv;
    if (phase === 'ended') zeige = r.winners[0] || aktiv;
    let stationen = zeige ? zeige.timeline : [];
    if (verdeckt && c.correct) stationen = stationen.filter((s) => s.id !== c.song.id);

    let modus = 'ruhe';
    if (phase === 'turn') modus = darfWaehlen ? 'waehlen' : 'zuschauen';
    else if (phase === 'reveal') modus = 'offen';
    else if (c?.locked && c.song && zeige && c.by === zeige.id) modus = 'offen';
    skala.el.hidden = !zeige;
    skala.update({
      stations: stationen,
      slot: c?.slot ?? null,
      mode: modus,
      reveal: modus === 'offen' ? c : null,
      runde: c?.round ?? null,
    });
    const slot = modus === 'waehlen' ? skala.view.slot : c?.slot ?? null;

    // Überschrift
    el.classList.toggle('ende', phase === 'ended');
    siegerDino.style.display = phase === 'ended' && r.winners.length ? '' : 'none';
    if (phase === 'ended') {
      const namen = r.winners.map((p) => p.name);
      const nurIch = r.winners.length === 1 && r.winners[0].id === r.me;
      setzeTitel(titel, !namen.length ? 'Spiel beendet.' : nurIch ? 'Du gewinnst!' : `${namen.join(' & ')} ${namen.length > 1 ? 'gewinnen' : 'gewinnt'}!`, namen.length ? 'gut' : '');
      const grund = g.endReason === 'target' ? `${g.settings.target} Karten erreicht.` : g.endReason === 'deck' ? 'Der Stapel ist leer.' : 'Der Host hat das Spiel beendet.';
      unter.textContent = zeige ? `${grund} Das ist die Zeitleiste von ${zeige.id === r.me ? 'dir' : zeige.name}:` : grund;
    } else if (phase === 'reveal') {
      const s = c.song;
      if (ichDran) setzeTitel(titel, c.correct ? 'Richtig!' : 'Leider falsch.', c.correct ? 'gut' : 'falsch');
      else setzeTitel(titel, `${aktiv?.name ?? '?'} liegt ${c.correct ? 'richtig!' : 'falsch.'}`, c.correct ? 'gut' : 'falsch');
      unter.textContent = `${s.a} – ${s.t} ist von ${s.y}. ${c.correct ? 'Die Karte bleibt.' : 'Die Karte ist weg.'}`;
    } else {
      setzeTitel(titel, ichDran ? 'Du bist dran!' : `${aktiv?.name ?? '?'} ist dran.`);
      unter.textContent = ichDran ? 'Wo gehört dieser Song in deine Zeitleiste?' : `Der Song wird in die Zeitleiste von ${aktiv?.name ?? '?'} eingeordnet.`;
    }

    // Ton
    const mode = g.settings.mode;
    const hoert = mode === 'everyone' || mode === 'test' || (mode === 'host' && r.isHost);
    const my = r.myAudio;
    const spielt = phase !== 'ended' && hoert && my.state === 'playing';
    ton.classList.toggle('still', !spielt);
    ton.style.display = phase === 'ended' ? 'none' : '';
    erneuere(tonStatus, [hoert, my.state, my.reason, mode === 'everyone' && my.drift], () => {
      if (!hoert) return h('span', {}, 'Die Musik kommt vom Host (z. B. über Discord).');
      const text = my.state === 'error' ? FAIL_REASON[my.reason] || 'Musikfehler' : AUDIO_STATE[my.state] || '';
      const versatz = mode === 'everyone' && my.drift !== null && my.drift !== undefined ? ` (Versatz ${my.drift} ms)` : '';
      return [h('span', { class: 'pegel', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i'))), h('span', { class: my.state === 'error' ? 'fehlertext' : '' }, text + versatz)];
    });
    erneuere(tonKnoepfe, !!r.can.audioControl && !verdeckt, () => (r.can.audioControl && !verdeckt ? [
      textknopf('Nochmal', a.replay, { 'data-fk': 'nochmal' }),
      textknopf('Stopp', a.stopMusic, { 'data-fk': 'stopp' }),
    ] : null));
    lautstaerke.style.display = hoert ? '' : 'none';
    if (document.activeElement !== regler) regler.value = state.volume;

    // Aktionszeile
    const tl = zeige ? stationen : [];
    const naechster = phase === 'reveal' && aktiv ? naechsterSpieler(g, aktiv.id) : null;
    erneuere(aktion, [phase, verdeckt, darfWaehlen, slot, r.can, aktiv && [aktiv.id, aktiv.name, aktiv.connected], naechster?.name, tl.map((s) => s.y), r.isHost], () => {
      if (verdeckt) return null;
      const teile = [];
      const rechts = [];
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
        return teile;
      }
      if (darfWaehlen) {
        teile.push(knopf('Festlegen', a.lockIn, 'haupt', { disabled: slot === null, 'data-fk': 'haupt' }));
        teile.push(h('span', { class: 'wo' }, slot === null ? 'Wähle eine Lücke: klicken, die Karte ziehen oder ← →' : h('b', {}, lueckenText(tl, slot))));
      } else {
        teile.push(h('span', { class: 'wo' }, slot === null ? `${aktiv?.name ?? '?'} überlegt …` : [`${aktiv?.name ?? '?'} zeigt auf: `, h('b', {}, lueckenText(tl, slot))]));
        if (r.can.skipTurn && aktiv && !aktiv.connected) rechts.push(knopf(`${aktiv.name} überspringen (getrennt)`, a.skipTurn, '', { 'data-fk': 'skip-getrennt' }));
      }
      if (r.can.skipSong) rechts.push(textknopf('Song überspringen (nicht verfügbar)', a.skipSong, { 'data-fk': 'skip-song' }));
      if (rechts.length) teile.push(h('div', { class: 'rechts' }, rechts));
      return teile;
    });

    // Zeitleisten aller Spieler
    const ziel = g.settings.target;
    const liste = phase === 'ended' ? [...g.players].sort((x, y) => y.timeline.length - x.timeline.length) : g.players;
    const markiert = phase === 'ended' ? null : aktiv?.id;
    const zeigbar = verdeckt && c.correct ? c.song.id : null; // noch nicht verraten
    erneuere(reihenPlatz, [liste.map((p) => [p.id, p.name, p.connected, p.host, p.timeline.map((s) => s.y), musikMarke(g, p)]), markiert, ziel, r.me, r.can.kick, zeigbar], () =>
      h('ul', { class: 'reihen' }, liste.map((p) => {
        const karten = zeigbar ? p.timeline.filter((s) => s.id !== zeigbar) : p.timeline;
        const m = p.connected ? musikMarke(g, p) : null;
        const striche = Math.max(karten.length, ziel <= 12 ? ziel : 0);
        return h('li', { class: `reihe${p.id === markiert ? ' dran' : ''}${p.connected ? '' : ' getrennt'}` },
          h('span', { class: 'wer' },
            h('span', { class: 'name' }, p.name),
            p.id === r.me ? h('span', { class: 'marke' }, 'du') : null,
            !p.connected ? h('span', { class: 'marke' }, 'getrennt') : m && m.art ? h('span', { class: `marke ${m.art}` }, m.text) : null),
          h('span', { class: 'stand', role: 'img', 'aria-label': `${karten.length} von ${ziel} Karten` }, pixeltext(`${karten.length}/${ziel}`)),
          h('ol', { class: 'mini', 'aria-label': `Zeitleiste von ${p.name}` },
            Array.from({ length: striche }, (_, i) => (karten[i] ? h('li', {}, pixeltext(karten[i].y)) : h('li', { class: 'leer', 'aria-hidden': 'true' })))),
          r.can.kick && !p.host ? textknopf('entfernen', async () => {
            if (await frage(`${p.name} aus dem Raum entfernen?`, 'Entfernen')) a.kick(p.id);
          }, { 'data-fk': `kick-${p.id}` }) : null);
      })));

    // Verlauf
    const eintraege = (verdeckt ? g.log.slice(0, -1) : g.log).slice(-6).reverse();
    verlaufBlock.style.display = eintraege.length ? '' : 'none';
    erneuere(verlauf, [eintraege, g.players.map((p) => [p.id, p.name])], () => eintraege.map((e) => {
      const name = spieler(e.p)?.name || '?';
      const lied = e.song ? `${e.song.a} – ${e.song.t} (${e.song.y})` : '';
      if (e.k === 'placed') return h('li', { class: e.ok ? 'ok' : 'nein' }, symbol(e.ok ? 'haken' : 'kreuz'), h('span', {}, h('span', { class: 'wer' }, `${name} · `), lied));
      if (e.k === 'skipped') return h('li', {}, h('span', {}), h('span', {}, h('span', { class: 'wer' }, `Übersprungen${e.reason === 'unavailable' ? ' (nicht verfügbar)' : ''} · `), lied));
      if (e.k === 'turnSkipped') return h('li', {}, h('span', {}), h('span', { class: 'wer' }, `${name} wurde übersprungen`));
      if (e.k === 'joined') return h('li', {}, h('span', {}), h('span', { class: 'wer' }, `${name} ist beigetreten`));
      if (e.k === 'left') return h('li', {}, h('span', {}), h('span', { class: 'wer' }, `${e.name} wurde entfernt`));
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
  }

  return { el, update, weg: () => { tot = true; skala.entfernen(); } };
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
  root.replaceChildren(platz, hinweis);

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
