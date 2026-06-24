# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **practice playground** for password managers, 2FA (TOTP), and passkeys (WebAuthn), built around throwaway accounts (no email, periodic auto-cleanup). It can run purely on `localhost` or be hosted behind a real domain. It deliberately enforces **no** username/password content or strength rules — by design. Don't add validation of credential *content*; the only functional invariants are: username + password must be non-empty, usernames are unique, and login is strictly verified. User-facing copy is **German** (with an EN i18n layer); keep new strings bilingual.

## Commands

```bash
npm install          # also runs postinstall -> scripts/vendor-webauthn.js (copies the UMD browser build into public/vendor/)
npm start            # node server.js
npm run dev          # node --watch server.js (restart on change)
npm test             # node --test over test/*.test.js
npm run vendor       # re-copy the vendored WebAuthn browser build

# Run a single test file:
node --test --test-force-exit test/auth.test.js

# Docker
docker compose up --build                                   # http://localhost:3000, DB in named volume `appdata` at /data/app.db
docker build --target test -t passwortmanager-demo:test .   # runs npm test inside the image
```

There is **no linter or build step** configured (the `eslint-disable` comments in `src/app.js` are not backed by an ESLint setup). The frontend is plain HTML/CSS/JS served as-is — no bundler.

Required env before running or testing: `APP_ENCRYPTION_KEY` (32 bytes as 64 hex chars or base64) and `SESSION_SECRET`. See `.env.example`. `crypto.loadKey()` is called at startup and the process exits fatally if the key is missing/invalid.

## Architecture

**App factory vs. bootstrap.** `server.js` is the only entrypoint that opens a real DB, listens on a port, and starts the cleanup job. The Express app itself lives in `src/app.js` as `createApp(db, config)` — it does **not** listen. This split exists so tests start the app on an ephemeral port with an in-memory DB.

**Dependency injection everywhere.** Routes are factory functions `module.exports = function xRoutes({ db, config })`, and every `src/store.js` function takes the `better-sqlite3` instance as its first argument. Nothing reaches for a module-level singleton DB. `test/helpers.js` exploits this with `openDb(':memory:')`.

**Layers:**
- `src/config.js` — env → config object. The single place env vars are read.
- `src/db.js` — opens SQLite (WAL, foreign keys ON), creates the schema idempotently. `users` and `credentials` (passkeys), with `ON DELETE CASCADE` from credentials to users.
- `src/store.js` — all SQL lives here; thin functions, no business logic.
- `src/crypto.js` — AES-256-GCM at rest. Storage format is a single string `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`; decrypt throws on tampering (GCM tag). Only the TOTP secret is encrypted.
- `src/middleware.js` — `requireAuth` (session guard) and `publicUser` (strips a DB user row down to frontend-safe fields). Use `publicUser` for any user object sent to the client.
- `src/webauthn.js` — thin re-export of `@simplewebauthn/server` plus base64url helpers.
- `src/routes/{auth,totp,passkey}.js` — mounted under `/api`, `/api/2fa`, `/api/passkey` respectively, behind a shared rate limiter.
- `src/cleanup.js` — env-gated periodic deletion of accounts older than `CLEANUP_MAX_AGE_HOURS`. `runCleanupOnce` is exported for direct test use; the interval timer is `unref`'d so it never blocks exit.

**Login is two-step when 2FA is on.** `POST /api/login` verifies the password; if `totp_enabled`, it sets `req.session.pendingUserId` and returns `{ twofa: true }` *without* logging in. The session only becomes authenticated (`req.session.userId`) after `POST /api/login/totp` verifies the code. Password failures return a generic error to avoid user enumeration.

**Account deletion is intentionally unauthenticated.** `POST /api/delete-account` deletes by `username` with no session or password check and always returns `{ ok: true }` whether or not the user existed (anti-enumeration); passkeys cascade away via `ON DELETE CASCADE`, and the caller's own session is destroyed if they deleted themselves. This fits the throwaway-account model — don't "harden" it into requiring auth without confirming that's wanted.

**WebAuthn flow.** One-time challenges are held in the session (`regChallenge` / `authChallenge`), never sent to the client to keep. Only public keys + signature counters are persisted. Passwordless/discoverable login is supported: `POST /api/passkey/login/options` with no username yields `allowCredentials: undefined`.

**No secrets in the frontend, enforced by CSP.** `src/app.js` sets a strict Content-Security-Policy: `'self'` only, no CDN, no inline scripts (`img-src` allows `data:` for QR codes). This is *why* the WebAuthn browser library is vendored locally via `scripts/vendor-webauthn.js` instead of loaded from a CDN — if you change frontend dependencies, keep them same-origin. The same no-inline-scripts rule is why the language (`public/js/i18n.js`) and dark-mode (`public/js/theme.js`) layers are external files. `theme.js` is loaded **blocking in `<head>`** so it can set `data-theme` on `<html>` before first paint (no light-mode flash); theme colors live as CSS variables in `public/css/styles.css`, the choice persists in `localStorage('pm_theme')`, and it falls back to `prefers-color-scheme`. The i18n layer is the analogous pattern for language (`localStorage('pm_lang')`); keep new user-facing strings bilingual in both the static HTML and `i18n.js`.

## Tests

`node:test` + `node:assert/strict`, run with `--test-force-exit`. `test/helpers.js` sets `APP_ENCRYPTION_KEY`/`SESSION_SECRET`/`NODE_ENV` **before** requiring any module that calls `crypto.loadKey()` — preserve that ordering when adding helpers. Each test gets a fresh in-memory DB via `startTestServer()`, and `makeClient()` is a minimal cookie-holding fetch client (one client ≈ one browser session; spin up a fresh client to simulate logout).

CI is **Jenkins** (`Jenkinsfile`), not GitHub Actions (the old `.github/workflows/ci.yml` was removed). The pipeline runs `ci/start.sh`, which does a plain `docker build` and pushes the image to Docker Hub (`ruepp/pw-testpage`). Because that build targets the `runtime` stage — which depends on `build`, not `test` — **CI does not run the test suite**; the `test` stage only executes under `docker build --target test` or via `npm test` locally. Node 24 is required (`engines.node >= 24`).

## WebAuthn origin & hosting

Locally, always reach the app via `http://localhost:3000`, not a LAN IP: browsers treat `localhost` as a secure context so passkeys work over plain HTTP, but `RP_ID` (`localhost`) and `ORIGIN` (`http://localhost:3000`) must match the URL in the address bar or verification fails.

When **hosted** behind a real domain, serve over **HTTPS** and override `RP_ID` (hostname only, e.g. `app.example.com`) and `ORIGIN` (full URL, e.g. `https://app.example.com`) to match — otherwise WebAuthn verification fails. Note that `cookie.secure` in `src/app.js` is hardcoded `false` (not gated on `NODE_ENV`), so session cookies are not flagged `Secure` even in production; change that there if you want HTTPS-only cookies.
