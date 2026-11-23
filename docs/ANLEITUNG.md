# RaDino einrichten – Schritt für Schritt

Diese Anleitung musst du **nur einmal** durcharbeiten. Danach brauchen du und deine Freunde nur noch einen Link.
Plane etwa **45 Minuten** ein. Du musst nichts installieren, alles passiert im Browser.

**Du brauchst:**

- einen kostenlosen **GitHub-Account** (dort liegt die Seite, kostenlos und dauerhaft),
- ein **Spotify-Premium-Konto** (du wirst „Besitzer“ der Spotify-App),
- **Chrome** oder **Edge** am Computer.

> Überall, wo unten `DEINNAME` steht, setzt du deinen GitHub-Benutzernamen ein, in **Kleinbuchstaben**.
> Beispiel: Heißt dein Account `MaxMuster`, lautet die Adresse `https://maxmuster.github.io/radino/`.

---

## Schritt 1: Seite bei GitHub hochladen

1. Melde dich auf **github.com** an (oder lege dort einen Account an).
2. Klicke oben rechts auf **„+“** und dann auf **„New repository“**.
3. Fülle das Formular so aus:
   - **Repository name:** `radino` (klein geschrieben, damit der Link einfach bleibt; das Spiel selbst heißt trotzdem RaDino)
   - **Public** auswählen. Das ist nötig, damit die Seite kostenlos ist. Im Code steht nichts Geheimes.
   - Den Rest so lassen und auf **„Create repository“** klicken.
4. Auf der nächsten Seite auf den Link **„uploading an existing file“** klicken.
5. Öffne den Projektordner **RaDino** auf deinem Computer. Markiere **alle** Dateien und Ordner und ziehe sie in das Browserfenster:
   - `index.html`
   - `config.js`
   - `.nojekyll`
   - die Ordner `src`, `data`, `vendor`, `tools`, `docs` und `tests`

   Der Ordner `.claude` wird nicht gebraucht.

   *Tipp für Mac:* Die Datei `.nojekyll` ist unsichtbar. Mit **Cmd + Shift + .** im Finder wird sie sichtbar.
6. Warte, bis alle Dateien in der Liste erscheinen. Klicke dann unten auf **„Commit changes“**.
7. Klicke oben im Repository auf **„Settings“** und links auf **„Pages“**.
8. Wähle unter **„Build and deployment“** bei **Source** die Option **„Deploy from a branch“**. Bei **Branch** stellst du **`main`** und **`/ (root)`** ein und klickst auf **„Save“**.
9. Warte 1 bis 2 Minuten und lade die Seite neu. Oben erscheint dann: *„Your site is live at `https://DEINNAME.github.io/radino/`“*.
   **Diese Adresse ist dein Spiel-Link.** Schreib sie dir auf.

## Schritt 2: Spotify-App anlegen

Spotify erlaubt das Abspielen auf fremden Webseiten nur über eine eigene „Developer-App“. Die legst du jetzt an.

1. Öffne **https://developer.spotify.com/dashboard** und melde dich mit deinem **Spotify-Premium-Konto** an.
   Beim ersten Mal musst du den Nutzungsbedingungen für Entwickler zustimmen. Lies sie bitte selbst durch.
2. Klicke auf **„Create app“** und fülle das Formular aus:
   - **App name:** `RaDino` (beliebig)
   - **App description:** `Musikspiel mit Freunden` (beliebig)
   - **Redirect URIs:** `https://DEINNAME.github.io/radino/` eintragen und auf **„Add“** klicken.
     Die Adresse muss **genau** so lauten, **mit Schrägstrich am Ende**.
   - Bei **„Which API/SDKs are you planning to use?“** die Häkchen bei **Web API** und **Web Playback SDK** setzen.
   - Den Bedingungen zustimmen und auf **„Save“** klicken.
3. Du landest auf der Seite deiner App. Klicke auf **„Settings“** und kopiere die **Client ID**. Das ist eine lange Zeichenfolge aus Buchstaben und Zahlen.
   ⚠️ Das **„Client secret“** brauchst du **nicht**. Trage es niemals irgendwo ein.
4. Öffne bei GitHub in deinem Repository die Datei **`config.js`** und klicke auf das **Stift-Symbol** (Bearbeiten).
5. Trage die Client ID zwischen die Anführungszeichen ein:

   ```js
   spotifyClientId: 'hier-die-kopierte-client-id',
   ```

6. Klicke auf **„Commit changes…“** und dann noch einmal auf **„Commit changes“**.

## Schritt 3: Mitspieler bei Spotify freischalten

Spotify lässt im „Development Mode“ höchstens **5 Spotify-Konten** zu. Jedes Konto, das Musik abspielen soll, muss eingetragen sein.

