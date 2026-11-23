// App-Steuerung: verbindet Spiellogik, Netzwerk und Musik und stellt der
// Oberfläche genau zwei Dinge bereit (siehe docs/UI-SCHNITTSTELLE.md):
//   app.getState()   -> unveränderliches Anzeige-Modell (reine Daten)
//   app.actions.*    -> Funktionen für Benutzeraktionen
//   app.subscribe(fn)-> fn wird bei jeder Änderung aufgerufen
// Die Oberfläche (src/ui/) kann komplett ersetzt werden, ohne hier etwas zu ändern.

import { CONFIG } from '../../config.js';
import { Emitter, local, session } from '../lib/util.js';
import { cleanName, normalizeSettings, TOKENS } from '../core/game.js';
import { parseInvite } from '../net/protocol.js';
import { spotifyAuth } from '../music/spotify-auth.js';
import { SpotifyMusic } from '../music/spotify-music.js';
import { MockMusic } from '../music/mock-music.js';
import { HostSession, loadSavedHost, discardSavedHost } from './host-session.js';
import { GuestSession } from './guest-session.js';

const NAME_KEY = 'radino.name';
const VOLUME_KEY = 'radino.volume';
const HOSTING_KEY = 'radino.hosting';

const REJECT_TEXT = {
  'bad-key': 'Der Einladungslink ist ungültig. Bitte den Host um einen neuen Link.',
  full: 'Der Raum ist voll.',
};

