# 🔐 Passwortmanager Übungs-Demo

Eine minimalistische, einsteigerfreundliche Webseite zum **Üben mit Passwortmanagern**
(Bitwarden, 1Password, Browser-Manager …). Lege Test-Accounts an, probiere Login, **2FA via
Google Authenticator** und **Passkeys (WebAuthn)** aus – **ohne E-Mail, rein zum Testen**.

> Diese Seite ist ein Übungsplatz. Es werden bewusst **keine** Anforderungen an Benutzername/Passwort
> gestellt. Trotzdem gelten Sicherheits-Grundlagen: Passwörter werden gehasht, Geheimnisse
> verschlüsselt gespeichert, und es landen keine Secrets im Frontend.

---

## Funktionen

- **Registrierung & Login** ohne E-Mail, ohne Inhalts-/Format-Validierung
  - Benutzernamen sind **eindeutig**, Login wird **strikt geprüft**
- **2FA (TOTP)** kompatibel mit Google Authenticator/Authy/1Password – inkl. QR-Code
- **Passkeys (WebAuthn)** – passwortlose Anmeldung, mehrere Passkeys pro Account
- **Anleitung für Laien** unter `/guide`
- **Zweisprachig (DE/EN)** – automatische Erkennung der Browsersprache + manueller Umschalter
  (Auswahl wird in `localStorage` gemerkt)
- **Cleanup-Job** entfernt alte Übungs-Accounts (über Umgebungsvariablen steuerbar)
- **Docker**-fähig mit persistenter SQLite-DB

## Tech-Stack

Node.js · Express · SQLite (better-sqlite3) · argon2 · otplib · qrcode ·
@simplewebauthn · helmet · Vanilla HTML/CSS/JS (kein Build-Schritt).

---

## Schnellstart (lokal)

```bash
# 1) Abhängigkeiten installieren (kompiliert native Module, vendored WebAuthn-Browser-Build)
npm install

# 2) Konfiguration anlegen
cp .env.example .env

# 3) Secrets erzeugen und in .env eintragen (SESSION_SECRET & APP_ENCRYPTION_KEY)
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('APP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# 4) Starten
npm start
```

Aufrufen unter **http://localhost:3000** (genau diese URL verwenden – siehe Hinweis unten).

`npm run dev` startet mit automatischem Neustart bei Dateiänderungen.

---

## Mit Docker (fertiges Image)

