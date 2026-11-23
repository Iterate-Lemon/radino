# Oberflächen-Schnittstelle (für das Redesign)

Die Oberfläche (`src/ui/`) ist von Spiellogik, Netzwerk und Musik vollständig getrennt.
Ein neues Design ersetzt **nur** den Ordner `src/ui/`. Alles andere bleibt unangetastet.

Der Ordner besteht derzeit aus:

| Datei | Inhalt |
|---|---|
| `ui.js` | Bildschirme (Start, Verbinden, Lobby, Spiel mit Spielende), Meldungen, Rückfragen |
| `skala.js` | die Zeitleiste als Senderskala mit Songkarten, Auswahl und Aufdeck-Animation |
| `pixel.js` | eigene Pixelschrift, Dino-Maskottchen, Symbole (alles als SVG gezeichnet) |
| `dom.js` | kleine DOM-Helfer |
| `ui.css` | sämtliche Gestaltung |

Der Entwurf, aus dem das Design entstanden ist, liegt zum Nachschlagen in `design/prototyp/` (nicht Teil des Spiels).

## Vertrag

`src/main.js` importiert genau zwei Funktionen aus `src/ui/ui.js`:

```js
export function mountUI(root, app) { … }          // App-Oberfläche in root zeichnen
export function renderMessage(root, title, text) // Einfache Meldung (z. B. Ladefehler, Login-Popup)
```

`app` stellt bereit:

| Mitglied | Bedeutung |
|---|---|
| `app.getState()` | Aktuelles Anzeige-Modell. Reine, eingefrorene Daten; bei jeder Änderung ein neues Objekt. |
| `app.subscribe(fn)` | `fn()` wird nach jeder Änderung aufgerufen. Gibt eine Abmelde-Funktion zurück. |
| `app.actions.*` | Benutzeraktionen (siehe unten). Alle sind sicher aufrufbar. Was gerade nicht erlaubt ist, wird ignoriert. |

Ob eine Schaltfläche aktiv sein soll, steht in `state.room.can.*`. Die Oberfläche muss keine Spielregeln kennen.

## Anzeige-Modell `app.getState()`

```js
{
  screen: 'home' | 'room',
  testMode: boolean,               // Testmodus (ohne Musik) wählbar (?test)
  name: string,                    // eigener Name (gespeichert)
  invite: { roomId } | null,       // Seite wurde über einen Einladungslink geöffnet
  savedRoom: { savedAt, players, phase } | null, // Host kann ein gespeichertes Spiel fortsetzen
  error: string | null,            // Fehlermeldung (mit actions.dismissError() schließen)
  notice: string | null,           // kurzer Hinweis, verschwindet von selbst
  volume: number,                  // 0..1, eigene Lautstärke
  editions: [{ id, name, count, playable }], // Song-Editionen; playable = mit Spotify-ID
  songCount, playableCount,
  spotify: {
    configured: boolean,           // Client-ID in config.js eingetragen
    loggedIn: boolean,
    status: 'off' | 'login' | 'connecting' | 'ready' | 'error',
    message: string,               // Klartext zum Status / Fehler
    needed: boolean,               // braucht DIESER Spieler gerade Spotify?
  },
  room: null | {
    role: 'host' | 'guest',
    isHost: boolean,
    me: string,                    // eigene Spieler-ID
    inviteUrl: string | null,      // nur beim Host
    connection: 'connecting' | 'online' | 'retrying' | 'reconnecting' | 'host-missing'
              | 'rejected' | 'kicked' | 'error',
    connectionMessage: string,
    game: Game | null,             // null, bis der Gast den ersten Stand bekommen hat
    isMyTurn: boolean,
    activePlayer: Player | null,
    mePlayer: Player | null,
    winners: Player[],
    myAudio: { state: 'idle'|'preparing'|'ready'|'playing'|'stopped'|'error', reason, drift },
    startBlocker: string | null,   // warum "Spiel starten" gesperrt ist
    can: {
      editSettings, start, select, lock, next, skipSong, skipTurn,
      endGame, reset, audioControl, kick,
    },
  },
}
```

`Game` (gleiche Sicht für alle Spieler; der verdeckte Song ist **nicht** enthalten):