| Spielmodus | Wer braucht Premium und eine Freischaltung? |
|---|---|
| **Nur der Host spielt ab** (die anderen hören über Discord) | nur der Host |
| **Jeder hört selbst** | jeder Mitspieler |

So trägst du jemanden ein:

1. Öffne im Spotify-Dashboard deine App, dann **„Settings“** und den Reiter **„User Management“**.
2. Trage **Name** und **E-Mail-Adresse des Spotify-Kontos** ein und klicke auf **„Add user“**.
   Wer seine Spotify-E-Mail nicht kennt, findet sie unter spotify.com → Profil → Konto.
3. Dein eigenes Konto ist als Besitzer bereits freigeschaltet.

## Schritt 4: Kurzer Funktionstest

1. Öffne **`https://DEINNAME.github.io/radino/tools/test.html`**.
2. Klicke auf **„Bei Spotify anmelden“**. Es öffnet sich ein kleines Fenster. Melde dich dort an und bestätige.
3. Bei *Player* sollte nach ein paar Sekunden **„ready“** stehen.
4. Klicke auf **„Laden + abspielen“**. Ein Song sollte zu hören sein, ohne dass Titel oder Interpret angezeigt werden. Mit **„Stopp“** hältst du ihn an.
5. Klicke unten auf **„Test starten“**. Es sollte mindestens ein grüner Haken erscheinen (ein erreichbarer Verbindungsdienst genügt).

