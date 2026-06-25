'use strict';

/*
 * 2FA via TOTP (kompatibel mit Google Authenticator, Authy, 1Password etc.).
 *
 * - /setup  : erzeugt ein Secret, speichert es VERSCHLÜSSELT (noch inaktiv),
 *             liefert otpauth-URL + QR-Code (Data-URL) und das Secret für die
 *             manuelle Eingabe. Das Secret gehört dem eingeloggten Nutzer selbst.
 * - /verify : bestätigt einen Code und schaltet 2FA scharf.
 * - /disable: deaktiviert 2FA und löscht das Secret.
 *
 * Das Secret liegt in der DB nur als AES-256-GCM-Chiffre vor (siehe crypto.js).
 */

const express = require('express');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');

const store = require('../store');
const { encrypt, decrypt } = require('../crypto');
const { requireAuth } = require('../middleware');

module.exports = function totpRoutes({ db, config }) {
  const router = express.Router();
  router.use(requireAuth);

  // Secret erzeugen + QR ausliefern (noch nicht aktiviert).
  router.post('/setup', async (req, res, next) => {
    try {
      const user = store.getUserById(db, req.session.userId);
      const secret = authenticator.generateSecret();

      store.setTotpSecret(db, user.id, encrypt(secret));

      const otpauthUrl = authenticator.keyuri(user.username, config.rpName, secret);
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

      // secret wird für die manuelle Eingabe im Authenticator zurückgegeben
      // (Standard-UX; userspezifisch, nicht im Code hinterlegt).
      res.json({ ok: true, secret, otpauthUrl, qrDataUrl });
    } catch (err) {
      next(err);
    }
  });

  // Code prüfen und 2FA aktivieren.
  router.post('/verify', (req, res, next) => {
    try {
      const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
      const user = store.getUserById(db, req.session.userId);
      if (!user.totp_secret_enc) {
        return res.status(400).json({ error: 'Bitte zuerst 2FA einrichten.', code: 'SETUP_2FA_FIRST' });
      }

      const secret = decrypt(user.totp_secret_enc);
      if (!authenticator.check(token, secret)) {
        return res.status(400).json({ error: 'Code ungültig. Bitte erneut versuchen.', code: 'INVALID_2FA_CODE' });
      }

      store.enableTotp(db, user.id);
      store.recordEvent(db, store.EVENTS.TWOFA_ENABLED);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // 2FA deaktivieren.
  router.post('/disable', (req, res, next) => {
    try {
      // Nur zählen, wenn tatsächlich etwas deaktiviert wurde (vorher eingerichtet).
      const user = store.getUserById(db, req.session.userId);
      const wasConfigured = !!(user && (user.totp_enabled || user.totp_secret_enc));
      store.disableTotp(db, req.session.userId);
      if (wasConfigured) store.recordEvent(db, store.EVENTS.TWOFA_DISABLED);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
