// Schlichte, funktionale Oberfläche. Liest nur app.getState() und ruft nur
// app.actions.* auf (siehe docs/UI-SCHNITTSTELLE.md). Kann komplett ersetzt werden.
// Sicherheit: Texte werden ausschließlich als Textknoten eingefügt (kein innerHTML).

const MODE_LABEL = {
  host: 'Nur der Host spielt ab (z. B. über Discord-Stream)',
  everyone: 'Jeder hört selbst (eigenes Spotify Premium)',
  test: 'Testmodus ohne Musik',
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
const PLAY_STATE = {
  preparing: 'lädt …',
  ready: 'bereit',
  playing: 'spielt',
  late: 'verspätet',
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

// ── DOM-Helfer ───────────────────────────────────────────────────────────────

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const button = (label, onclick, attrs = {}) => h('button', { type: 'button', onclick, ...attrs }, label);

export function renderMessage(root, title, text) {
  root.replaceChildren(h('main', { class: 'page' }, h('h1', {}, 'RaDino'), h('div', { class: 'box' }, h('h2', {}, title), h('p', {}, text || ''))));
}

// ── Bildschirme ──────────────────────────────────────────────────────────────

function nameField(state, a) {
  return h(
    'label',
    { class: 'field' },
    'Dein Name ',
    h('input', {
      id: 'name',
      maxlength: 24,
      value: state.name,
      placeholder: 'z. B. Anna',
      autocomplete: 'nickname',
      onchange: (e) => a.setName(e.target.value),
      onkeydown: (e) => e.key === 'Enter' && a.setName(e.target.value),
    }),
  );
}

function errorBox(state, a) {
  if (!state.error) return null;
  return h('div', { class: 'box error', role: 'alert' }, h('p', {}, state.error), button('OK', a.dismissError));
}

function noticeBox(state) {
  return state.notice ? h('div', { class: 'box notice', role: 'status' }, state.notice) : null;
}

function homeScreen(state, a) {
  const minutes = state.savedRoom ? Math.max(1, Math.round((Date.now() - state.savedRoom.savedAt) / 60000)) : 0;
  return h(
    'main',
    { class: 'page' },
    h('h1', {}, 'RaDino'),
    h('p', { class: 'sub' }, 'Das Musik-Zeitleisten-Spiel für Freunde.'),
    errorBox(state, a),
    state.invite
      ? h(
          'section',
          { class: 'box' },
          h('h2', {}, 'Du wurdest zu einem Spiel eingeladen'),
          nameField(state, a),
          button('Beitreten', () => {
            const n = document.getElementById('name')?.value;
            if (n !== undefined) a.setName(n);
            a.joinRoom();
          }, { class: 'primary' }),
        )
      : h(
          'section',
          { class: 'box' },
          h('h2', {}, 'Neues Spiel'),
          nameField(state, a),
          button('Spiel erstellen', () => {
            const n = document.getElementById('name')?.value;
            if (n !== undefined) a.setName(n);
            a.createRoom();
          }, { class: 'primary' }),
          h('p', { class: 'hint' }, 'Du wirst Host: Dein Tab muss während des Spiels offen bleiben.'),
        ),
    state.savedRoom && !state.invite
      ? h(
          'section',
          { class: 'box' },
          h('h2', {}, 'Laufendes Spiel'),
          h('p', {}, `Gespeichert vor ${minutes} Min., ${state.savedRoom.players} Spieler.`),
          button('Fortsetzen', a.resumeRoom, { class: 'primary' }),
          ' ',
          button('Verwerfen', a.discardSavedRoom),
        )
      : null,
    footer(state),
  );
}

function footer(state) {
  return h(
    'footer',
    {},
    `${state.songCount} Songs, davon ${state.playableCount} mit Spotify verknüpft. `,
    'Songdaten: ',
    h('a', { href: 'https://github.com/andygruber/songseeker-hitster-playlists', target: '_blank', rel: 'noopener noreferrer' }, 'songseeker-hitster-playlists'),
    ' (MIT-Lizenz). Musik über Spotify.',
  );
}

function spotifyPanel(state, a) {
  const sp = state.spotify;
  if (!sp.needed) return null;
  const items = [h('strong', {}, 'Spotify: '), h('span', { class: `badge s-${sp.status}` }, SPOTIFY_STATUS[sp.status] || sp.status)];
  if (!sp.configured) {
    items.push(h('p', { class: 'error-text' }, 'In config.js ist noch keine Spotify-Client-ID eingetragen (siehe Anleitung).'));
  } else if (!sp.loggedIn || sp.status === 'login') {
    items.push(' ', button('Bei Spotify anmelden', a.spotifyLogin, { class: 'primary' }));
    items.push(h('p', { class: 'hint' }, 'Es öffnet sich ein kleines Fenster. Nötig: Spotify Premium und ein vom Einrichter freigeschaltetes Konto.'));
  } else {
    items.push(' ', button('Abmelden', a.spotifyLogout, { class: 'small' }));
  }
  if (sp.message && sp.configured) items.push(h('p', { class: sp.status === 'error' ? 'error-text' : 'hint' }, sp.message));
  return h('section', { class: 'box spotify' }, items);
}

function playerList(state, a) {
  const r = state.room;
  const g = r.game;
  return h(
    'ul',
    { class: 'players' },
    g.players.map((p) => {
      const au = g.audio?.[p.id];
      const showAudio = g.settings.mode === 'everyone' || (g.settings.mode === 'host' && p.host) || g.settings.mode === 'test';
      return h(
        'li',
        { class: p.connected ? '' : 'offline' },
        h('span', { class: 'pname' }, p.name),
        p.host ? h('span', { class: 'tag' }, 'Host') : null,
        p.id === r.me ? h('span', { class: 'tag' }, 'du') : null,
        !p.connected ? h('span', { class: 'tag warn' }, 'getrennt') : null,
        showAudio && au ? h('span', { class: `badge s-${au.s}` }, `Musik: ${SPOTIFY_STATUS[au.s] || au.s}`) : null,
        g.phase !== 'lobby' ? h('span', { class: 'count' }, `${p.timeline.length}/${g.settings.target}`) : null,
        r.can.kick && !p.host ? button('entfernen', () => confirm(`${p.name} aus dem Raum entfernen?`) && a.kick(p.id), { class: 'small' }) : null,
      );
    }),
  );
}

function settingsPanel(state, a) {
  const r = state.room;
  const s = r.game.settings;
  const edit = r.can.editSettings;
  const modes = ['host', 'everyone', ...(state.testMode || s.mode === 'test' ? ['test'] : [])];
  return h(
    'section',
    { class: 'box' },
    h('h2', {}, 'Einstellungen'),
    h(
      'fieldset',
      { disabled: !edit },
      h('legend', {}, 'Musik'),
      modes.map((m) =>
        h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'mode', checked: s.mode === m, onchange: () => a.updateSettings({ mode: m }) }), ' ', MODE_LABEL[m]),
      ),
    ),
    h(
      'label',
      { class: 'field' },
      'Karten zum Sieg (inkl. Startkarte) ',
      h('input', {
        id: 'target',
        type: 'number',
        min: 2,
        max: 30,
        value: s.target,
        disabled: !edit,
        onchange: (e) => a.updateSettings({ target: parseInt(e.target.value, 10) }),
      }),
    ),
    h(
      'label',
      { class: 'field' },
      'Abspielen ab ',
      h(
        'select',
        { id: 'startAt', disabled: !edit, onchange: (e) => a.updateSettings({ startAt: parseInt(e.target.value, 10) }) },
        [0, 30, 60].map((v) => h('option', { value: v, selected: s.startAt === v }, v === 0 ? 'Songanfang' : `Sekunde ${v}`)),
      ),
    ),
    h(
      'fieldset',
      { disabled: !edit },
      h('legend', {}, 'Editionen'),
      state.editions.map((e) =>
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: s.editions.includes(e.id),
            onchange: (ev) => {
              const set = new Set(s.editions);
              if (ev.target.checked) set.add(e.id);
              else set.delete(e.id);
              a.updateSettings({ editions: [...set] });
            },
          }),
          ` ${e.name} `,
          h('span', { class: 'muted' }, s.mode === 'test' ? `(${e.count})` : `(${e.playable} von ${e.count} spielbar)`),
        ),
      ),
    ),
  );
}

