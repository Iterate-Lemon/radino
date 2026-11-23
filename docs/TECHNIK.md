# Technik und Entscheidungen

## Überblick

```
Browser des Hosts                                   Browser eines Gastes
┌───────────────────────────────┐                   ┌──────────────────────────────┐
│ UI (src/ui)                   │                   │ UI (src/ui)                  │
│   ▲ getState / actions        │                   │   ▲ getState / actions       │
│ App (src/app/app.js)          │                   │ App                          │
│ HostSession                   │  verschlüsselte   │ GuestSession                 │
│  ├ Reducer (src/core/game.js) │◄──Nachrichten────►│  ├ PeerGuest (+Uhrvergleich) │
│  ├ PeerHost                   │ (MQTT/WebSocket)  │  └ AudioClient ─► Spotify-SDK│
│  ├ AudioDirector              │                   └──────────────────────────────┘
│  └ AudioClient ─► Spotify-SDK │
└───────────────────────────────┘
        ▲ beide Seiten verbinden sich nur ausgehend mit öffentlichen MQTT-Diensten
```

- **Statische Seite** ohne Build-Schritt, ohne npm und ohne Server-Code. Läuft direkt auf GitHub Pages.
- **Host ist maßgeblich:** Nur der Host-Browser hält den echten Spielstand. Jede Aktion läuft durch den reinen Reducer `reduce(state, action, ctx)` in `src/core/game.js`. Der prüft Phase, Berechtigung und Werte. Gäste schicken nur Wünsche (`select`, `lock`, `next`, `skipSong`) und bekommen `publicView()` zurück. Darin fehlen der Stapel und der verdeckte Song.
- **Trennung:** `src/core` (reine Logik, ohne DOM, testbar) · `src/net` (Verbindungen, Protokoll) · `src/music` (Spotify bzw. Test-Player, gleiche Schnittstelle) · `src/app` (Verbindung der Teile, Anzeige-Modell) · `src/ui` (austauschbar, siehe `UI-SCHNITTSTELLE.md`).

## Spotify (Stand der Doku: November 2026)

Geprüft auf developer.spotify.com. Wichtige Punkte für diese App:

- **Development Mode** (seit 11.02.2026 bzw. 09.03.2026): Der App-Besitzer braucht Premium, es gibt höchstens 5 freigeschaltete Nutzer und weniger Endpunkte. Erweiterter Zugang („Extended Quota“) ist seit Mai 2025 nur noch für Firmen mit mindestens 250.000 aktiven Nutzern möglich.
- **Login:** Authorization Code mit PKCE, ohne Client Secret. Der Implicit Grant wurde am 27.11.2025 abgeschaltet. Redirect-URIs müssen HTTPS nutzen, nur Loopback ist mit HTTP erlaubt. `localhost` ist verboten, `http://127.0.0.1:PORT/` ist erlaubt. Die URI muss exakt übereinstimmen. Refresh-Tokens laufen seit Juni 2026 spätestens **6 Monate** nach der Anmeldung ab (dann `invalid_grant`, neu anmelden). Ob ein neuer Refresh-Token mitkommt, ist nicht garantiert; der Code kommt mit beiden Fällen zurecht.
- **Abspielen:** Web Playback SDK (`https://sdk.scdn.co/spotify-player.js`) mit den Scopes `streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state`. `PUT /me/player/play` sowie Pause, Seek und Transfer sind weiterhin verfügbar. Jeder abspielende Nutzer braucht Premium.
- **Entfallen** für Apps im Development Mode: Batch-Endpunkte (`GET /tracks?ids=`), `popularity`, `available_markets` und die Felder `product`/`email`/`country` bei `GET /me`. Das Spiel prüft Premium deshalb über das SDK-Ereignis `account_error` und die Freischaltung über eine `403` von `GET /me`.
- **Search:** höchstens `limit=10`. Der Filter `isrc:` funktioniert. Das Abgleich-Werkzeug nutzt deshalb zuerst die ISRC von den Karten (2.087 von 2.753 Songs haben eine) und erst danach Titel und Interpret.
- **Fremde Playlists:** Inhalte gibt es nur für eigene Playlists. Die Songliste kommt deshalb aus den CSVs und nicht aus Spotify.

