'use strict';

/*
 * Öffentliche, vollständig anonyme Nutzungs-Statistik.
 *
 * Liefert ausschließlich AGGREGIERTE Zahlen:
 *   - live:    aktuelle Momentaufnahme (aktive Accounts, davon mit 2FA, Passkeys)
 *   - totals:  Lebenszeit-Summen je Ereignistyp (siehe store.EVENTS)
 *   - last24h: dieselben Summen, aber nur der letzten 24 Stunden
 *
 * Es werden bewusst KEINE Benutzernamen, Passwörter, Secrets, IDs oder sonstige
 * personenbezogenen Daten zurückgegeben – nur Zähler. Daher ohne Login nutzbar.
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
        live: store.getLiveStats(db),
        totals: store.getEventCounts(db),
        last24h: store.getEventCounts(db, now - DAY_MS),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
