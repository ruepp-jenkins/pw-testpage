'use strict';

/*
 * Zentrale Konfiguration aus Umgebungsvariablen. Sämtliche Secrets bleiben hier
 * serverseitig – das Frontend erhält davon nichts.
 */

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Wert für Express' `trust proxy`: Zahl (Hops), Boolean oder String (z.B.
// 'loopback'/Subnetz). Leer -> Fallback.
function trustProxy(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const v = String(value).toLowerCase();
  if (['true', 'yes', 'on'].includes(v)) return true;
  if (['false', 'no', 'off'].includes(v)) return false;
  return value;
}

function loadConfig(env = process.env) {
  const origin = env.ORIGIN || `http://localhost:${int(env.PORT, 3000)}`;

  // Hosting-Härtung an das ORIGIN-SCHEMA koppeln, NICHT an NODE_ENV: so läuft
  // http://localhost auch mit NODE_ENV=production (Secure-Cookies über http würden
  // den Login sonst brechen), und hinter echtem HTTPS (ORIGIN=https://…) sind die
  // Schutzmaßnahmen automatisch an. Beides per Env explizit übersteuerbar.
  //   secureCookies -> Session-Cookie als `Secure` + HSTS (nur mit HTTPS sinnvoll)
  //   trustProxy    -> korrekte Client-IP fürs Rate-Limit hinter einem Reverse-Proxy
  const httpsOrigin = origin.startsWith('https://');

  return {
    port: int(env.PORT, 3000),
    nodeEnv: env.NODE_ENV || 'development',
    sessionSecret: env.SESSION_SECRET || 'dev-only-insecure-session-secret-change-me',
    dbPath: env.DB_PATH || './data/app.db',

    secureCookies: bool(env.SECURE_COOKIES, httpsOrigin),
    trustProxy: trustProxy(env.TRUST_PROXY, httpsOrigin ? 1 : false),

    // WebAuthn / Passkeys – für localhost optimiert.
    rpID: env.RP_ID || 'localhost',
    rpName: env.RP_NAME || 'Passwortmanager Übungs-Demo',
    origin,

    // Cleanup-Job für alte Übungs-Accounts.
    cleanup: {
      enabled: bool(env.CLEANUP_ENABLED, false),
      intervalMinutes: int(env.CLEANUP_INTERVAL_MINUTES, 60),
      maxAgeHours: int(env.CLEANUP_MAX_AGE_HOURS, 24),
    },
  };
}

module.exports = { loadConfig, bool, int, trustProxy };
