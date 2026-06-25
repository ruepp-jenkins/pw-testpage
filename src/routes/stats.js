'use strict';

/*
 * Öffentliche, vollständig anonyme Nutzungs-Statistik.
 *
 * Liefert ausschließlich AGGREGIERTE Ereignis-Summen:
 *   - totals:  Lebenszeit-Summen je Ereignistyp (siehe store.EVENTS)
 *   - last24h: dieselben Summen, aber nur der letzten 24 Stunden
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

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = function statsRoutes({ db }) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    try {
      const now = Date.now();
      res.json({
        generatedAt: now,
        totals: store.getEventCounts(db),
        last24h: store.getEventCounts(db, now - DAY_MS),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
