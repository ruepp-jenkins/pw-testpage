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

function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 3000),
    nodeEnv: env.NODE_ENV || 'development',
    sessionSecret: env.SESSION_SECRET || 'dev-only-insecure-session-secret-change-me',
    dbPath: env.DB_PATH || './data/app.db',

    // WebAuthn / Passkeys – für localhost optimiert.
    rpID: env.RP_ID || 'localhost',
    rpName: env.RP_NAME || 'Passwortmanager Übungs-Demo',
    origin: env.ORIGIN || `http://localhost:${int(env.PORT, 3000)}`,

    // Cleanup-Job für alte Übungs-Accounts.
    cleanup: {
      enabled: bool(env.CLEANUP_ENABLED, false),
      intervalMinutes: int(env.CLEANUP_INTERVAL_MINUTES, 60),
      maxAgeHours: int(env.CLEANUP_MAX_AGE_HOURS, 24),
    },
  };
}

module.exports = { loadConfig, bool, int };