function lobby(state, a) {
  const r = state.room;
  return [
    r.isHost
      ? h(
          'section',
          { class: 'box' },
          h('h2', {}, 'Freunde einladen'),
          h('p', {}, 'Schick diesen Link an deine Mitspieler. Wer den Link hat, kann beitreten – also nur an Freunde geben.'),
          h('div', { class: 'invite' }, h('input', { id: 'invite', readonly: true, value: r.inviteUrl, onfocus: (e) => e.target.select() }), button('Kopieren', a.copyInvite)),
          r.game.settings.mode === 'host'
            ? h('p', { class: 'hint' }, 'Modus „Nur der Host spielt ab“: Teile diesen Tab mit Ton in Discord (Bildschirm übertragen → Fenster/Tab mit Audio).')
            : null,
        )
      : h('section', { class: 'box' }, h('h2', {}, 'Warte auf den Start …'), h('p', {}, 'Der Host startet das Spiel.')),
    h('section', { class: 'box' }, h('h2', {}, `Spieler (${r.game.players.length})`), playerList(state, a)),
    settingsPanel(state, a),
    r.isHost
      ? h(
          'section',
          { class: 'box' },
          button('Spiel starten', a.startGame, { class: 'primary big', disabled: !r.can.start }),
          r.startBlocker ? h('p', { class: 'hint' }, r.startBlocker) : null,
        )
      : null,
  ];
}