Es gibt ein automatisch gebautes Image auf Docker Hub:
**[`ruepp/pw-testpage`](https://hub.docker.com/r/ruepp/pw-testpage)**.

**Schnell & temporär** – ein Wegwerf-Container ohne `.env`, der beim Beenden wieder verschwindet
(`--rm`). `SESSION_SECRET` und `APP_ENCRYPTION_KEY` sind Pflicht; hier bewusst unsichere Demo-Werte:

```bash
docker run --rm -p 3000:3000 \
  -e SESSION_SECRET=temporary-demo \
  -e APP_ENCRYPTION_KEY=00000000000000000000000000000000000000000000000000000000deadbeef \
  ruepp/pw-testpage
```

Danach **http://localhost:3000** aufrufen. (Für echten Betrieb eigene Secrets erzeugen, siehe oben.)

**Mit `docker compose`** – persistente DB im benannten Volume `appdata`:

```bash
cp .env.example .env      # Secrets wie oben eintragen
docker compose up         # zieht ruepp/pw-testpage
```

- Erreichbar unter **http://localhost:3000** (nur an `127.0.0.1` gebunden).
- Die SQLite-DB liegt im **benannten Volume `appdata`** (Pfad `/data/app.db`) und bleibt über
  `docker compose down` / `up` hinweg **persistent**.

> **Bind-Mount statt Volume?** In `docker-compose.yml` `- ./data:/data` nutzen und sicherstellen,
> dass das Verzeichnis dem Container-Nutzer gehört: `mkdir -p data && sudo chown -R 1000:1000 data`.

## Image selbst bauen

Statt das fertige Image zu ziehen, lässt es sich auch lokal bauen (gleicher Tag, damit `docker run`
und `docker compose` es ohne Anpassung verwenden):

```bash
docker build -t ruepp/pw-testpage .          # Runtime-Image bauen
# danach wie oben: docker run ... ruepp/pw-testpage

# Oder via Compose: build-Block in docker-compose.yml einkommentieren, dann
docker compose up --build
```

Test-Stage bauen (führt `npm test` im Container aus, baut **kein** Laufzeit-Image):

```bash
docker build --target test -t pw-testpage:test .
```

---

## Tests

```bash
npm test
```

`node:test`-Suiten für Verschlüsselung, Auth (Register/Login/Logout), 2FA-Flow und Cleanup.
Laufen auch in der **Docker-Test-Stage** (`docker build --target test .`). Die **Jenkins**-Pipeline
(`Jenkinsfile`) baut und pusht das Runtime-Image nach Docker Hub; sie führt die Test-Stage nicht aus.

---

## Umgebungsvariablen

| Variable | Bedeutung | Default |
| --- | --- | --- |
| `PORT` | Server-Port | `3000` |
| `NODE_ENV` | `development` / `production` | `development` |
| `SESSION_SECRET` | Signiert Session-Cookies | *(Pflicht in Prod)* |
| `APP_ENCRYPTION_KEY` | **Pflicht.** 32-Byte-Schlüssel (64 Hex) für AES-256-GCM | – |
| `DB_PATH` | Pfad zur SQLite-Datei | `./data/app.db` |
| `RP_ID` | WebAuthn Relying-Party-ID | `localhost` |
| `RP_NAME` | Anzeigename | `Passwortmanager Übungs-Demo` |
| `ORIGIN` | Erwarteter WebAuthn-Origin | `http://localhost:3000` |
| `CLEANUP_ENABLED` | Cleanup-Job an/aus | `false` |
| `CLEANUP_INTERVAL_MINUTES` | Laufintervall | `60` |
| `CLEANUP_MAX_AGE_HOURS` | Accounts älter als X löschen | `24` |

---

## Sicherheit & Designentscheidungen

- **Passwörter**: nur als **argon2id**-Hash gespeichert (nie im Klartext, nicht reversibel).
- **TOTP-Secrets**: **AES-256-GCM-verschlüsselt** at rest (`src/crypto.js`); Schlüssel
  ausschließlich serverseitig aus `APP_ENCRYPTION_KEY`.
- **Keine Secrets im Frontend**: Der Browser erhält nur öffentliche WebAuthn-Optionen
  (Einmal-Challenges) und QR-Codes. Strikte **Content-Security-Policy** (kein CDN, keine
  Inline-Skripte); die WebAuthn-Browser-Bibliothek wird **lokal gevendort**.
- **Sessions**: HttpOnly-Cookie, `SameSite=Lax`, in SQLite persistiert.
- **Rate-Limit** auf den API-Routen gegen stures Durchprobieren.

### Hinweis zu Passkeys & sicherem Kontext

WebAuthn verlangt einen „sicheren Kontext". Es gibt zwei Wege, das zu erfüllen:

- **Lokal:** Browser behandeln **`localhost` als sicher**, daher funktionieren Passkeys auch über
  `http://localhost:3000`. Dann immer über `localhost` aufrufen (nicht über die LAN-IP), damit die
  Defaults `RP_ID=localhost` / `ORIGIN=http://localhost:3000` passen.
- **Gehostet:** Hinter einer echten Domain muss **HTTPS** verwendet werden. Setze `RP_ID` auf den
  Hostnamen (z. B. `app.example.com`, ohne Schema/Port) und `ORIGIN` auf die vollständige URL
  (z. B. `https://app.example.com`). Stimmen `RP_ID`/`ORIGIN` nicht mit der Adresszeile überein,
  schlägt die Passkey-Verifikation fehl.

---

## Projektstruktur

```
server.js            # Bootstrap (Env, DB, Listener, Cleanup-Start)
src/
  app.js             # Express-App-Factory (testbar, ohne Listener)
  db.js              # SQLite + Schema
  crypto.js          # AES-256-GCM
  config.js          # Env -> Config
  store.js           # SQL-Operationen
  middleware.js      # Auth-Guard, publicUser
  webauthn.js        # WebAuthn-Helfer
  cleanup.js         # env-gesteuerter Cleanup-Job
  routes/            # auth.js, totp.js, passkey.js
public/              # index.html, dashboard.html, guide.html, css/, js/, vendor/
test/                # node:test-Suiten
```

---

*Übungs-Demo – bewusst ohne Passwort-/Inhaltsregeln, ausschließlich zum Testen gedacht.*
