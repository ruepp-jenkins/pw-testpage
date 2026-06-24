'use strict';

/*
 * Env-gesteuerter Cleanup-Job: entfernt alte Übungs-Accounts (inkl. Passkeys
 * per ON DELETE CASCADE), damit die Demo-DB nicht endlos wächst.
 *
 * Steuerung über Umgebungsvariablen (siehe config.js):
 *   CLEANUP_ENABLED           true/false
 *   CLEANUP_INTERVAL_MINUTES  wie oft der Job läuft
 *   CLEANUP_MAX_AGE_HOURS     Accounts älter als X Stunden werden gelöscht
 */

const store = require('./store');

/**
 * Führt einen einzelnen Cleanup-Durchlauf aus und gibt die Anzahl gelöschter
 * Accounts zurück. Auch direkt in Tests nutzbar.
 */
function runCleanupOnce(db, maxAgeHours, nowTs = Date.now()) {
  const cutoff = nowTs - maxAgeHours * 60 * 60 * 1000;
  const info = store.deleteUsersOlderThan(db, cutoff);
  return info.changes;
}

/**
 * Startet den periodischen Job, falls aktiviert. Gibt eine stop()-Funktion
 * zurück (oder null, wenn deaktiviert). Der Timer blockiert den Prozess-Exit nicht.
 */
function startCleanupJob(db, cleanupConfig, logger = console) {
  if (!cleanupConfig.enabled) {
    logger.log('[cleanup] deaktiviert (CLEANUP_ENABLED=false).');
    return null;
  }

  const { intervalMinutes, maxAgeHours } = cleanupConfig;
  logger.log(
    `[cleanup] aktiv: alle ${intervalMinutes} min, löscht Accounts älter als ${maxAgeHours} h.`
  );

  const tick = () => {
    try {
      const removed = runCleanupOnce(db, maxAgeHours);
      if (removed > 0) {
        logger.log(`[cleanup] ${removed} alte Account(s) entfernt.`);
      }
    } catch (err) {
      logger.error('[cleanup] Fehler:', err.message);
    }
  };

  // Direkt beim Start einmal aufräumen, danach periodisch.
  tick();
  const handle = setInterval(tick, intervalMinutes * 60 * 1000);
  if (typeof handle.unref === 'function') handle.unref();

  return () => clearInterval(handle);
}

module.exports = { startCleanupJob, runCleanupOnce };
