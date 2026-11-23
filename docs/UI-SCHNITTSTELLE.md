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
    challenge: null | Challenge,   // nur in der Anzweifel-Phase (Regel „Marken“, siehe unten)
    can: {
      editSettings, start, select, lock, next, skipSong, skipTurn,
      endGame, reset, audioControl, kick,
      challenge, pass, endChallenge, giveToken, revokeToken, // Regel „Marken“
    },
  },
}
```

`Game` (gleiche Sicht für alle Spieler; der verdeckte Song ist **nicht** enthalten):

```js
{
  phase: 'lobby' | 'turn' | 'challenge' | 'reveal' | 'ended', // 'challenge' nur mit settings.tokens
  settings: { mode: 'host' | 'everyone' | 'test', target, editions: [id], startAt, tokens: boolean },
  players: [Player],
  order: [playerId],               // Zugreihenfolge
  activeId: playerId | null,
  round: number,                   // laufende Kartennummer
  card: null | {
    by: playerId, slot: number|null, locked: boolean, correct: boolean|null, round,
    song?: { id, t, a, y, img },   // erst nach dem Aufdecken (locked)
    correctSlots?: [number],       // wo die Karte richtig gewesen wäre
    // nur mit settings.tokens:
    fixed?: boolean,               // Lücke festgelegt (slot ändert sich nicht mehr), aber noch verdeckt
    challenge?: null | { until, picks: [{ p: playerId, slot }], passed: [playerId], pending: [playerId], freeSlots: [number] },
    wonBy?: playerId | null,       // Anzweifler, der die Karte bekommen hat (nach dem Aufdecken)
    grant?: { by: playerId } | null, // in diesem Zug vergebene Marke und wer sie gegeben hat
  },
  deckLeft: number,
  winners: [playerId],
  endReason: 'target' | 'deck' | 'host' | null,
  log: [{ k: 'placed'|'skipped'|'turnSkipped'|'joined'|'left'|'stolen'|'token'|'tokenRevoked', p?, ok?, song?, reason?, name?, from?, by? }],
  tokenLog: [TokenEntry],          // Marken-Protokoll des ganzen Spiels, älteste zuerst (höchstens 500)
  audio: { [playerId]: { s: <Spotify-Status>, msg, play: 'preparing'|'ready'|'playing'|'late'|'failed:<grund>'|null } },
}
Player = { id, name, host, connected, timeline: [{ id, t, a, y, img }], tokens: number } // Zeitleiste nach Jahr sortiert
```

**Lücken (slots):** Bei einer Zeitleiste mit `n` Karten gibt es `n + 1` Lücken. Lücke `0` liegt vor der ersten Karte, Lücke `n` nach der letzten.

`img` ist eine Cover-URL von `i.scdn.co`, falls beim Abgleich gefunden. Sonst ist der Wert `null`.

## Regel „Marken“ (optional, `settings.tokens`)

Der Host schaltet die Regel in der Lobby ein (`updateSettings({ tokens: true })`). Ist sie aus, gibt es weder die Phase `challenge` noch die Zusatzfelder an `card`, und alle neuen `can.*` sind `false`. `Player.tokens` und `tokenLog` sind immer vorhanden, aber nur mit eingeschalteter Regel von Bedeutung.

Feste Werte (`TOKENS` in `src/core/game.js`): 2 Marken zum Start, höchstens 5 pro Spieler, 15 Sekunden zum Anzweifeln.

**Ablauf eines Zugs mit Marken**

1. `turn`: wie bisher. Mit `lockIn()` wird die Lücke festgelegt, aber **nicht aufgedeckt**: `card.fixed` ist `true`, `card.locked` bleibt `false`, `card.song` fehlt weiter.
2. `challenge`: Jeder andere verbundene Spieler mit mindestens einer Marke darf einmal anzweifeln (`challenge(slot)`, kostet eine Marke, nicht widerrufbar) oder passen (`passChallenge()`). Die Lücke des aktiven Spielers und schon gewählte Lücken sind gesperrt. Die Phase endet, sobald niemand mehr aussteht, das Zeitlimit abläuft oder der Host `endChallenge()` auslöst. Gibt es gar keinen Berechtigten, wird sie übersprungen. Wer die Verbindung verliert, gilt als gepasst.
3. `reveal`: `card.locked` wird `true`, `card.song` und `card.correct` kommen an. `card.correct` bezieht sich immer auf den aktiven Spieler. Lag er falsch und ein Anzweifler richtig, steht dessen ID in `card.wonBy` und die Karte liegt in dessen Zeitleiste (bei mehreren Richtigen gewinnt der erste in `card.challenge.picks`). `card.challenge` bleibt zum Anzeigen der Tipps erhalten. Erreicht der Anzweifler damit das Kartenziel, ist die Phase direkt `ended`.
4. Solange die Phase `reveal` ist, kann jeder andere Spieler dem aktiven Spieler eine Marke geben (`giveToken()`), höchstens eine pro Zug (`card.grant`). Der Host kann sie zurücknehmen (`revokeToken()`); danach kann wieder eine vergeben werden. Mit `nextTurn()` ist die Gelegenheit vorbei.

**`room.challenge`** (nur in der Phase `challenge`, sonst `null`):

```js
Challenge = {
  endsAt: number | null,           // Endzeitpunkt in der eigenen Uhr (vergleichbar mit Date.now())
  lockedSlot: number,              // Lücke des aktiven Spielers (gesperrt)
  picks: [{ p: playerId, slot }],  // wer welche Lücke angezweifelt hat, in dieser Reihenfolge
  passed: [playerId],              // wer gepasst hat (auch: Verbindung verloren)
  pending: [playerId],             // wer noch anzweifeln oder passen kann
  freeSlots: [number],             // Lücken, die noch gewählt werden können
  mine: number | null,             // die selbst angezweifelte Lücke
}
```

`card.challenge.until` ist derselbe Endzeitpunkt in der Uhr des Hosts. Für einen Countdown `room.challenge.endsAt` verwenden. Alle Lücken beziehen sich auf die Zeitleiste des aktiven Spielers.

**`room.can`**

| Eintrag | Bedeutung |
|---|---|
| `challenge`, `pass` | ich stehe in der Anzweifel-Phase noch aus |
| `endChallenge` | Host: Anzweifel-Phase sofort beenden und aufdecken |
| `giveToken` | ich darf dem aktiven Spieler jetzt eine Marke geben (nicht der aktive Spieler selbst, noch keine vergeben, Obergrenze nicht erreicht) |
| `revokeToken` | Host: in diesem Zug wurde eine Marke vergeben und kann zurückgenommen werden |

**Marken-Protokoll `game.tokenLog`**

```js
TokenEntry = {
  r: number,                       // Runde (laufende Kartennummer)
  k: 'got' | 'spent' | 'revoked',  // bekommen | zum Anzweifeln eingesetzt | vom Host zurückgenommen
  p: playerId, name: string,       // wer die Marke bekommen, eingesetzt oder verloren hat (Name zum Zeitpunkt des Eintrags)
  by?: playerId, byName?: string,  // bei 'got' und 'revoked': wer sie vergeben bzw. zurückgenommen hat
  won?: boolean | null,            // bei 'spent': hat das Anzweifeln die Karte gebracht? null = noch nicht aufgedeckt
  n: number,                       // Markenstand von p danach
}
```

Das Protokoll gilt für das ganze Spiel und wird bei „Neues Spiel“ geleert. `won` steht schon im Stand, während die Oberfläche das Aufdecken noch animiert: bis dahin nicht anzeigen.

**Verlauf `game.log`**: `{ k: 'stolen', p, from, song }` (p hat die Karte von from geklaut; steht direkt hinter dem zugehörigen `placed`-Eintrag), `{ k: 'token', p, by }` (p bekommt eine Marke von by), `{ k: 'tokenRevoked', p, by }`.

**Bedienung in `src/ui/`**

- Lobby: Schiebeschalter „Marken“ (`.schalter`) mit einem Satz Erklärung.
- Markenstand: in jeder Zeile unter „Zeitleisten“ fünf Plätze links neben dem Kartenstand (`.markenstand`, belegte gefüllt). Die Marke gibt es klein und einfarbig (`symbol('marke')`) und groß als Münze mit orangem Rand (`marke()` in `pixel.js`).
- Festlegen: Die verdeckte Karte rastet ein, bekommt einen hellen Rahmen und ein Schloss (`.zeiger.fest`).
- Anzweifeln: Die Lücke wird auf der Skala gewählt. In jeder freien Lücke steht ein vorgezeichneter Marken-Platz. Ein Klick (oder ← →) steckt die eigene Marke probehalber dorthin, der Hauptknopf „Anzweifeln“ (oder Enter) löst `challenge(slot)` aus. Die Tipps der Anzweifler stecken mit Namen als Marken in der Skala (`.tipp`). Gesperrt ist, wo schon die Karte oder eine Marke hängt. Die Frist läuft in der Aktionszeile als Skalenstriche ab (`.frist`), daneben „Passen“ und für den Host „Jetzt aufdecken“.
- Aufdecken: Jede gesteckte Marke bekommt ihr Urteil (grün mit Haken, rot mit Kreuz). Bekommt ein Anzweifler die Karte, zeigt sie kurz sein Namensschild und fliegt in seine Zeile unter „Zeitleisten“ (`Skala.klau()`). So lange bleiben die Karte dort und der Verlaufseintrag `stolen` verborgen.
- Marke vergeben: Pixel-Knopf „Marke für …“ rechts in der Aktionszeile (`.knopf.neben`), danach ein Hinweis und für den Host „zurücknehmen“.
- Marken-Protokoll: ganz unten, zugeklappt (`.protokoll`). Je Zeile Karte, Spieler, Ereignis und Stand danach.

Was `skala.js` dafür entgegennimmt (`fest`, `zweifel`, `dieb`, `geklaut`), steht im Kopf der Datei.

## Aktionen `app.actions`

| Aktion | Wann |
|---|---|
| `setName(name)` | Name ändern (auch im Raum) |
| `createRoom()` | Startseite: neues Spiel als Host |
| `resumeRoom()`, `discardSavedRoom()` | gespeichertes Host-Spiel fortsetzen oder verwerfen |
| `joinRoom()` | Startseite mit Einladung: beitreten |
| `leaveRoom()` | Raum verlassen bzw. als Host schließen |
| `spotifyLogin()`, `spotifyLogout()` | Spotify-Anmeldung (öffnet ein Popup) |
| `updateSettings({ mode?, target?, editions?, startAt?, tokens? })` | Host in der Lobby |
| `startGame()` | Host in der Lobby (`can.start`) |
| `selectSlot(i)` | Aktiver Spieler wählt eine Lücke (`can.select`) |
| `lockIn()` | Wahl festlegen (`can.lock`) |
| `challenge(slot)` | Marken: eine freie Lücke anzweifeln, kostet eine Marke (`can.challenge`) |
| `passChallenge()` | Marken: nicht anzweifeln (`can.pass`) |
| `endChallenge()` | Marken: Host beendet die Anzweifel-Phase (`can.endChallenge`) |
| `giveToken()` | Marken: dem aktiven Spieler nach dem Aufdecken eine Marke geben (`can.giveToken`) |
| `revokeToken()` | Marken: Host nimmt die in diesem Zug vergebene Marke zurück (`can.revokeToken`) |
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
