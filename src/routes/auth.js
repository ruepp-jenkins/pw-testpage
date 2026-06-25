'use strict';

/*
 * Registrierung, Login, Logout, Profil.
 *
 * Bewusst KEINE Validierung von Inhalt/Format (Übungsseite): beliebige Benutzer-
 * namen und Passwörter sind erlaubt – keine Stärke-Regeln, keine E-Mail.
 * Funktional erzwungen wird hingegen:
 *   - Benutzername & Passwort müssen vorhanden (nicht leer) sein,
 *   - Benutzernamen sind eindeutig (kein doppeltes Anlegen),
 *   - Login wird strikt geprüft (nur korrektes Passwort führt zum Erfolg).
 *
 * Double-Hash: Das `password`-Feld enthält NICHT den Klartext, sondern bereits
 * einen client-seitigen PBKDF2-Hash (siehe public/js/pwhash.js). Der Klartext
 * verlässt den Browser nie – Server, Logs und DB sehen ihn nie. Wir hashen den
 * empfangenen Wert ein zweites Mal mit argon2 (zufälliger Salt) für die DB und
 * verweigern alles, was nicht wie ein Client-Hash aussieht (PW_HASH_RE), damit
 * versehentlich kein Klartext gespeichert wird. Das ist eine Transport-Format-
 * prüfung, KEINE Inhalts-/Stärkeprüfung des Passworts.
 */

const express = require('express');
const argon2 = require('argon2');
const { authenticator } = require('otplib');

const store = require('../store');
const { decrypt } = require('../crypto');
const { requireAuth, publicUser } = require('../middleware');

const ARGON_OPTS = { type: argon2.argon2id };

