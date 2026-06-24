'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const store = require('../src/store');
const { runCleanupOnce } = require('../src/cleanup');

test('Cleanup löscht Accounts, die älter als maxAge sind', () => {
  const db = openDb(':memory:');
  try {
    // frischer und alter Account
    const fresh = store.createUser(db, 'frisch', 'hash');
    const old = store.createUser(db, 'alt', 'hash');

    // "alt" künstlich altern lassen (created_at weit in die Vergangenheit)
    const longAgo = Date.now() - 1000 * 60 * 60 * 48; // 48h
    db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(longAgo, old.id);

    // Passkey am alten Account -> muss mit gelöscht werden (CASCADE)
    store.addCredential(db, old.id, {
      credentialId: 'cred-1',
      publicKey: 'pk',
      counter: 0,
      transports: [],
      nickname: 'x',
    });

    const removed = runCleanupOnce(db, 24); // älter als 24h löschen
    assert.equal(removed, 1);
    assert.equal(store.countUsers(db), 1);
    assert.ok(store.getUserById(db, fresh.id), 'frischer Account bleibt');
    assert.equal(store.getUserById(db, old.id), undefined, 'alter Account weg');
    assert.equal(store.getCredentialByCredId(db, 'cred-1'), undefined, 'Passkey kaskadiert gelöscht');
  } finally {
    db.close();
  }
});

test('Cleanup ohne alte Accounts löscht nichts', () => {
  const db = openDb(':memory:');
  try {
    store.createUser(db, 'a', 'h');
    store.createUser(db, 'b', 'h');
    const removed = runCleanupOnce(db, 24);
    assert.equal(removed, 0);
    assert.equal(store.countUsers(db), 2);
  } finally {
    db.close();
  }
});
