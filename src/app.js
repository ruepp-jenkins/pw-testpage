'use strict';

/*
 * Express-App-Factory. Erstellt die App OHNE zu lauschen, damit Tests sie auf
 * einem Ephemeral-Port starten können. Bekommt DB + Config injiziert.
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const SqliteStore = require('better-sqlite3-session-store')(session);

const authRoutes = require('./routes/auth');
const totpRoutes = require('./routes/totp');
const passkeyRoutes = require('./routes/passkey');
const statsRoutes = require('./routes/stats');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp(db, config) {
  const app = express();
  app.disable('x-powered-by');

  // Security-Header. CSP erlaubt nur eigene Ressourcen (kein CDN); QR-Codes
  // kommen als data:-URI -> img-src 'self' data:. HSTS aus, da http/localhost.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: false,
    })
  );

  app.use(express.json({ limit: '64kb' }));

  app.use(
    session({
      name: 'sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new SqliteStore({
        client: db,
        expired: { clear: true, intervalMs: 15 * 60 * 1000 },
      }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // localhost via http
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  // Leichtes Rate-Limit gegen stures Durchprobieren bei Login/Passkey-Login.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Versuche. Bitte kurz warten.', code: 'RATE_LIMITED' },
  });

  // --- Seiten ---
  app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.get('/dashboard', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
  });
  app.get('/guide', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'guide.html')));
  app.get('/usage', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'stats.html')));

  // Statische Assets (css/js/vendor). index:false, damit '/' oben greift.
  app.use(express.static(PUBLIC_DIR, { index: false }));

  // --- API ---
  // Öffentliche, anonyme Statistik – bewusst VOR dem Login-Rate-Limiter, damit
  // sie nicht das Versuchslimit für echte Logins verbraucht.
  app.use('/api/usage', statsRoutes({ db }));

  app.use('/api', loginLimiter);
  app.use('/api', authRoutes({ db, config }));
  app.use('/api/2fa', totpRoutes({ db, config }));
  app.use('/api/passkey', passkeyRoutes({ db, config }));

  // 404 für unbekannte API-Pfade.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.', code: 'NOT_FOUND' }));

  // Zentrale Fehlerbehandlung.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    res.status(500).json({ error: 'Interner Serverfehler.', code: 'SERVER_ERROR' });
  });

  return app;
}

module.exports = { createApp };
