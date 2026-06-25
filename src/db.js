'use strict';

/*
 * SQLite-Zugriff via better-sqlite3 (synchron, ideal für einen einzelnen
 * localhost-Prozess). Schema wird beim Öffnen idempotent angelegt.
 *
 * openDb(':memory:') liefert eine flüchtige In-Memory-DB für Tests.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT    NOT NULL UNIQUE,
  password_hash   TEXT    NOT NULL,
  totp_secret_enc TEXT,                       -- AES-256-GCM verschlüsselt, NULL = kein 2FA
  totp_enabled    INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);

CREATE TABLE IF NOT EXISTS credentials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  credential_id TEXT    NOT NULL UNIQUE,       -- base64url
  public_key    TEXT    NOT NULL,              -- base64url
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,                          -- JSON-Array
  nickname      TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Anonyme Nutzungs-Statistik als AKKUMULIERTE Zähler: genau eine Zeile je
-- Ereignistyp mit laufender Summe. Bewusst KEINE Einzelereignis-Zeilen (also
-- kein unbegrenztes DB-Wachstum) und kein Bezug zu users/credentials – keine
-- Benutzernamen, Passwörter/Secrets, IDs oder Zeitstempel, nur Zähler.
CREATE TABLE IF NOT EXISTS stat_counters (
  type  TEXT    PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
`;

/**
 * Öffnet (oder erstellt) die SQLite-Datenbank und legt das Schema an.
 * @param {string} dbPath  Dateipfad oder ':memory:'
 * @returns {import('better-sqlite3').Database}
 */
function openDb(dbPath) {
  if (dbPath && dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new Database(dbPath || ':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrateLegacyEvents(db);
  return db;
}

/**
 * Einmalige Migration: Die frühere Einzelereignis-Tabelle `events` (append-only,
 * wuchs unbegrenzt) wird in die akkumulierten `stat_counters` überführt und dann
 * entfernt. So bleiben bestehende Gesamtsummen erhalten, ohne weiteres Wachstum.
 * Idempotent: ohne `events`-Tabelle (Neuinstallation) passiert nichts.
 */
function migrateLegacyEvents(db) {
  const hasEvents = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'")
    .get();
  if (!hasEvents) return;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO stat_counters (type, count)
         SELECT type, COUNT(*) FROM events GROUP BY type
       ON CONFLICT(type) DO UPDATE SET count = count + excluded.count`
    ).run();
    db.exec('DROP TABLE events');
  })();
}

module.exports = { openDb, migrateLegacyEvents };
