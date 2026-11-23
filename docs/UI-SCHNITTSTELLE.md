# Oberflächen-Schnittstelle (für das Redesign)

Die Oberfläche (`src/ui/`) ist von Spiellogik, Netzwerk und Musik vollständig getrennt.
Ein neues Design ersetzt **nur** den Ordner `src/ui/`. Alles andere bleibt unangetastet.

Der Ordner besteht derzeit aus:

| Datei | Inhalt |
|---|---|
| `ui.js` | Bildschirme (Start, Verbinden, Lobby, Spiel mit Spielende), Meldungen, Rückfragen |
| `skala.js` | die Zeitleiste als Senderskala mit Songkarten, Auswahl und Aufdeck-Animation |
| `pixel.js` | eigene Pixelschrift, Dino-Maskottchen, Symbole (alles als SVG gezeichnet) |
| `klang.js` | leise Klänge zu Knöpfen und Animationen, im Browser erzeugt (siehe „Klänge“) |
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
    songSave: 'idle' | 'saving' | 'saved', // aktuelles Lied im eigenen Spotify-Konto (siehe „Lied speichern“)
    startBlocker: string | null,   // warum "Spiel starten" gesperrt ist
    challenge: null | Challenge,   // nur in der Anzweifel-Phase (Regel „Marken“, siehe unten)
    can: {
      editSettings, start, select, lock, next, skipSong, skipTurn,
      endGame, reset, audioControl, kick, saveSong,
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
  out: [playerId],                 // nach einem Gleichstand ausgeschieden (siehe „Spielende“)
  chase: null | { count, ids: [playerId], left: [playerId] }, // Kartenziel erreicht, das Spiel läuft noch
  endReason: 'target' | 'deck' | 'host' | null,
  log: [{ k: 'placed'|'skipped'|'turnSkipped'|'joined'|'left'|'stolen'|'token'|'tokenRevoked', p?, ok?, song?, reason?, name?, from?, by? }],
  tokenLog: [TokenEntry],          // Marken-Protokoll des ganzen Spiels, älteste zuerst (höchstens 500)
  audio: { [playerId]: { s: <Spotify-Status>, msg, play: 'preparing'|'ready'|'playing'|'late'|'failed:<grund>'|null } },
  musicPaused: boolean,            // die Musik ist für alle angehalten (siehe „Musik anhalten“)
}
Player = { id, name, host, connected, timeline: [{ id, t, a, y, img }], tokens: number } // Zeitleiste nach Jahr sortiert
```

**Lücken (slots):** Bei einer Zeitleiste mit `n` Karten gibt es `n + 1` Lücken. Lücke `0` liegt vor der ersten Karte, Lücke `n` nach der letzten.

`img` ist eine Cover-URL von `i.scdn.co`, falls beim Abgleich gefunden. Sonst ist der Wert `null`.

## Spielende: Nachziehen und Gleichstand

Wer anfängt, wäre sonst im Vorteil. Deshalb endet das Spiel nicht in dem Moment, in dem jemand das Kartenziel erreicht:

1. Die laufende Runde (ein Durchgang durch `order`) wird zu Ende gespielt. Solange gilt `game.chase`: `count` ist der höchste Kartenstand, `ids` sind die Spieler, die ihn haben, `left` die Spieler, die in dieser Runde noch drankommen.
2. Am Rundenende gewinnt, wer allein die meisten Karten hat (`phase: 'ended'`, `endReason: 'target'`). Hat der Letzte der Runde das Ziel als Einziger erreicht, endet das Spiel wie bisher direkt beim Aufdecken.
3. Bei Gleichstand kommen alle anderen in `game.out`: Sie kommen nicht mehr dran und dürfen nicht mehr anzweifeln. Die Führenden spielen weitere Runden, bis nach einer Runde einer allein vorn liegt.

Getrennte Spieler werden wie immer übersprungen und halten das Rundenende nicht auf. Auch geklaute Karten (Regel „Marken“) zählen erst am Rundenende. Bei leerem Stapel oder „Spiel beenden“ gewinnt wie bisher, wer von den verbliebenen Spielern die meisten Karten hat.

In `src/ui/` steht der Stand in der Kopfzeile („Letzte Runde: …“ bzw. „Gleichstand bei … Karten: …“, in Orange) und nach dem Aufdecken im Satz unter der Überschrift. Ausgeschiedene sind unter „Zeitleisten“ grau und tragen „raus“.

## Musik anhalten

`pauseMusic()` hält die Musik für alle an, `resumeMusic()` spielt an derselben Stelle weiter. Drücken darf, wer `can.audioControl` hat (Host und aktiver Spieler). Bei „Jeder hört selbst“ hält jeder Player an und startet synchron wieder. Solange `game.musicPaused` gilt, kommt kein Lied: Beginnt in der Pause die nächste Runde (oder wird ein Song übersprungen), wartet der neue Song, bis jemand weiterspielt. `replay()` („Nochmal“) hebt die Pause auf und beginnt den Song von vorn. War der Song beim Anhalten schon zu Ende, beginnt er mit `resumeMusic()` ebenfalls von vorn. Spielende durch den Host und „Neues Spiel“ heben die Pause auf. Lädt der Host die Seite neu, ist die Pause vergessen (die Musik steht dann ohnehin, bis jemand „Nochmal“ drückt).

In `src/ui/` sitzen „Nochmal“ und der Umschalter „Pause“ / „Weiter“ (Pixel-Symbole `pause` und `spiel`) neben der Lautstärke. Alle Spieler sehen dort den Hinweis „Musik pausiert“.

## Lied speichern

Wer selbst über Spotify hört (bei „Jeder hört selbst“ jeder Spieler, bei „Nur der Host spielt ab“ der Host), kann das aktuelle Lied mit `saveSong()` in der Bibliothek seines Spotify-Kontos speichern. `can.saveSong` ist `true`, solange ein Lied der laufenden Runde da ist und noch nicht gespeichert wurde; `room.songSave` zeigt den Stand (`saving`, `saved`). Welches Lied es ist, erfährt die Oberfläche dabei nicht. Fehlt der Anmeldung die Erlaubnis dafür (Anmeldungen von früher), öffnet `saveSong()` einmal das Spotify-Anmeldefenster und speichert danach. Fehler kommen als `notice`.

In `src/ui/` sitzt dafür „♥ Speichern“ (Symbol `herz`) neben der Musik-Bedienung, danach steht dort „Gespeichert“.

## Regel „Marken“ (optional, `settings.tokens`)

Der Host schaltet die Regel in der Lobby ein (`updateSettings({ tokens: true })`). Ist sie aus, gibt es weder die Phase `challenge` noch die Zusatzfelder an `card`, und alle neuen `can.*` sind `false`. `Player.tokens` und `tokenLog` sind immer vorhanden, aber nur mit eingeschalteter Regel von Bedeutung.

Feste Werte (`TOKENS` in `src/core/game.js`): 2 Marken zum Start, höchstens 5 pro Spieler, 20 Sekunden zum Anzweifeln.

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
| `replay()` | Song von vorn abspielen (`can.audioControl`) |
| `pauseMusic()`, `resumeMusic()` | Musik für alle anhalten / an derselben Stelle weiterspielen (`can.audioControl`, Zustand in `game.musicPaused`) |
| `stopMusic()` | Musik ganz anhalten, ohne Stelle zu merken (`can.audioControl`; von der Oberfläche nicht mehr benutzt) |
| `saveSong()` | aktuelles Lied im eigenen Spotify-Konto speichern (`can.saveSong`, Stand in `room.songSave`) |
| `setVolume(0..1)` | eigene Lautstärke |
| `copyInvite()` | Einladungslink in die Zwischenablage (Promise → boolean) |
| `dismissError()` | Fehlermeldung schließen |

## Viele Karten (`src/ui/skala.js`, `ui.js`)

Die Skala zeigt alle Karten ohne Scrollen, bis zum Höchstziel von 30 Karten. Dafür passiert zweierlei:

- Die Spielseite wächst über ihre übliche Breite von 1320 px hinaus, sobald die längste Zeitleiste aller Spieler mehr Platz braucht (`el.style.maxWidth` in `ui.js`), höchstens bis zur Fensterbreite. Sie richtet sich nach allen Spielern, damit die Breite nicht bei jedem Zug springt.
- Reicht auch das nicht, werden die Karten der Zeitleiste schmaler. `skala.js` setzt dafür die Form an `.skala[data-form]`: `voll` (wie bisher, mit Titel und Interpret), `schmal` (nur das Jahr) und `eng` (das Jahr in zwei Zeilen). Titel und Interpret stehen dann im Tooltip der Karte. Die Karte im Spiel (`.kachel`) behält ihre lesbare Größe und bekommt ihre Maße getrennt (an `.zeiger`); beim Landen schrumpft sie auf das Maß der Zeitleiste.

Seitlich scrollen lässt sich die Skala nur noch, wenn das Fenster selbst für die kleinste Form zu schmal ist (unter etwa 1200 px bei 30 Karten).

## Klänge (`src/ui/klang.js`)

Reine Oberflächensache: Die Logik weiß nichts davon. Die Klänge entstehen im Browser mit der Web Audio API, es gibt keine Klangdateien (die Content-Security-Policy bleibt unverändert). Alle Klänge stehen als kurze Tonfolgen in der Tabelle `KLAENGE` am Anfang der Datei, darüber die Gesamtlautstärke `LAUT` und der Höhenfilter `HOEHEN`. Dort wird nachgestimmt.

| Klang | Wann | Wo ausgelöst |
|---|---|---|
| `knopf` | jeder Knopfdruck (außer Knöpfe mit `data-klang="aus"` und alles auf der Skala) | `starteKlang()` |
| `ruecken` | eine Lücke wird gewählt, die Karte rückt ein (Tonhöhe folgt der Stelle); auch beim probeweisen Stecken einer Marke | `Skala.update()`, `waehle()`, `waehleTipp()` |
| `fest` | festgelegt (einmal je Karte) | `Skala.update()` bzw. `rolle()` |
| `dreh`, `ziffer` | die Karte dreht sich um, jede Ziffer der Jahreszahl rastet ein | `Skala.rolle()`, `zeigeJahr()` |
| `richtig` / `falsch` | die Karte landet in der Zeitleiste / liegt falsch | `Skala.layout()` / `update()` |
| `tipp` | ein Anzweifler steckt seine Marke | `Skala.legeTipps()` |
| `klau` | die Karte fliegt zum Anzweifler | `Skala.klau()` |
| `marke` | ein Spieler bekommt eine Marke | `ui.js` (Zeitleisten) |
| `sieg` | der Dino feiert am Spielende | `Skala.layout()` |

Die Klänge hängen am Spielstand und an den Animationen, nicht an der eigenen Eingabe: Gäste und Zuschauer hören dasselbe wie der aktive Spieler. Beim Neuladen mitten im Zug erklingt nichts nachträglich. Ein Tab im Hintergrund bleibt still. Browser erlauben Ton erst nach einer Eingabe: Der `AudioContext` entsteht beim ersten Klick oder Tastendruck, bis dahin bleibt alles still. Der Schalter in der Ecke unten rechts (`.klang-schalter`, Symbole `ton` / `tonAus`) schaltet die Klänge aus und ein; die Einstellung liegt in `localStorage` unter `radino.klang`. Die Musik selbst betrifft das nicht.

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
