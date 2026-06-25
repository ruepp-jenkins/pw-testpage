'use strict';

/*
 * Passkeys (WebAuthn) via @simplewebauthn/server.
 *
 * - Registrierung eines Passkeys für den eingeloggten Account.
 * - Passwortloser Login per Passkey (discoverable / usernameless unterstützt).
 * - Auflisten und Löschen eigener Passkeys.
 *
 * Die Einmal-Challenge wird in der Server-Session gehalten. Gespeichert werden
 * nur öffentliche Schlüssel + Zähler – keine Geheimnisse.
 */

const express = require('express');

const store = require('../store');
const { requireAuth, publicUser } = require('../middleware');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  toBase64url,
  fromBase64url,
} = require('../webauthn');

module.exports = function passkeyRoutes({ db, config }) {
  const router = express.Router();

  function parseTransports(cred) {
    try {
      return JSON.parse(cred.transports || '[]');
    } catch (_) {
      return [];
    }
  }

  // --- Registrierung: Optionen (eingeloggt) ---
  router.post('/register/options', requireAuth, async (req, res, next) => {
    try {
      const user = store.getUserById(db, req.session.userId);
      const existing = store.getCredentialsByUser(db, user.id);

      const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpID,
        userID: new TextEncoder().encode(String(user.id)),
        userName: user.username,
        userDisplayName: user.username,
        attestationType: 'none',
        excludeCredentials: existing.map((c) => ({
          id: c.credential_id,
          transports: parseTransports(c),
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });

      req.session.regChallenge = options.challenge;
      res.json(options);
    } catch (err) {
      next(err);
    }
  });

  // --- Registrierung: Verifikation (eingeloggt) ---
  router.post('/register/verify', requireAuth, async (req, res, next) => {
    try {
      const expectedChallenge = req.session.regChallenge;
      if (!expectedChallenge) {
        return res.status(400).json({ error: 'Keine laufende Passkey-Registrierung.', code: 'NO_PASSKEY_REG' });
      }

      const verification = await verifyRegistrationResponse({
        response: req.body.response,
        expectedChallenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res
          .status(400)
          .json({ error: 'Passkey konnte nicht verifiziert werden.', code: 'PASSKEY_VERIFY_FAILED' });
      }

      const { credential } = verification.registrationInfo;
      store.addCredential(db, req.session.userId, {
        credentialId: credential.id,
        publicKey: toBase64url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        nickname: typeof req.body.nickname === 'string' ? req.body.nickname.trim() : null,
      });
      store.recordEvent(db, store.EVENTS.PASSKEY_ADDED);

      delete req.session.regChallenge;
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // --- Login: Optionen (passwortlos) ---
  router.post('/login/options', async (req, res, next) => {
    try {
      let allowCredentials; // undefined => discoverable / usernameless
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      if (username) {
        const user = store.getUserByUsername(db, username);
        if (user) {
          allowCredentials = store.getCredentialsByUser(db, user.id).map((c) => ({
            id: c.credential_id,
            transports: parseTransports(c),
          }));
        }
      }

      const options = await generateAuthenticationOptions({
        rpID: config.rpID,
        userVerification: 'preferred',
        allowCredentials,
      });

      req.session.authChallenge = options.challenge;
      res.json(options);
    } catch (err) {
      next(err);
    }
  });

  // --- Login: Verifikation (passwortlos) ---
  router.post('/login/verify', async (req, res, next) => {
    try {
      const expectedChallenge = req.session.authChallenge;
      const response = req.body.response;
      if (!expectedChallenge || !response || !response.id) {
        return res.status(400).json({ error: 'Keine laufende Passkey-Anmeldung.', code: 'NO_PASSKEY_AUTH' });
      }

      const dbCred = store.getCredentialByCredId(db, response.id);
      if (!dbCred) {
        store.recordEvent(db, store.EVENTS.LOGIN_FAILED_PASSKEY);
        return res.status(401).json({ error: 'Unbekannter Passkey.', code: 'PASSKEY_UNKNOWN' });
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: false,
        credential: {
          id: dbCred.credential_id,
          publicKey: fromBase64url(dbCred.public_key),
          counter: dbCred.counter,
          transports: parseTransports(dbCred),
        },
      });

      if (!verification.verified) {
        store.recordEvent(db, store.EVENTS.LOGIN_FAILED_PASSKEY);
        return res.status(401).json({ error: 'Passkey-Anmeldung fehlgeschlagen.', code: 'PASSKEY_AUTH_FAILED' });
      }

      store.updateCredentialCounter(db, dbCred.credential_id, verification.authenticationInfo.newCounter);
      delete req.session.authChallenge;

      const user = store.getUserById(db, dbCred.user_id);
      req.session.userId = user.id;
      store.updateLastLogin(db, user.id);
      store.recordEvent(db, store.EVENTS.LOGIN_PASSKEY);
      res.json({ ok: true, user: publicUser(db, user) });
    } catch (err) {
      next(err);
    }
  });

  // --- Eigene Passkeys auflisten ---
  router.get('/', requireAuth, (req, res) => {
    const list = store.getCredentialsByUser(db, req.session.userId).map((c) => ({
      id: c.id,
      nickname: c.nickname,
      createdAt: c.created_at,
      transports: parseTransports(c),
    }));
    res.json({ passkeys: list });
  });

  // --- Passkey löschen ---
  router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const info = store.deleteCredential(db, req.session.userId, id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Passkey nicht gefunden.', code: 'PASSKEY_NOT_FOUND' });
    }
    store.recordEvent(db, store.EVENTS.PASSKEY_REMOVED);
    res.json({ ok: true });
  });

  return router;
};