### ⚠️ Spotify-Richtlinien

Die Developer Policy von Spotify verbietet ausdrücklich „games, including trivia quizzes“. Ein „name that tune“-Quiz wird als Beispiel genannt. Außerdem verlangt sie, beim Abspielen Cover und Metadaten anzuzeigen. RaDino verstößt gegen beides. Technisch funktioniert es trotzdem. Das Risiko liegt darin, dass Spotify die Client-ID sperren kann. Ein Gegenmittel gibt es dafür nicht. Die Musikquelle ist deshalb austauschbar gebaut (`src/music/*`, gleiche Schnittstelle). Jede Karte in `songs.json` enthält zusätzlich die YouTube-ID (`yt`) aus den CSVs. Eine andere Quelle ließe sich also später ergänzen. Hinweis: Auch die YouTube-Bedingungen verbieten verstecktes Abspielen.

## Mehrspieler ohne eigenen Server

- **Transport** (`src/net/relay-peer.js`): Host und Gäste öffnen je eine ausgehende WebSocket-Verbindung zu öffentlichen MQTT-Diensten (`config.js` → `relays`, derzeit `broker.emqx.io` und `broker.hivemq.com`). Der kleine MQTT-Client dafür steht in derselben Datei, eine Bibliothek braucht es nicht. Jeder Teilnehmer abonniert genau ein Thema (`radino/<eigene ID>`), der Host `radino/radino-<raumId>`.
- **Warum kein WebRTC mehr:** Die Direktverbindung per WebRTC (PeerJS) scheiterte in allen Praxistests (Ursache vermutlich je nach Fall: Router ohne Hairpinning, Mobilfunk-NAT, Brave Shields). Die TURN-Server von PeerJS gibt es nicht mehr, einen kostenlosen Ersatz ohne Konto ebenfalls nicht. Ausgehende WebSockets funktionieren dagegen in praktisch jedem Netz. Die Spielnachrichten sind winzig, der Umweg kostet rund 30–100 ms.
- **Mehrere Dienste gleichzeitig:** Jede Nachricht geht über alle erreichbaren Dienste. Der Empfänger nimmt die erste Kopie und verwirft die übrigen anhand einer laufenden Nummer je Verbindung; die Reihenfolge bleibt erhalten. Fällt ein Dienst aus oder hängt er, läuft das Spiel über den anderen weiter, und die ausgefallene Leitung wird im Hintergrund neu aufgebaut. Fehlt eine Nummer länger als 3 Sekunden, wird die Verbindung neu aufgebaut (dabei kommt der volle Spielstand neu).
- **Verschlüsselung:** Die Dienste sind öffentlich, jeder kann dort mitlesen. Deshalb ist jede Nachricht mit AES-GCM verschlüsselt. Der Schlüssel wird per SHA-256 aus dem Schlüssel im Einladungslink abgeleitet. Die Dienste sehen nur das Thema (Raum-ID) und Zufallsbytes. Ohne den Link kann niemand mitlesen, mitspielen oder Nachrichten fälschen. Grenze: Wer mitschneidet, könnte eine alte verschlüsselte Nachricht erneut einspielen; innerhalb einer Verbindung verhindert das die laufende Nummer, ein erneutes Einspielen eines ganzen Verbindungsaufbaus kann höchstens kurz einen Spieler trennen (er verbindet sich von selbst neu).
- **Raum-Link:** `https://…/#join=<raumId>-<schlüssel>`. Beides sind 26 Zeichen Base32 (je 130 Bit) aus `crypto.getRandomValues`. Der Teil nach `#` wird nie an einen Server geschickt, auch nicht an GitHub. Den Schlüssel prüft der Host zusätzlich im Handshake mit einem Vergleich in konstanter Zeit. Verbindungen ohne gültigen Handshake werden nach 8 Sekunden getrennt.
- **Wiederverbinden:** Gäste bekommen beim Beitritt eine Spieler-ID und ein geheimes Token. Beides liegt im `sessionStorage` des Tabs. So bekommt ein Gast nach dem Neuladen seinen alten Platz zurück. Der Host speichert den ganzen Raum (Spielstand, Schlüssel, Tokens) im `localStorage`. Nach einem Neuladen öffnet er denselben Raum wieder, und die Gäste verbinden sich von selbst neu (nach etwa 5 Sekunden). Ein Raum kann nur in einem Tab desselben Browsers offen sein (Web Lock); ein zweiter Tab wartet, bis der erste geschlossen ist.
- **Herzschlag:** Gäste schicken alle 2 Sekunden `time`, der Host antwortet. Kommt 9 bis 10 Sekunden lang nichts, gilt die Verbindung als getrennt. Getrennte Spieler werden beim Weitergeben übersprungen. Ist der aktive Spieler weg, kann der Host seinen Zug überspringen.
- **Grenzen gegen Missbrauch:** höchstens 12 Spieler und 24 Verbindungen. Gast-Nachrichten dürfen höchstens 2 KB groß sein. Pro Verbindung gilt ein Limit von 40 Nachrichten pro Sekunde, ab 120 wird getrennt. Jede Nachricht wird streng geprüft (`src/net/protocol.js`), unbekannte Felder werden verworfen.

