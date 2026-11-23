# RaDino

Ein Musik-Zeitleisten-Spiel für den Browser, das man online mit Freunden spielt.
Ein Song läuft verdeckt, und wer dran ist, ordnet ihn in seine Zeitleiste ein: davor, danach oder dazwischen.
Danach wird das Jahr aufgedeckt. Wer zuerst 10 Karten in seiner Zeitleiste hat, gewinnt.

- **Kein Server, keine laufenden Kosten:** eine statische Seite (z. B. GitHub Pages). Die Mitspieler verbinden sich per WebRTC direkt mit dem Browser des Hosts.
- **Musik über Spotify** (Web Playback SDK), in zwei Modi:
  - *Nur der Host spielt ab*: Die anderen hören über einen Discord-Stream mit, die Spielerzahl ist beliebig.
  - *Jeder hört selbst*: Jeder nutzt sein eigenes Premium-Konto, die Wiedergabe läuft synchron. Höchstens 5 Konten.
- **Einrichtung:** siehe [docs/ANLEITUNG.md](docs/ANLEITUNG.md). Danach braucht man nur noch einen Link.

## Ordner

| Pfad | Inhalt |
|---|---|
| `index.html`, `config.js` | Spielseite und Einstellungen (Spotify-Client-ID) |
| `src/core/` | Spielregeln und Spielzustand (reine Funktionen) |
| `src/net/` | Verbindungen (PeerJS) und Nachrichtenprotokoll |
| `src/music/` | Spotify-Login (PKCE), Spotify-Player, Test-Player |
| `src/app/` | Host- und Gast-Sitzung, Synchronisierung, Anzeige-Modell |
| `src/ui/` | schlichte Oberfläche, austauschbar ([docs/UI-SCHNITTSTELLE.md](docs/UI-SCHNITTSTELLE.md)) |
| `data/songs.json` | Songliste mit Jahr (und nach dem Abgleich mit Spotify-IDs) |
| `tools/test.html` | Funktionstest: Spotify-Login, verdecktes Abspielen, Netzwerk |
| `tools/abgleich.html` | einmaliger Spotify-Abgleich der Songliste |
| `tools/prepare_songs.py` | baut `data/songs.json` aus den Community-CSVs |
| `tests/` | Logiktests (`tests/index.html` im Browser) |
| `docs/` | Anleitung, Technik, UI-Schnittstelle |

## Lokal entwickeln

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Danach im Browser öffnen:

- `http://127.0.0.1:8080/?test&fakenet`: Testmodus ohne Musik. Mehrere Spieler lassen sich in Tabs desselben Browsers simulieren.
- `http://127.0.0.1:8080/tests/`: Logiktests.

Für Spotify lokal `http://127.0.0.1:8080/` als Redirect-URI im Dashboard eintragen. `localhost` erlaubt Spotify nicht.

Technische Details, Entscheidungen und Grenzen stehen in [docs/TECHNIK.md](docs/TECHNIK.md).

## Lizenzen und Hinweise

- Die Songdaten (Titel, Interpret, Jahr, ISRC, YouTube-ID) stammen aus
  [andygruber/songseeker-hitster-playlists](https://github.com/andygruber/songseeker-hitster-playlists) (MIT-Lizenz, © 2024 Andreas Gruber).
- [PeerJS](https://peerjs.com) 1.5.5 (MIT-Lizenz), siehe `vendor/peerjs-LICENSE.txt`.
- Privates, nicht-kommerzielles Hobbyprojekt. Es steht in keiner Verbindung zu Spotify oder zu Herstellern von Musikspielen.
  Bitte die Hinweise zu den Spotify-Richtlinien in `docs/TECHNIK.md` beachten.