function songText(song) {
  return song ? `${song.a} – ${song.t}` : '';
}

function timelineView(state, a, player, { interactive }) {
  const r = state.room;
  const card = r.game.card;
  const isActive = r.game.activeId === player.id;
  const sel = isActive && card ? card.slot : null;
  const showSlots = isActive && r.game.phase === 'turn';
  const correct = isActive && card?.locked ? card.correctSlots || [] : [];
  const items = [];
  const slot = (i) => {
    const left = player.timeline[i - 1]?.y;
    const right = player.timeline[i]?.y;
    const label = left === undefined && right === undefined ? 'Hier' : left === undefined ? `vor ${right}` : right === undefined ? `nach ${left}` : `${left}–${right}`;
    if (!showSlots) return null;
    return h(
      'button',
      {
        type: 'button',
        class: `slot${sel === i ? ' selected' : ''}`,
        disabled: !interactive,
        onclick: interactive ? () => a.selectSlot(i) : undefined,
        'aria-pressed': sel === i ? 'true' : 'false',
        title: label,
      },
      sel === i ? '▼ hier' : '+',
    );
  };
  for (let i = 0; i <= player.timeline.length; i++) {
    items.push(slot(i));
    if (correct.length && !card.correct && correct.includes(i)) items.push(h('span', { class: 'hint-slot' }, '✓ richtig wäre hier'));
    const c = player.timeline[i];
    if (c) {
      const isNew = isActive && card?.locked && card.correct && card.song?.id === c.id;
      items.push(
        h('div', { class: `card${isNew ? ' new' : ''}` }, h('div', { class: 'year' }, c.y), h('div', { class: 'artist' }, c.a), h('div', { class: 'title' }, c.t)),
      );
    }
  }
  return h('div', { class: 'timeline' }, items);
}

function mysteryCard(state) {
  const r = state.room;
  const card = r.game.card;
  if (!card) return null;
  if (!card.locked) {
    return h('div', { class: 'card mystery' }, h('div', { class: 'year' }, '?'), h('div', { class: 'title' }, 'Welches Jahr?'));
  }
  const s = card.song;
  return h(
    'div',
    { class: `card reveal ${card.correct ? 'ok' : 'wrong'}` },
    s?.img ? h('img', { src: s.img, alt: '', width: 96, height: 96 }) : null,
    h('div', { class: 'year' }, s?.y ?? '?'),
    h('div', { class: 'artist' }, s?.a ?? ''),
    h('div', { class: 'title' }, s?.t ?? ''),
    h('div', { class: 'verdict' }, card.correct ? 'Richtig eingeordnet!' : 'Leider falsch – die Karte ist weg.'),
  );
}

