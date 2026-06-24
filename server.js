'use strict';

/*
 * Einstiegspunkt: lädt .env, prüft Secrets, öffnet die DB, startet App + Cleanup
 * und lauscht auf dem konfigurierten Port. (Die App selbst steckt in src/app.js.)
 */

require('dotenv').config();

const { loadConfig } = require('./src/config');
const { openDb } = require('./src/db');
const { loadKey } = require('./src/crypto');
const { createApp } = require('./src/app');
const { startCleanupJob } = require('./src/cleanup');

function main() {
  const config = loadConfig();

  // Früh & deutlich scheitern, wenn der Verschlüsselungs-Key fehlt/ungültig ist.
  try {
    loadKey();
  } catch (err) {
    console.error('\n[FATAL] ' + err.message + '\n');
    process.exit(1);
  }

  if (config.nodeEnv === 'production' && config.sessionSecret.startsWith('dev-only')) {
    console.warn('[WARN] SESSION_SECRET ist nicht gesetzt – bitte in Produktion ändern.');
  }

  const db = openDb(config.dbPath);
  const app = createApp(db, config);
  startCleanupJob(db, config.cleanup);

  const server = app.listen(config.port, () => {
    console.log(`\n  Passwortmanager Übungs-Demo läuft auf:  ${config.origin}`);
    console.log(`  (DB: ${config.dbPath} | RP-ID: ${config.rpID})\n`);
  });

  const shutdown = (signal) => {
    console.log(`\n[${signal}] fahre herunter ...`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