module.exports = function authRoutes({ db, config }) {
  const router = express.Router();

  // Erwartetes Wire-Format des client-seitig vorgehashten Passworts
  // (pbkdf2$<iter>$<hex>, siehe public/js/pwhash.js). Wehrt versehentlichen
  // Klartext ab – garantiert aber NICHT, dass es der Hash eines echten Passworts
  // ist; den Klartext nie zu übertragen leistet allein der Client.
  const PW_HASH_RE = /^pbkdf2\$\d+\$[0-9a-f]{32,}$/;

  // Voraussichtlicher Löschzeitpunkt eines Accounts (oder null, wenn der
  // Cleanup-Job deaktiviert ist). Spiegelt die Logik aus cleanup.js wider:
  // gelöscht wird, sobald created_at älter als maxAgeHours ist.
  function accountDeletesAt(user) {
    const cleanup = config && config.cleanup;
    if (!cleanup || !cleanup.enabled) return null;
    return user.created_at + cleanup.maxAgeHours * 60 * 60 * 1000;
  }

  // --- Registrierung ---
  router.post('/register', async (req, res, next) => {
    try {
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';

      // Einziger Check: nicht leer (sonst ist kein Login möglich).
      if (!username || !password) {
        return res
          .status(400)
          .json({ error: 'Benutzername und Passwort sind erforderlich.', code: 'MISSING_CREDENTIALS' });
      }

      // Es muss ein client-seitiger Hash sein, nie Klartext.
      if (!PW_HASH_RE.test(password)) {
        return res
          .status(400)
          .json({ error: 'Passwort muss im Browser gehasht werden.', code: 'PASSWORD_NOT_HASHED' });
      }

      if (store.getUserByUsername(db, username)) {
        return res.status(409).json({ error: 'Benutzername bereits vergeben.', code: 'USERNAME_TAKEN' });
      }

      const passwordHash = await argon2.hash(password, ARGON_OPTS);
      const user = store.createUser(db, username, passwordHash);
      store.recordEvent(db, store.EVENTS.ACCOUNT_CREATED);

      store.updateLastLogin(db, user.id);
      req.session.userId = user.id;
      return res.status(201).json({ ok: true, user: publicUser(db, user) });
    } catch (err) {
      // Race-Condition auf den UNIQUE-Index sauber abfangen.
      if (err && /UNIQUE/.test(String(err.message))) {
        return res.status(409).json({ error: 'Benutzername bereits vergeben.', code: 'USERNAME_TAKEN' });
      }
      next(err);
    }
  });

  // --- Login (Schritt 1: Passwort) ---
  router.post('/login', async (req, res, next) => {
    try {
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';

      // Client-Hash erwartet (nie Klartext). Antwort ist account-unabhängig,
      // verrät also nichts über die Existenz des Benutzers.
      if (!PW_HASH_RE.test(password)) {
        return res
          .status(400)
          .json({ error: 'Passwort muss im Browser gehasht werden.', code: 'PASSWORD_NOT_HASHED' });
      }

      const user = store.getUserByUsername(db, username);

      // Strikte Prüfung. Generische Antwort, um User-Enumeration zu vermeiden.
      const ok = user ? await argon2.verify(user.password_hash, password).catch(() => false) : false;
      if (!ok) {
        store.recordEvent(db, store.EVENTS.LOGIN_FAILED_PASSWORD);
        return res
          .status(401)
          .json({ error: 'Benutzername oder Passwort ist falsch.', code: 'INVALID_CREDENTIALS' });
      }

      if (user.totp_enabled) {
        // Noch nicht eingeloggt – erst nach 2FA-Code. (Erfolg wird erst in
        // /login/totp gezählt, hier ist der Login noch nicht abgeschlossen.)
        req.session.pendingUserId = user.id;
        return res.json({ ok: true, twofa: true });
      }

      req.session.userId = user.id;
      store.updateLastLogin(db, user.id);
      store.recordEvent(db, store.EVENTS.LOGIN_PASSWORD);
      return res.json({ ok: true, twofa: false, user: publicUser(db, user) });
    } catch (err) {
      next(err);
    }
  });

  // --- Login (Schritt 2: TOTP-Code, nur falls 2FA aktiv) ---
  router.post('/login/totp', (req, res, next) => {
    try {
      const pendingUserId = req.session.pendingUserId;
      if (!pendingUserId) {
        return res.status(401).json({ error: 'Kein laufender Login-Vorgang.', code: 'NO_LOGIN_FLOW' });
      }
      const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
      const user = store.getUserById(db, pendingUserId);
      if (!user || !user.totp_secret_enc) {
        return res.status(401).json({ error: 'Kein laufender Login-Vorgang.', code: 'NO_LOGIN_FLOW' });
      }

      const secret = decrypt(user.totp_secret_enc);
      if (!authenticator.check(token, secret)) {
        store.recordEvent(db, store.EVENTS.LOGIN_FAILED_2FA);
        return res.status(401).json({ error: 'Der 2FA-Code ist ungültig.', code: 'INVALID_2FA_CODE' });
      }

      delete req.session.pendingUserId;
      req.session.userId = user.id;
      store.updateLastLogin(db, user.id);
      store.recordEvent(db, store.EVENTS.LOGIN_2FA);
      return res.json({ ok: true, user: publicUser(db, user) });
    } catch (err) {
      next(err);
    }
  });

  // --- Logout ---
  router.post('/logout', (req, res) => {
    // Nur echte Logouts zählen (eine bestehende, eingeloggte Session).
    if (req.session && req.session.userId) {
      store.recordEvent(db, store.EVENTS.LOGOUT);
    }
    req.session.destroy(() => {
      res.clearCookie('sid');
      res.json({ ok: true });
    });
  });

  // --- Account löschen (bewusst OHNE Login) ---
  // Übungsseite: jeder darf einen Test-Account per Benutzernamen sofort löschen,
  // um ihn neu anlegen zu können. Es gibt keine echten/sensiblen Daten, und der
  // Cleanup-Job entfernt alte Accounts ohnehin. Gelöscht wird der User-Datensatz
  // inkl. TOTP-Secret; Passkeys gehen per ON DELETE CASCADE mit.
  //
  // Die Antwort ist bewusst identisch, egal ob der Benutzername existierte oder
  // nicht (keine User-Enumeration). Der Aufrufer erfährt nur: „falls es ihn gab,
  // ist er jetzt weg."
  router.post('/delete-account', (req, res, next) => {
    try {
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      if (!username) {
        return res.status(400).json({ error: 'Benutzername ist erforderlich.', code: 'MISSING_USERNAME' });
      }

      const user = store.getUserByUsername(db, username);
      if (user) {
        store.deleteUserById(db, user.id);
        store.recordEvent(db, store.EVENTS.ACCOUNT_DELETED);

        // Falls man gerade seinen eigenen (eingeloggten oder pending-2FA) Account
        // löscht, die laufende Session beenden – sonst zeigt sie ins Leere.
        if (req.session && (req.session.userId === user.id || req.session.pendingUserId === user.id)) {
          return req.session.destroy(() => {
            res.clearCookie('sid');
            res.json({ ok: true });
          });
        }
      }

      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // --- Aktuelles Profil ---
  router.get('/me', requireAuth, (req, res) => {
    const user = store.getUserById(db, req.session.userId);
    if (!user) {
      return req.session.destroy(() =>
        res.status(401).json({ error: 'Nicht angemeldet.', code: 'NOT_AUTHENTICATED' })
      );
    }
    res.json({ user: publicUser(db, user), deletesAt: accountDeletesAt(user) });
  });

  return router;
};