```js
{
  phase: 'lobby' | 'turn' | 'reveal' | 'ended',
  settings: { mode: 'host' | 'everyone' | 'test', target, editions: [id], startAt },
  players: [Player],
  order: [playerId],               // Zugreihenfolge
  activeId: playerId | null,
  round: number,                   // laufende Kartennummer
  card: null | {
    by: playerId, slot: number|null, locked: boolean, correct: boolean|null, round,
    song?: { id, t, a, y, img },   // erst nach dem Festlegen (locked)
    correctSlots?: [number],       // wo die Karte richtig gewesen wäre
  },
  deckLeft: number,
  winners: [playerId],
  endReason: 'target' | 'deck' | 'host' | null,
  log: [{ k: 'placed'|'skipped'|'turnSkipped'|'joined'|'left', p?, ok?, song?, reason?, name? }],
  audio: { [playerId]: { s: <Spotify-Status>, msg, play: 'preparing'|'ready'|'playing'|'late'|'failed:<grund>'|null } },
}
Player = { id, name, host, connected, timeline: [{ id, t, a, y, img }] } // Zeitleiste nach Jahr sortiert
```

**Lücken (slots):** Bei einer Zeitleiste mit `n` Karten gibt es `n + 1` Lücken. Lücke `0` liegt vor der ersten Karte, Lücke `n` nach der letzten.

`img` ist eine Cover-URL von `i.scdn.co`, falls beim Abgleich gefunden. Sonst ist der Wert `null`.

## Aktionen `app.actions`

| Aktion | Wann |
|---|---|
| `setName(name)` | Name ändern (auch im Raum) |
| `createRoom()` | Startseite: neues Spiel als Host |
| `resumeRoom()`, `discardSavedRoom()` | gespeichertes Host-Spiel fortsetzen oder verwerfen |
| `joinRoom()` | Startseite mit Einladung: beitreten |
| `leaveRoom()` | Raum verlassen bzw. als Host schließen |
| `spotifyLogin()`, `spotifyLogout()` | Spotify-Anmeldung (öffnet ein Popup) |
| `updateSettings({ mode?, target?, editions?, startAt? })` | Host in der Lobby |
| `startGame()` | Host in der Lobby (`can.start`) |
| `selectSlot(i)` | Aktiver Spieler wählt eine Lücke (`can.select`) |
| `lockIn()` | Wahl festlegen (`can.lock`) |
| `nextTurn()` | nach dem Aufdecken weiter (`can.next`) |
| `skipSong()` | Song überspringen (`can.skipSong`) |
| `skipTurn()` | Host überspringt den Zug, z. B. bei getrenntem Spieler (`can.skipTurn`) |
| `endGame()`, `newGame()` | Host: Spiel beenden / zurück zur Lobby |
| `kick(playerId)` | Host entfernt einen Spieler |
| `replay()`, `stopMusic()` | Musik neu starten / anhalten (`can.audioControl`) |
| `setVolume(0..1)` | eigene Lautstärke |
| `copyInvite()` | Einladungslink in die Zwischenablage (Promise → boolean) |
| `dismissError()` | Fehlermeldung schließen |

## Regeln für die neue Oberfläche

- **Texte aus dem Netz** (Spielernamen, Songtitel usw.) nur als Text einfügen: `textContent`, Textknoten oder das Escaping eines Frameworks. **Kein `innerHTML`** mit solchen Daten.
- Die Content-Security-Policy in `index.html` erlaubt nur Skripte und Styles von der eigenen Seite. Es gibt kein Inline-`<script>`, kein `style="…"` im HTML-Markup und keine externen Schriften oder CDNs. Wer Schriften oder Bilder braucht, legt sie ins Repository oder passt die Policy bewusst an.
- Schaltflächen nach `state.room.can.*` aktivieren oder deaktivieren.
- Während das Lied läuft, darf die Oberfläche nichts zum aktuellen Song zeigen. Sie bekommt die Daten vor dem Aufdecken ohnehin nicht.

## Entwickeln ohne Spotify und ohne zweiten Computer

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

- `http://127.0.0.1:8080/?test&fakenet` öffnen, ein Spiel erstellen und im Modus „Testmodus ohne Musik“ spielen.
  Den Einladungslink in weiteren **Tabs desselben Browsers** öffnen. `fakenet` ersetzt die Verbindungsdienste durch eine Verbindung zwischen den Tabs (ganz ohne Internet).
- Mit `?test` oder `?fakenet` liegt die App zum Ausprobieren unter `window.radino` (z. B. `radino.getState()`).
- Tabs im Hintergrund zeichnen erst neu, wenn man sie wieder ansieht, weil `requestAnimationFrame` dort pausiert. Das ist gewollt.
