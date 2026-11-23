// Einstiegspunkt: Login-Rückkehr verarbeiten, Songs laden, App + Oberfläche starten.

import { CONFIG } from '../config.js';
import { spotifyAuth } from './music/spotify-auth.js';
import { loadSongs } from './app/songs.js';
import { createApp } from './app/app.js';
import { mountUI, renderMessage } from './ui/ui.js';
import { installRelayPeer } from './net/relay-peer.js';

async function boot() {
  const root = document.getElementById('app');

  // Schutz gegen Einbetten der Seite in fremde Seiten (Clickjacking).
  if (window.top !== window.self) {
    renderMessage(root, 'RaDino kann nicht eingebettet werden.', 'Bitte direkt öffnen.');
    return;
  }

  // 1. Rückkehr vom Spotify-Login?
  const auth = await spotifyAuth.handleRedirect();
  if (auth.handled && auth.mode === 'popup') {
    renderMessage(
      root,
      auth.ok ? 'Spotify-Anmeldung erfolgreich.' : 'Spotify-Anmeldung fehlgeschlagen.',
      auth.ok ? 'Dieses Fenster schließt sich gleich. Falls nicht, einfach schließen.' : auth.error,
    );
    setTimeout(() => window.close(), auth.ok ? 600 : 6000);
    return;
  }

  // 2. Songs laden
  let db;
  try {
    db = await loadSongs();
  } catch (e) {
    renderMessage(root, 'Songliste konnte nicht geladen werden.', e.message);
    return;
  }

  // 3. App starten
  const query = new URLSearchParams(window.location.search);
  const testMode = CONFIG.testMode || query.has('test');
  if (query.has('fakenet')) (await import('./dev/fake-peer.js')).installFakePeer();
  else installRelayPeer();
  const app = createApp({ db, testMode });
  mountUI(root, app);
  if (testMode || query.has('fakenet')) window.radino = app; // nur zum Debuggen
  if (auth.handled && !auth.ok && auth.error) app.showError(auth.error);
  app.autoResume(auth.handled ? auth.resume : null);
}

boot().catch((e) => {
  console.error(e);
  const root = document.getElementById('app');
  root.textContent = `Unerwarteter Fehler: ${e.message}`;
});
