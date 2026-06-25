# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **practice playground** for password managers, 2FA (TOTP), and passkeys (WebAuthn), built around throwaway accounts (no email, periodic auto-cleanup). It can run purely on `localhost` or be hosted behind a real domain. It deliberately enforces **no** username/password content or strength rules — by design. Don't add validation of credential *content*; the only functional invariants are: username + password must be non-empty, usernames are unique, and login is strictly verified. User-facing copy is **German** (with an EN i18n layer); keep new strings bilingual.

**Passwords are double-hashed; plaintext never reaches the server.** The browser pre-hashes the password with PBKDF2 (`public/js/pwhash.js`) and the API only ever receives `pbkdf2$<iter>$<hex>`, which the server then hashes again with argon2 for storage. So the server, its logs, and the DB never see plaintext. The "password non-empty" invariant is therefore enforced on the **client** (form `required` + hashing); the server can only check the *field* is present and matches the client-hash format (`PW_HASH_RE` in `src/routes/auth.js`) — it rejects anything else as `PASSWORD_NOT_HASHED`. This is a transport-format check, **not** a content/strength rule. The PBKDF2 salt is derived deterministically from the username (no server round-trip, so it can't be used for enumeration); the real at-rest protection is argon2's random salt.

## Commands

```bash
npm install          # also runs postinstall -> scripts/vendor-webauthn.js (copies the UMD browser build into public/vendor/)
npm start            # node server.js
npm run dev          # node --watch server.js (restart on change)
npm test             # node --test over test/*.test.js
npm run vendor       # re-copy the vendored WebAuthn browser build

# Run a single test file:
node --test --test-force-exit test/auth.test.js

# Docker — compose pulls the pre-built image `ruepp/pw-testpage` (build: block is commented out)
docker compose up                                           # http://localhost:3000, DB in named volume `appdata` at /data/app.db
docker run --rm -p 3000:3000 -e SESSION_SECRET=x -e APP_ENCRYPTION_KEY=<64-hex> ruepp/pw-testpage  # ephemeral, no .env
docker build -t ruepp/pw-testpage .                         # self-build (or uncomment build: in compose, then `up --build`)
docker build --target test -t pw-testpage:test .            # runs npm test inside the image
```

There is **no linter or build step** configured (the `eslint-disable` comments in `src/app.js` are not backed by an ESLint setup). The frontend is plain HTML/CSS/JS served as-is — no bundler.

Required env before running or testing: `APP_ENCRYPTION_KEY` (32 bytes as 64 hex chars or base64) and `SESSION_SECRET`. See `.env.example`. `crypto.loadKey()` is called at startup and the process exits fatally if the key is missing/invalid.

## Architecture

**App factory vs. bootstrap.** `server.js` is the only entrypoint that opens a real DB, listens on a port, and starts the cleanup job. The Express app itself lives in `src/app.js` as `createApp(db, config)` — it does **not** listen. This split exists so tests start the app on an ephemeral port with an in-memory DB.

**Dependency injection everywhere.** Routes are factory functions `module.exports = function xRoutes({ db, config })`, and every `src/store.js` function takes the `better-sqlite3` instance as its first argument. Nothing reaches for a module-level singleton DB. `test/helpers.js` exploits this with `openDb(':memory:')`.

**Layers:**
- `src/config.js` — env → config object. The single place env vars are read.
- `src/db.js` — opens SQLite (WAL, foreign keys ON), creates the schema idempotently. `users`, `credentials` (passkeys, `ON DELETE CASCADE` from credentials to users), and `events` (anonymous stats).
- `src/store.js` — all SQL lives here; thin functions, no business logic. Exports the `EVENTS` map of stat event-type keys plus `recordEvent`/`recordEventBatch`/`getEventCounts`/`getLiveStats`.
- `src/crypto.js` — AES-256-GCM at rest. Storage format is a single string `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`; decrypt throws on tampering (GCM tag). Only the TOTP secret is encrypted.
- `src/middleware.js` — `requireAuth` (session guard) and `publicUser` (strips a DB user row down to frontend-safe fields). Use `publicUser` for any user object sent to the client.
- `src/webauthn.js` — thin re-export of `@simplewebauthn/server` plus base64url helpers.
- `src/routes/{auth,totp,passkey}.js` — mounted under `/api`, `/api/2fa`, `/api/passkey` respectively, behind a shared rate limiter.
- `src/routes/stats.js` — public `GET /api/usage`, mounted **before** the login rate limiter in `src/app.js` (so reading stats doesn't burn the login attempt budget). Returns only aggregates: `live` (snapshot), `totals` (lifetime per event type), `last24h`. (Files/symbols are named `stats.*` internally; only the public URLs use `usage` — the `/stats` path was taken by an external system.)
- `src/cleanup.js` — env-gated periodic deletion of accounts older than `CLEANUP_MAX_AGE_HOURS`. `runCleanupOnce` is exported for direct test use; the interval timer is `unref`'d so it never blocks exit.

**Login is two-step when 2FA is on.** `POST /api/login` verifies the (client-hashed) password with `argon2.verify`; if `totp_enabled`, it sets `req.session.pendingUserId` and returns `{ twofa: true }` *without* logging in. The session only becomes authenticated (`req.session.userId`) after `POST /api/login/totp` verifies the code. Password failures return a generic error to avoid user enumeration.

**Account deletion is intentionally unauthenticated.** `POST /api/delete-account` deletes by `username` with no session or password check and always returns `{ ok: true }` whether or not the user existed (anti-enumeration); passkeys cascade away via `ON DELETE CASCADE`, and the caller's own session is destroyed if they deleted themselves. This fits the throwaway-account model — don't "harden" it into requiring auth without confirming that's wanted.

**WebAuthn flow.** One-time challenges are held in the session (`regChallenge` / `authChallenge`), never sent to the client to keep. Only public keys + signature counters are persisted. Passwordless/discoverable login is supported: `POST /api/passkey/login/options` with no username yields `allowCredentials: undefined`.

**Stats are anonymous by construction.** The `events` table stores only `(type, created_at)` — never a user id, username, or any credential/secret. Routes call `store.recordEvent(db, store.EVENTS.X)` at the relevant success/failure points (register, login success by method, failed login by method, logout, manual delete, cleanup prune, 2FA on/off, passkey add/remove); cleanup uses `recordEventBatch` for the count it removed. Recording is best-effort (swallows errors) so it can never break an auth flow. The table is append-only (never pruned) so lifetime totals stay accurate; rows are tiny. The `/usage` page (`public/stats.html` + `public/js/stats.js`) is public and shows only these aggregates. **Don't add anything user-identifying to events** — that's the whole point.

**No secrets in the frontend, enforced by CSP.** `src/app.js` sets a strict Content-Security-Policy: `'self'` only, no CDN, no inline scripts (`img-src` allows `data:` for QR codes). This is *why* the WebAuthn browser library is vendored locally via `scripts/vendor-webauthn.js` instead of loaded from a CDN — if you change frontend dependencies, keep them same-origin. The same no-inline-scripts rule is why the language (`public/js/i18n.js`), dark-mode (`public/js/theme.js`), and client-side password-hashing (`public/js/pwhash.js`, which uses the built-in Web Crypto `crypto.subtle` — no new dependency, CSP-friendly) layers are external files. `theme.js` is loaded **blocking in `<head>`** so it can set `data-theme` on `<html>` before first paint (no light-mode flash); theme colors live as CSS variables in `public/css/styles.css`, the choice persists in `localStorage('pm_theme')`, and it falls back to `prefers-color-scheme`. The i18n layer is the analogous pattern for language (`localStorage('pm_lang')`); keep new user-facing strings bilingual in both the static HTML and `i18n.js`.

## Tests

`node:test` + `node:assert/strict`, run with `--test-force-exit`. `test/helpers.js` sets `APP_ENCRYPTION_KEY`/`SESSION_SECRET`/`NODE_ENV` **before** requiring any module that calls `crypto.loadKey()` — preserve that ordering when adding helpers. Each test gets a fresh in-memory DB via `startTestServer()`, and `makeClient()` is a minimal cookie-holding fetch client (one client ≈ one browser session; spin up a fresh client to simulate logout). Because the API expects a client-hashed password, register/login tests must wrap the password with `clientHash(username, password)` from `test/helpers.js` (a Node PBKDF2 mirror of `public/js/pwhash.js` — keep their params in sync), otherwise the server rejects it as `PASSWORD_NOT_HASHED`.

**`npm test` exercises only the server/API (`src/`).** None of the browser code under `public/js/` (`app.js`, `dashboard.js`, `i18n.js`, `theme.js`, `pwhash.js`, `stats.js`) has automated tests, so client-side regressions — e.g. that plaintext never leaves the browser, or that i18n/theme/PBKDF2 still behave — won't be caught by the suite. Verify those by driving a real browser: `playwright-core` and `puppeteer-core` are in `devDependencies` for ad-hoc checks, but the `-core` packages ship **no** browser binary, so point them at an existing Chrome/Chromium (`executablePath`). There is no jsdom/headless harness wired into any npm script.

CI is **Jenkins** (`Jenkinsfile`), not GitHub Actions (the old `.github/workflows/ci.yml` was removed). The pipeline runs `ci/start.sh`, which does a plain `docker build` and pushes the image to Docker Hub (`ruepp/pw-testpage`). Because that build targets the `runtime` stage — which depends on `build`, not `test` — **CI does not run the test suite**; the `test` stage only executes under `docker build --target test` or via `npm test` locally. Node 24 is required (`engines.node >= 24`).

## WebAuthn origin & hosting

Locally, always reach the app via `http://localhost:3000`, not a LAN IP: browsers treat `localhost` as a secure context so passkeys work over plain HTTP, but `RP_ID` (`localhost`) and `ORIGIN` (`http://localhost:3000`) must match the URL in the address bar or verification fails.

When **hosted** behind a real domain, serve over **HTTPS** and override `RP_ID` (hostname only, e.g. `app.example.com`) and `ORIGIN` (full URL, e.g. `https://app.example.com`) to match — otherwise WebAuthn verification fails. Note that `cookie.secure` in `src/app.js` is hardcoded `false` (not gated on `NODE_ENV`), so session cookies are not flagged `Secure` even in production; change that there if you want HTTPS-only cookies.
