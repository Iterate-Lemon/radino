// ─────────────────────────────────────────────────────────────────────────
//  RaDino – Einstellungen
//  Hier trägst du bei der Einrichtung die Client-ID deiner Spotify-App ein.
//  Die Client-ID ist kein Geheimnis und darf öffentlich im Repository stehen.
//  (Ein "Client Secret" wird NICHT gebraucht und darf hier nie stehen.)
// ─────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  // Aus dem Spotify Developer Dashboard → deine App → "Client ID"
  spotifyClientId: '',

  // Leer lassen = automatisch die Adresse dieser Seite, z. B.
  // https://deinname.github.io/radino/   (genau so im Dashboard eintragen)
  spotifyRedirectUri: '',

  // Land für die Songsuche im Abgleich-Werkzeug
  market: 'DE',

  // Vermittlungsdienst für den Verbindungsaufbau (kostenloser PeerJS-Dienst).
  // Wer das ändert, muss auch die Content-Security-Policy in index.html anpassen.
  peer: { host: '0.peerjs.com', port: 443, path: '/', secure: true },

  // Optional: eigene STUN/TURN-Server. Nur nötig, wenn sich einzelne Mitspieler
  // trotz allem nicht verbinden können (siehe Anleitung, "Probleme"). Leer = Standard.
  // Beispiel: [{ urls: 'turn:turn.example.com:3478', username: 'name', credential: 'passwort' }]
  iceServers: [],

  // Testmodus "ohne Musik" anbieten (sonst nur mit ?test in der Adresse)
  testMode: false,
};