function audioControls(state, a) {
  const r = state.room;
  const mode = r.game.settings.mode;
  const iHear = mode === 'everyone' || mode === 'test' || (mode === 'host' && r.isHost);
  const my = r.myAudio;
  let status = null;
  if (iHear) {
    status = my.state === 'error' ? `Fehler: ${FAIL_REASON[my.reason] || my.reason}` : { idle: '–', preparing: 'lädt …', ready: 'bereit', playing: 'läuft', stopped: 'angehalten' }[my.state];
  }
  return h(
    'div',
    { class: 'audio' },
    r.can.audioControl ? [button('↻ Nochmal abspielen', a.replay), ' ', button('■ Stopp', a.stopMusic)] : null,
    iHear
      ? [
          h('label', { class: 'volume' }, ' Lautstärke ', h('input', { id: 'volume', type: 'range', min: 0, max: 1, step: 0.05, value: state.volume, oninput: (e) => a.setVolume(e.target.value) })),
          h('span', { class: 'muted' }, ` Musik: ${status || '–'}`, my.drift !== null && my.drift !== undefined && mode === 'everyone' ? ` (Versatz ${my.drift} ms)` : ''),
        ]
      : h('span', { class: 'muted' }, 'Die Musik kommt vom Host (z. B. Discord-Stream).'),
  );
}

function logView(state) {
  const g = state.room.game;
  const name = (id) => g.players.find((p) => p.id === id)?.name || '?';
  const lines = g.log
    .slice(-6)
    .reverse()
    .map((e) => {
      if (e.k === 'placed') return `${name(e.p)}: ${songText(e.song)} (${e.song?.y}) – ${e.ok ? 'richtig' : 'falsch'}`;
      if (e.k === 'skipped') return `Übersprungen${e.reason === 'unavailable' ? ' (nicht verfügbar)' : ''}: ${songText(e.song)}`;
      if (e.k === 'turnSkipped') return `${name(e.p)} wurde übersprungen`;
      if (e.k === 'joined') return `${name(e.p)} ist beigetreten`;
      if (e.k === 'left') return `${e.name} wurde entfernt`;
      return null;
    })
    .filter(Boolean);
  return lines.length ? h('section', { class: 'box log' }, h('h3', {}, 'Verlauf'), h('ul', {}, lines.map((l) => h('li', {}, l)))) : null;
}

