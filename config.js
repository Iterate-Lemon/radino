// ─────────────────────────────────────────────────────────────────────────
//  RaDino – Einstellungen
//  Hier trägst du bei der Einrichtung die Client-ID deiner Spotify-App ein.
//  Die Client-ID ist kein Geheimnis und darf öffentlich im Repository stehen.
//  (Ein "Client Secret" wird NICHT gebraucht und darf hier nie stehen.)
// ─────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  // Aus dem Spotify Developer Dashboard → deine App → "Client ID"
  spotifyClientId: '23d8552e67ad46e2bcf7ca02e64611f5',

  // Leer lassen = automatisch die Adresse dieser Seite, z. B.
  // https://deinname.github.io/radino/   (genau so im Dashboard eintragen)
  spotifyRedirectUri: '',

  // Land für die Songsuche im Abgleich-Werkzeug
  market: 'DE',

  // Verbindungsdienste (öffentliche MQTT-Broker per WebSocket), über die Host und
  // Mitspieler ihre verschlüsselten Spielnachrichten austauschen. Alle werden
  // gleichzeitig genutzt; solange einer erreichbar ist, läuft das Spiel.
  // Wer das ändert, muss auch die Content-Security-Policy in index.html und
  // tools/test.html anpassen (connect-src).
  relays: ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'],

  // Testmodus "ohne Musik" anbieten (sonst nur mit ?test in der Adresse)
  testMode: false,
};