export function createApp({ db, testMode = false }) {
  const events = new Emitter();
  const spotify = new SpotifyMusic();
  const mock = new MockMusic();
  const musicFor = (mode) => (mode === 'test' ? mock : mode === 'host' || mode === 'everyone' ? spotify : null);
  const volume = local.read(VOLUME_KEY, 0.8);
  spotify.setVolume(volume);

  const defaults = normalizeSettings({
    mode: 'host',
    target: 10,
    startAt: 0,
    editions: db.editions.filter((e) => e.id !== 'de-0042').map((e) => e.id),
  });

  let room = null; // HostSession | GuestSession
  let ui = {
    name: local.read(NAME_KEY, ''),
    invite: parseInvite(window.location.hash),
    error: null,
    notice: null,
    volume,
  };
  let cached = null;

  const changed = () => {
    cached = null;
    events.emit('change');
  };
  spotify.on('status', changed);
  spotifyAuth.on('change', (e) => {
    if (e.type === 'login' && !e.ok && e.error) ui = { ...ui, error: e.error };
    if (room?.music === spotify && spotifyAuth.loggedIn) spotify.connect();
    changed();
  });
  window.addEventListener('hashchange', () => {
    ui = { ...ui, invite: parseInvite(window.location.hash) };
    changed();
  });
  // Browser verlangen für Audio eine Nutzeraktion: bei jedem Klick freischalten.
  document.addEventListener('pointerdown', () => room?.music?.activate?.(), { capture: true });

  function attach(r) {
    room?.close?.({ forget: false });
    room = r;
    r.on('change', changed);
    r.start();
    changed();
  }

  // ── Anzeige-Modell ─────────────────────────────────────────────────────────

  function buildState() {
    const saved = loadSavedHost();
    const base = {
      screen: room ? 'room' : 'home',
      testMode,
      name: ui.name,
      invite: ui.invite ? { roomId: ui.invite.roomId } : null,
      savedRoom: saved
        ? { savedAt: saved.savedAt, players: saved.game.players.length, phase: saved.game.phase }
        : null,
      error: ui.error,
      notice: room?.notice || ui.notice,
      volume: ui.volume,
      editions: db.editions,
      songCount: db.songs.length,
      playableCount: db.spotifyIds.size,
      spotify: {
        configured: spotifyAuth.configured,
        loggedIn: spotifyAuth.loggedIn,
        status: spotify.status,
        message: spotify.message,
        needed: false,
      },
      room: null,
    };
    if (!room) return base;

    const g = room.view();
    const me = room.me;
    const isHost = room.role === 'host';
    const mode = g?.settings?.mode;
    const needsSpotify = mode === 'everyone' || (isHost && mode === 'host');
    base.spotify.needed = needsSpotify;

    const conn = room.connection.status;
    const r = {
      role: room.role,
      isHost,
      me,
      inviteUrl: isHost ? room.inviteUrl : null,
      connection: conn,
      connectionMessage: room.transport.statusMessage || '',
      game: g,
      can: {},
      startBlocker: null,
    };
    const audioClient = isHost ? room.local : room.audio;
    r.myAudio = { state: audioClient.state, reason: audioClient.reason, drift: audioClient.drift };

    if (g) {
      const phase = g.phase;
      const active = g.activeId;
      const mine = active === me;
      const card = g.card;
      const playing = phase === 'turn' || phase === 'challenge' || phase === 'reveal';
      r.me = me;
      r.isMyTurn = mine && phase === 'turn';
      r.activePlayer = g.players.find((p) => p.id === active) || null;
      r.mePlayer = g.players.find((p) => p.id === me) || null;
      r.winners = g.players.filter((p) => g.winners.includes(p.id));

      let startBlocker = null;
      if (isHost && phase === 'lobby') {
        const hostAudio = g.audio?.[me]?.s;
        if (mode !== 'test' && db.spotifyIds.size === 0) {
          startBlocker = 'Die Songliste enthält noch keine Spotify-IDs. Bitte zuerst den Abgleich durchführen (siehe Anleitung).';
        } else if (mode !== 'test' && hostAudio !== 'ready') {
          startBlocker = 'Bitte zuerst bei Spotify anmelden (der Player muss „bereit“ sein).';
        } else if (!g.settings.editions.length) {
          startBlocker = 'Bitte mindestens eine Edition auswählen.';
        }
      }
      r.startBlocker = startBlocker;

      // Regel "Marken": Anzweifel-Phase und Markenvergabe
      const ch = phase === 'challenge' ? card?.challenge : null;
      r.challenge = ch
        ? {
            // Endzeitpunkt in der eigenen Uhr (Date.now()), null = ohne Zeitlimit
            endsAt: ch.until === null || ch.until === undefined ? null : isHost ? ch.until : Math.round(room.transport.toLocalTime(ch.until)),
            lockedSlot: card.slot,
            picks: ch.picks.map((c) => ({ ...c })),
            passed: ch.passed.slice(),
            pending: ch.pending.slice(),
            freeSlots: ch.freeSlots.slice(),
            mine: ch.picks.find((c) => c.p === me)?.slot ?? null,
          }
        : null;
      const maySay = !!ch && ch.pending.includes(me);
      const grantOpen = !!g.settings.tokens && phase === 'reveal' && !!card;
      r.can = {
        challenge: maySay,
        pass: maySay,
        endChallenge: isHost && phase === 'challenge',
        giveToken: grantOpen && !mine && !card.grant && !!r.mePlayer && !!r.activePlayer && r.activePlayer.tokens < TOKENS.max,
        revokeToken: grantOpen && isHost && !!card.grant,
        editSettings: isHost && phase === 'lobby',
        start: isHost && phase === 'lobby' && !startBlocker,
        select: phase === 'turn' && mine && !card?.locked,
        lock: phase === 'turn' && mine && !card?.locked && card?.slot !== null && card?.slot !== undefined,
        next: phase === 'reveal' && (mine || isHost),
        skipSong: phase === 'turn' && !card?.locked && (mine || isHost),
        skipTurn: isHost && phase === 'turn' && !mine,
        endGame: isHost && playing,
        reset: isHost && phase !== 'lobby',
        audioControl: playing && (isHost || mine) && mode !== undefined,
        kick: isHost,
      };
    }
    if (conn === 'rejected') base.error = REJECT_TEXT[room.transport.statusMessage] || 'Der Host hat den Beitritt abgelehnt.';
    if (conn === 'kicked') base.error = 'Du wurdest vom Host aus dem Raum entfernt.';
    base.room = r;
    return base;
  }

  function getState() {
    if (!cached) cached = Object.freeze(buildState());
    return cached;
  }

  // ── Aktionen ───────────────────────────────────────────────────────────────

  const setError = (error) => {
    ui = { ...ui, error };
    changed();
  };

  const actions = {
    setName(name) {
      const n = cleanName(name);
      ui = { ...ui, name: n };
      local.write(NAME_KEY, n);
      room?.rename(n);
      changed();
    },

    createRoom() {
      discardSavedHost();
      const r = new HostSession({ db, name: ui.name || 'Host', musicFor, defaults });
      session.write(HOSTING_KEY, r.roomId);
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
      ui = { ...ui, invite: null, error: null };
      attach(r);
    },

    resumeRoom() {
      const saved = loadSavedHost();
      if (!saved) return setError('Kein gespeichertes Spiel gefunden.');
      const r = new HostSession({ db, name: ui.name, saved, musicFor, defaults });
      session.write(HOSTING_KEY, r.roomId);
      ui = { ...ui, error: null };
      attach(r);
    },

    discardSavedRoom() {
      discardSavedHost();
      changed();
    },

    joinRoom() {
      if (!ui.invite) return setError('Kein gültiger Einladungslink.');
      ui = { ...ui, error: null };
      attach(new GuestSession({ db, invite: ui.invite, name: ui.name || 'Gast', musicFor }));
    },

    leaveRoom() {
      if (!room) return;
      const wasHost = room.role === 'host';
      room.close({ forget: true });
      room = null;
      session.remove(HOSTING_KEY);
      if (!wasHost) {
        window.history.replaceState(null, '', window.location.pathname);
        ui = { ...ui, invite: null };
      }
      changed();
    },

    async spotifyLogin() {
      try {
        let resume = null;
        if (room?.role === 'host') resume = { kind: 'host' };
        else if (room?.role === 'guest' || ui.invite) resume = { kind: 'join', hash: window.location.hash };
        await spotifyAuth.login({ resume });
      } catch (e) {
        setError(e.message);
      }
    },

    spotifyLogout() {
      spotifyAuth.logout();
    },

    updateSettings(partial) {
      if (room?.role !== 'host') return;
      room.act('settings', { settings: { ...room.game.settings, ...partial } });
    },

    startGame() {
      room?.music?.activate?.();
      room?.act('start');
    },
    selectSlot(slot) {
      room?.act('select', { slot });
    },
    lockIn() {
      room?.act('lock');
    },
    challenge(slot) {
      room?.act('challenge', { slot });
    },
    passChallenge() {
      room?.act('pass');
    },
    endChallenge() {
      if (room?.role === 'host') room.act('endChallenge');
    },
    giveToken() {
      room?.act('giveToken');
    },
    revokeToken() {
      if (room?.role === 'host') room.act('revokeToken');
    },
    nextTurn() {
      room?.act('next');
    },
    skipSong() {
      room?.act('skipSong', room.role === 'host' ? { round: room.game.card?.round } : {});
    },
    skipTurn() {
      room?.act('skipTurn');
    },
    endGame() {
      room?.act('endGame');
    },
    newGame() {
      room?.act('reset');
    },
    kick(pid) {
      if (room?.role === 'host') room.act('removePlayer', { id: pid });
    },
    replay() {
      room?.ctl('replay');
    },
    stopMusic() {
      room?.ctl('stop');
    },
    setVolume(v) {
      const vol = Math.max(0, Math.min(1, Number(v) || 0));
      ui = { ...ui, volume: vol };
      local.write(VOLUME_KEY, vol);
      spotify.setVolume(vol);
      mock.setVolume(vol);
      changed();
    },
    async copyInvite() {
      if (room?.role !== 'host') return false;
      try {
        await navigator.clipboard.writeText(room.inviteUrl);
        ui = { ...ui, notice: 'Einladungslink kopiert.' };
        changed();
        setTimeout(() => {
          ui = { ...ui, notice: null };
          changed();
        }, 3000);
        return true;
      } catch {
        return false;
      }
    },
    dismissError() {
      ui = { ...ui, error: null };
      changed();
    },
  };

  // ── Start: nach Neuladen automatisch weitermachen ──────────────────────────
  function autoResume(authResume) {
    const saved = loadSavedHost();
    const hosting = session.read(HOSTING_KEY);
    if ((authResume?.kind === 'host' || (hosting && saved?.roomId === hosting)) && saved) {
      actions.resumeRoom();
      return;
    }
    if (authResume?.kind === 'join' && authResume.hash) {
      window.history.replaceState(null, '', window.location.pathname + authResume.hash);
      ui = { ...ui, invite: parseInvite(authResume.hash) };
    }
    if (ui.invite && (session.read(`radino.seat.${ui.invite.roomId}`) || authResume?.kind === 'join')) {
      actions.joinRoom();
    }
  }

  return {
    getState,
    actions,
    subscribe: (fn) => events.on('change', fn),
    autoResume,
    showError: setError,
    config: CONFIG,
  };
}
