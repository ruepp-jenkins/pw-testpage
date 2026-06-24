'use strict';

/*
 * Datenzugriffs-Schicht: gekapselte SQL-Operationen rund um users & credentials.
 * Alle Funktionen erhalten die better-sqlite3-Instanz als ersten Parameter,
 * damit Tests eine eigene In-Memory-DB injizieren können.
 */

function now() {
  return Date.now();
}

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

module.exports = {
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
};