function game(state, a) {
  const r = state.room;
  const g = r.game;
  const active = r.activePlayer;
  const others = g.players.filter((p) => p.id !== active?.id);
  let headline;
  if (g.phase === 'ended') {
    headline = r.winners.length
      ? `🏆 ${r.winners.map((p) => p.name).join(' & ')} ${r.winners.length > 1 ? 'gewinnen' : 'gewinnt'}!`
      : 'Spiel beendet.';
  } else if (r.isMyTurn) headline = 'Du bist dran! Wo liegt dieser Song in deiner Zeitleiste?';
  else if (g.phase === 'turn') headline = `${active?.name ?? '?'} ist dran.`;
  else headline = `${active?.name ?? '?'} hat gelegt.`;

  return [
    h('section', { class: 'box turn' }, h('h2', {}, headline), h('p', { class: 'muted' }, `Karte ${g.round} · noch ${g.deckLeft} Songs im Stapel · Ziel: ${g.settings.target} Karten`), audioControls(state, a)),
    active
      ? h(
          'section',
          { class: 'box board' },
          h('div', { class: 'board-head' }, mysteryCard(state), h('div', {}, h('h3', {}, active.id === r.me ? 'Deine Zeitleiste' : `Zeitleiste von ${active.name}`))),
          timelineView(state, a, active, { interactive: r.can.select }),
          h(
            'div',
            { class: 'actions' },
            r.can.select ? button('Hier festlegen', a.lockIn, { class: 'primary big', disabled: !r.can.lock }) : null,
            r.can.skipSong ? button('Song überspringen (nicht verfügbar)', a.skipSong, { class: 'small' }) : null,
            r.can.next ? button(g.phase === 'reveal' ? 'Weiter zum nächsten Spieler' : 'Weiter', a.nextTurn, { class: 'primary big' }) : null,
            r.can.skipTurn && !active.connected ? button(`${active.name} überspringen (getrennt)`, a.skipTurn) : null,
          ),
        )
      : null,
    h(
      'section',
      { class: 'box' },
      h('h2', {}, 'Alle Zeitleisten'),
      others.map((p) => h('div', { class: 'other' }, h('h3', {}, `${p.name} – ${p.timeline.length}/${g.settings.target}${p.connected ? '' : ' (getrennt)'}`), timelineView(state, a, p, { interactive: false }))),
      playerList(state, a),
    ),
    logView(state),
    r.isHost
      ? h(
          'section',
          { class: 'box host-tools' },
          h('h3', {}, 'Host'),
          r.can.skipTurn ? button('Zug überspringen', a.skipTurn) : null,
          ' ',
          r.can.endGame ? button('Spiel beenden', () => confirm('Spiel wirklich beenden?') && a.endGame()) : null,
          ' ',
          r.can.reset ? button('Neues Spiel (zurück zur Lobby)', () => (g.phase === 'ended' || confirm('Zurück zur Lobby? Der Spielstand geht verloren.')) && a.newGame(), { class: g.phase === 'ended' ? 'primary' : '' }) : null,
          h('p', { class: 'hint' }, 'Einladungslink (für Nachzügler): ', h('input', { readonly: true, value: r.inviteUrl, onfocus: (e) => e.target.select(), class: 'inline' })),
        )
      : null,
  ];
}

function roomScreen(state, a) {
  const r = state.room;
  const online = r.connection === 'online';
  return h(
    'main',
    { class: 'page wide' },
    h(
      'header',
      { class: 'top' },
      h('h1', {}, 'RaDino'),
      h('span', { class: `badge c-${online ? 'ok' : 'warn'}` }, r.isHost ? `Raum: ${CONNECTION[r.connection] || r.connection}` : `Verbindung: ${CONNECTION[r.connection] || r.connection}`),
      button(r.isHost ? 'Raum schließen' : 'Verlassen', () => confirm(r.isHost ? 'Raum schließen? Das Spiel endet für alle.' : 'Raum verlassen?') && a.leaveRoom(), { class: 'small' }),
    ),
    errorBox(state, a),
    noticeBox(state),
    r.connectionMessage && !online ? h('p', { class: 'hint' }, r.connectionMessage) : null,
    spotifyPanel(state, a),
    !r.game ? h('section', { class: 'box' }, h('h2', {}, 'Verbinde mit dem Host …'), h('p', {}, 'Der Host-Tab muss geöffnet sein.')) : r.game.phase === 'lobby' ? lobby(state, a) : game(state, a),
  );
}

// ── Einhängen ────────────────────────────────────────────────────────────────

export function mountUI(root, app) {
  let scheduled = false;
  const render = () => {
    scheduled = false;
    const state = app.getState();
    // Fokus und Cursor in Eingabefeldern über das Neuzeichnen retten.
    const active = document.activeElement;
    const focusId = active?.id;
    const sel = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    const draft = focusId && active.tagName === 'INPUT' && active.type !== 'range' ? active.value : null;
    const scroll = window.scrollY;

    root.replaceChildren(state.screen === 'room' ? roomScreen(state, app.actions) : homeScreen(state, app.actions));

    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        if (draft !== null && el.value !== draft) el.value = draft;
        el.focus({ preventScroll: true });
        try {
          if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]);
        } catch {
          /* nicht jedes Feld kann das */
        }
      }
    }
    window.scrollTo(0, scroll);
  };
  app.subscribe(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(render);
    }
  });
  render();
}