## Synchrones Abspielen („Jeder hört selbst“)

1. Der Host schickt `prepare(track, pos)`. Jeder Teilnehmer stellt die Lautstärke auf 0, startet den Track über die Web API auf dem eigenen SDK-Gerät, wartet auf den passenden SDK-Zustand, pausiert, springt per Seek auf `pos` und stellt die Lautstärke wieder her. Dann meldet er `ack`.
2. Sind alle bereit (oder nach 10 Sekunden), schickt der Host `start(at = Host-Zeit + 700 ms)`.
3. Jeder rechnet `at` mit dem gemessenen Uhrzeit-Versatz in Ortszeit um. Den Versatz misst er NTP-artig: Von den letzten 10 Messungen zählt die mit der kürzesten Laufzeit. Zum Zeitpunkt `at` ruft er `player.resume()` auf. Das geht schnell und läuft lokal.
4. Nach 1,5 und nach 5 Sekunden wird die Abweichung geprüft. Liegt sie über 250 ms, wird per Seek nachkorrigiert.

Im Modus „Nur der Host spielt ab“ läuft derselbe Ablauf mit dem Host als einzigem Teilnehmer.

**Nicht verfügbare Songs:** Scheitert das Laden bei allen Teilnehmern mit einem songbezogenen Grund (`unavailable`/`timeout`), kommt automatisch eine neue Karte, höchstens 3-mal hintereinander. Die Track-ID landet auf einer lokalen Sperrliste. Bei allgemeinen Fehlern (nicht angemeldet, kein Premium) wird nicht übersprungen, sonst würde der Stapel leerlaufen.

**Schutz vor Spoilern:** Die Oberfläche bekommt Titel und Interpret erst nach dem Festlegen. Läuft auf dem SDK-Gerät ein anderer Track als erwartet (z. B. Spotify-Autoplay nach dem Songende), wird sofort pausiert. Gäste spielen nur Track-IDs ab, die in der eigenen Songliste stehen.

## Sicherheit