Klappt etwas nicht, schau in den Abschnitt [Probleme und Lösungen](#probleme-und-lösungen).

## Schritt 5: Songs mit Spotify verknüpfen (einmalig, ca. 15–30 Minuten)

Die Songliste enthält 2.753 Songs mit dem Erscheinungsjahr von den Originalkarten. Jetzt wird zu jedem Song der passende Spotify-Track gesucht.

1. Öffne **`https://DEINNAME.github.io/radino/tools/abgleich.html`**.
2. Melde dich an, falls nötig, und klicke auf **„Abgleich starten“**. Lass den Tab offen, bis der Abgleich fertig ist.
   Meldet Spotify „Kontingent erschöpft“ oder „zu viele Anfragen“, ist das kein Problem. Der Fortschritt bleibt gespeichert. Öffne die Seite später wieder und klicke auf **„Fortsetzen“**.
3. **Unsichere Treffer prüfen** (freiwillig): Bei manchen Songs ist die Zuordnung nicht eindeutig. Du kannst den passenden Treffer anklicken. Mit „anhören“ öffnet sich Spotify zum Reinhören. Oder du wählst **„Keiner passt“**. Ungeprüfte Songs lässt das Spiel einfach weg.
4. Klicke auf **„songs.json herunterladen“**. Die Datei landet in deinem Download-Ordner.
5. Öffne bei GitHub in deinem Repository den Ordner **`data`** und klicke auf **„Add file“** → **„Upload files“**. Ziehe die heruntergeladene `songs.json` hinein und klicke auf **„Commit changes“**. Sie ersetzt die alte Datei.
6. Nach 1 bis 2 Minuten ist die neue Songliste im Spiel aktiv. Unten auf der Startseite steht dann, wie viele Songs mit Spotify verknüpft sind.

## Schritt 6: Spielen 🎉

**Der Host** (wer das Spiel eröffnet):

1. Öffnet `https://DEINNAME.github.io/radino/`, gibt einen Namen ein und klickt auf **„Spiel erstellen“**.
2. Meldet sich bei Spotify an. Das ist nur beim ersten Mal nötig, danach merkt sich der Browser die Anmeldung.
3. Wählt den Modus und die Editionen aus. Dann klickt er auf **„Kopieren“** und schickt den **Einladungslink** an die Freunde, z. B. per Discord.
4. Sobald alle in der Liste stehen, klickt er auf **„Spiel starten“**.
5. **Wichtig:** Der Host-Tab muss während des ganzen Spiels offen bleiben. Er darf im Hintergrund liegen.
6. Im Modus **„Nur der Host spielt ab“** überträgt der Host in Discord seinen Bildschirm oder das Browserfenster **mit Ton**. So hören alle mit.

**Die Mitspieler:**

1. Öffnen den Einladungslink, geben einen Namen ein und klicken auf **„Beitreten“**.
2. Nur im Modus **„Jeder hört selbst“**: einmal auf **„Bei Spotify anmelden“** klicken.

**So geht das Spiel:**

- Wer dran ist, hört einen Song.
- Er klickt in seiner Zeitleiste auf das **„+“**, wo der Song hingehört, und dann auf **„Hier festlegen“**.
- Danach werden Jahr, Titel und Interpret aufgedeckt. Liegt die Karte richtig, bleibt sie liegen.
- Wer zuerst die eingestellte Kartenzahl erreicht (Standard: 10, die Startkarte zählt mit), gewinnt.

---

## Probleme und Lösungen

**„INVALID_CLIENT: Invalid redirect URI“ beim Anmelden**
Die Redirect-URI im Spotify-Dashboard stimmt nicht genau mit der Seitenadresse überein. Achte auf `https`, Kleinbuchstaben und den Schrägstrich am Ende. Die Seite `tools/test.html` zeigt dir die genaue Adresse, die eingetragen sein muss.

**„Dein Spotify-Konto ist für diese App nicht freigeschaltet“**
Trage das Konto im Dashboard unter **User Management** ein (siehe Schritt 3). Danach ein paar Minuten warten und neu anmelden.

**„Für das Abspielen wird Spotify Premium benötigt“**
Spotify erlaubt das Abspielen im Browser nur mit Premium. Im Modus „Nur der Host spielt ab“ braucht nur der Host Premium.

**Das Anmeldefenster öffnet sich nicht**
Der Browser blockiert Popups. Erlaube Popups für die Seite, im Symbol rechts in der Adressleiste. Ohne Popup leitet die Seite stattdessen kurz zu Spotify weiter und kommt danach zurück.

**„Host nicht erreichbar“ / Mitspieler kommt nicht rein**
- Ist der Tab des Hosts noch offen, und steht dort oben „Raum: verbunden“?
- Stimmt der Link? Er muss vollständig sein, mit allem nach dem `#`.
- Öffnet der Betroffene `tools/test.html` und startet den Verbindungstest. Er zeigt, ob die Verbindungsdienste von diesem Gerät aus erreichbar sind. Ein erreichbarer Dienst genügt. Ist keiner erreichbar, blockiert etwas auf dem Gerät oder im Netz die Verbindung (Werbeblocker, Firewall in Firma oder Uni). Dann hilft meist ein anderes Netz, z. B. der Handy-Hotspot.
- Besondere Browser-Einstellungen sind nicht nötig, auch nicht in Brave.

**Ein Song lässt sich nicht abspielen**
Manche Songs sind in Deutschland nicht oder nicht mehr verfügbar. Das Spiel überspringt sie automatisch und merkt sie sich. Sonst hilft der Knopf **„Song überspringen“**.

**„Spotify-Anmeldung abgelaufen“**
Spotify verlangt spätestens alle 6 Monate eine neue Anmeldung. Einfach erneut auf „Bei Spotify anmelden“ klicken.

**Der Host hat den Tab aus Versehen geschlossen**
Seite wieder öffnen und auf **„Fortsetzen“** klicken. Der Spielstand ist gespeichert, die Mitspieler verbinden sich von selbst neu. Lädt ein Mitspieler seine Seite neu, behält er ebenfalls seinen Platz.

**Die Musik läuft bei „Jeder hört selbst“ leicht versetzt**
Ein Versatz unter einer halben Sekunde ist normal. Das Spiel korrigiert größere Abweichungen kurz nach dem Start automatisch. Notfalls hilft „Nochmal abspielen“.

**Spotify spielt plötzlich woanders weiter**
Ein Spotify-Konto kann nur an einer Stelle gleichzeitig abspielen. Während des Spiels also nicht parallel am Handy Musik hören.
Übrigens zeigt die Spotify-App auf dem Handy an, was gerade läuft. Also besser nicht hinschauen 😉

---

## Wichtig zu wissen

- **Spotify-Regeln:** Die Entwicklerrichtlinien von Spotify verbieten ausdrücklich, Spotify in Spiele oder Musik-Quiz einzubauen. Außerdem verlangen sie, dass beim Abspielen Titel und Cover sichtbar sind. RaDino ist ein privates Hobbyprojekt für höchstens 5 freigeschaltete Konten. Trotzdem kann Spotify die App jederzeit sperren. Mehr dazu in `docs/TECHNIK.md`.
- **Wer den Einladungslink hat, kann beitreten.** Teile ihn also nur mit Freunden. Für ein neues Spiel mit anderen Leuten erstellst du einfach einen neuen Raum, dann gibt es einen neuen Link.
- **Spotify-Anmeldungen bleiben im jeweiligen Browser.** Sie werden nie an Mitspieler oder irgendeinen Server geschickt.
- **Am besten einen eigenen GitHub-Account nur für RaDino nutzen**, oder zumindest keine fremden Webseiten auf demselben Account veröffentlichen. Alle Seiten unter `DEINNAME.github.io` teilen sich den Browserspeicher.
- **Kosten:** keine. GitHub Pages, die Verbindungsdienste und die Spotify-Developer-App sind kostenlos. Nur Spotify Premium kostet wie gewohnt.
- Ändert Spotify erneut seine Regeln, betrifft das meist nur Schritt 2 oder 3. Die aktuelle Doku findest du auf developer.spotify.com.
