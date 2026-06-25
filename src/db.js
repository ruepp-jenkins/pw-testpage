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

-- Anonyme Ereignis-Statistik. Bewusst OHNE Bezug zu users/credentials: nur der
-- Ereignistyp und ein Zeitstempel werden gespeichert – keine Benutzernamen, keine
-- Passwort-/Secret-Daten, keine IDs. Append-only (nie geleert), damit die
-- Gesamtsummen echte Lebenszeit-Totale bleiben; die Zeilen sind winzig.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at);
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
  return db;
}

module.exports = { openDb };