- Im Repository stehen keine Geheimnisse. Die Client-ID ist öffentlich, ein Client Secret gibt es nicht.
- Spotify-Tokens liegen nur im `localStorage` des eigenen Browsers. Der Login läuft mit PKCE und `state`-Prüfung. Den Refresh sichert ein Web Lock gegen Doppel-Refresh aus mehreren Tabs.
- Content-Security-Policy per `<meta>`: Skripte nur von der eigenen Seite und `sdk.scdn.co`, Verbindungen nur zu Spotify und den Verbindungsdiensten, kein Inline-Code. Die Seite verweigert das Einbetten in fremde Seiten (Frame-Busting). Die Oberfläche fügt Fremdtexte nur als Text ein.
- Fremde ohne Link kommen in keinen Raum. Fremde mit eigenem Spotify-Konto können nichts abspielen, weil sie nicht freigeschaltet sind (Spotify antwortet mit `403`).
- **Gemeinsamer Ursprung bei GitHub Pages:** Alle Projektseiten eines Accounts (`DEINNAME.github.io/…`) teilen sich einen Ursprung und damit auch den `localStorage`. Eine *andere* Seite desselben GitHub-Accounts könnte also die Spotify-Tokens und den gespeicherten Raum lesen. Auf diesem Account sollten deshalb keine fremden oder unsicheren Seiten liegen. Alternativ hilft eine eigene Domain für RaDino.
- Grenze: Wer im Raum ist, kann in den Entwicklerwerkzeugen seines Browsers schummeln, z. B. im Modus „Jeder hört selbst“ die Track-ID nachschlagen. Unter Freunden ist das hinnehmbar.

## Bekannte Grenzen

- Der Host-Tab muss offen bleiben. Es gibt keine Host-Übergabe.
- Spieler, die mitten in einem Song beitreten oder sich neu verbinden, hören im Modus „Jeder hört selbst“ erst den nächsten Song oder nach „Nochmal abspielen“.
- In Tabs im Hintergrund drosselt Chrome Timer auf etwa 1 Sekunde. Der Start eines Songs kann sich dort um bis zu 1 Sekunde verzögern. Die Nachkorrektur gleicht das aus.
- Die Verbindungsdienste sind kostenlose öffentliche Test-Broker ohne Garantie. `broker.hivemq.com` nahm im Test Verbindungen nur unzuverlässig an, `broker.emqx.io` lief stabil. Fallen alle gleichzeitig aus, ist kein Spiel möglich. Dann in `config.js` (`relays`) und in der Content-Security-Policy (`index.html`, `tools/test.html`) einen anderen MQTT-Dienst mit WebSocket (wss) eintragen.
- Die Spotify-App auf anderen Geräten desselben Kontos zeigt den laufenden Titel an.

## Tests

- Logiktests (Regeln, Reducer, Protokoll, Abgleich-Bewertung) laufen ohne Abhängigkeiten im Browser unter `tests/index.html` oder auf dem Mac mit:
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run-jsc.js`
- Mehrspieler ohne Netzwerk: `?test&fakenet` (siehe `UI-SCHNITTSTELLE.md`).
- Spotify und die echten Verbindungsdienste: `tools/test.html` (Funktionstest). Echte Mehrspieler-Tests gehen auch in zwei Tabs mit `?test` (ohne `fakenet`).

## Songdaten

`tools/prepare_songs.py` erzeugt `data/songs.json` aus den CSVs von
[andygruber/songseeker-hitster-playlists](https://github.com/andygruber/songseeker-hitster-playlists) (MIT-Lizenz, © 2024 Andreas Gruber):
11 deutsche Editionen mit 3.036 Karten, nach ISRC bzw. Interpret+Titel zusammengeführt zu 2.753 eindeutigen Songs.
Bereits ermittelte Spotify-Daten bleiben beim erneuten Ausführen erhalten.
Das Jahr stammt immer von der Karte. Bei Doppelungen mit abweichendem Jahr gilt die zuerst eingelesene Edition (15 Fälle, die das Skript ausgibt).

Felder je Song: `id`, `t` (Titel), `a` (Interpret), `y` (Jahr), `e` (Editionen), `isrc`, `yt` (YouTube-ID), nach dem Abgleich außerdem `sp` (Spotify-Track-ID), `img` (Cover) und `m` (Art der Zuordnung).
