'use strict';

/*
 * Öffentliche, vollständig anonyme Nutzungs-Statistik.
 *
 * Liefert ausschließlich AGGREGIERTE, akkumulierte Summen:
 *   - totals: Lebenszeit-Summe je Ereignistyp (siehe store.EVENTS)
 *
 * Bewusst KEINE Momentaufnahme des aktuellen Zustands (z.B. Anzahl aktiver
 * Accounts oder wie viele gerade 2FA/Passkeys nutzen) und KEINE Benutzernamen,
 * Passwörter, Secrets oder IDs – nur kumulative Zähler. Daher ohne Login nutzbar.
 *
 * Wird in src/app.js absichtlich VOR dem Login-Rate-Limiter eingehängt, damit ein
 * Aufruf der Statistik nicht das Limit für echte Login-Versuche aufbraucht.
 */

const express = require('express');
const store = require('../store');

module.exports = function statsRoutes({ db }) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    try {
      res.json({
        generatedAt: Date.now(),
        totals: store.getEventCounts(db),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
