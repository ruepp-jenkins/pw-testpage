'use strict';

/*
 * Datenzugriffs-Schicht: gekapselte SQL-Operationen rund um users & credentials.
 * Alle Funktionen erhalten die better-sqlite3-Instanz als ersten Parameter,
 * damit Tests eine eigene In-Memory-DB injizieren können.
 */

function now() {
  return Date.now();
}

// --- Statistik-Ereignistypen ---
// Stabile Schlüssel für die anonyme Ereignis-Statistik (siehe events-Tabelle in
// db.js und src/routes/stats.js). Werden auch im Frontend als Element-IDs genutzt.
const EVENTS = {
  ACCOUNT_CREATED: 'account_created',
  ACCOUNT_DELETED: 'account_deleted', // von Hand gelöscht (delete-account)
  ACCOUNT_PRUNED: 'account_pruned', // vom Cleanup-Job automatisch entfernt
  LOGOUT: 'logout',
  LOGIN_PASSWORD: 'login_password', // erfolgreich, ohne 2FA
  LOGIN_2FA: 'login_2fa', // erfolgreich, mit 2FA-Code
  LOGIN_PASSKEY: 'login_passkey', // erfolgreich, per Passkey
  LOGIN_FAILED_PASSWORD: 'login_failed_password',
  LOGIN_FAILED_2FA: 'login_failed_2fa',
  LOGIN_FAILED_PASSKEY: 'login_failed_passkey',
  TWOFA_ENABLED: 'twofa_enabled',
  TWOFA_DISABLED: 'twofa_disabled',
  PASSKEY_ADDED: 'passkey_added',
  PASSKEY_REMOVED: 'passkey_removed',
};

function createUser(db, username, passwordHash) {
  const info = db
    .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, now());
  return getUserById(db, info.lastInsertRowid);
}

function getUserByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function updateLastLogin(db, userId) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), userId);
}

// Löscht einen Account hart; credentials (Passkeys) gehen per ON DELETE CASCADE mit.
function deleteUserById(db, userId) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

function setTotpSecret(db, userId, secretEnc) {
  db.prepare('UPDATE users SET totp_secret_enc = ?, totp_enabled = 0 WHERE id = ?').run(secretEnc, userId);
}

function enableTotp(db, userId) {
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(userId);
}

function disableTotp(db, userId) {
  db.prepare('UPDATE users SET totp_secret_enc = NULL, totp_enabled = 0 WHERE id = ?').run(userId);
}

// --- Passkeys / WebAuthn credentials ---

function addCredential(db, userId, { credentialId, publicKey, counter, transports, nickname }) {
  db.prepare(
    `INSERT INTO credentials (user_id, credential_id, public_key, counter, transports, nickname, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, credentialId, publicKey, counter, JSON.stringify(transports || []), nickname || null, now());
}

function getCredentialsByUser(db, userId) {
  return db.prepare('SELECT * FROM credentials WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function getCredentialByCredId(db, credentialId) {
  return db.prepare('SELECT * FROM credentials WHERE credential_id = ?').get(credentialId);
}

function updateCredentialCounter(db, credentialId, counter) {
  db.prepare('UPDATE credentials SET counter = ? WHERE credential_id = ?').run(counter, credentialId);
}

function deleteCredential(db, userId, id) {
  return db.prepare('DELETE FROM credentials WHERE id = ? AND user_id = ?').run(id, userId);
}

// --- Cleanup ---

function deleteUsersOlderThan(db, cutoffTs) {
  // credentials werden per ON DELETE CASCADE mitgelöscht.
  return db.prepare('DELETE FROM users WHERE created_at < ?').run(cutoffTs);
}

function countUsers(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// --- Anonyme Ereignis-Statistik ---

// Ein einzelnes Ereignis zählen. Bewusst tolerant: eine fehlgeschlagene
// Statistik darf NIE den eigentlichen Ablauf (Login etc.) stören.
function recordEvent(db, type, ts = now()) {
  try {
    db.prepare('INSERT INTO events (type, created_at) VALUES (?, ?)').run(type, ts);
  } catch (_) {
    /* Statistik ist nebensächlich – Fehler hier ignorieren. */
  }
}

// Mehrere gleichartige Ereignisse auf einmal zählen (z.B. Cleanup-Löschungen).
function recordEventBatch(db, type, count, ts = now()) {
  if (!count || count <= 0) return;
  try {
    const stmt = db.prepare('INSERT INTO events (type, created_at) VALUES (?, ?)');
    const tx = db.transaction((n) => {
      for (let i = 0; i < n; i++) stmt.run(type, ts);
    });
    tx(count);
  } catch (_) {
    /* siehe recordEvent */
  }
}

// Liefert { type: count } für alle Ereignisse seit sinceTs (Default: alle).
function getEventCounts(db, sinceTs = 0) {
  const rows = db
    .prepare('SELECT type, COUNT(*) AS n FROM events WHERE created_at >= ? GROUP BY type')
    .all(sinceTs);
  const out = {};
  for (const r of rows) out[r.type] = r.n;
  return out;
}

// Aktuelle Momentaufnahme (keine Verlaufsdaten): wie viele Accounts es gerade
// gibt und wie viele davon 2FA/Passkeys nutzen. Rein aggregiert, keine Namen.
function getLiveStats(db) {
  return {
    activeAccounts: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    accountsWithTotp: db.prepare('SELECT COUNT(*) AS n FROM users WHERE totp_enabled = 1').get().n,
    totalPasskeys: db.prepare('SELECT COUNT(*) AS n FROM credentials').get().n,
  };
}

module.exports = {
  EVENTS,
  createUser,
  getUserByUsername,
  getUserById,
  updateLastLogin,
  deleteUserById,
  setTotpSecret,
  enableTotp,
  disableTotp,
  addCredential,
  getCredentialsByUser,
  getCredentialByCredId,
  updateCredentialCounter,
  deleteCredential,
  deleteUsersOlderThan,
  countUsers,
  recordEvent,
  recordEventBatch,
  getEventCounts,
  getLiveStats,
};
