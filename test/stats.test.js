'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { startTestServer, makeClient, clientHash } = require('./helpers');
const { runCleanupOnce } = require('../src/cleanup');
const { migrateLegacyEvents } = require('../src/db');

test('Stats: leere Statistik liefert nur aggregierte Zahlen, keine Namen', async () => {
  const s = await startTestServer();
  try {
    const { status, data } = await s.client.get('/api/usage');
    assert.equal(status, 200);
    assert.ok(data.totals);
    // Weder Momentaufnahme (aktive Accounts/2FA/Passkeys) noch Verlaufsdaten.
    assert.equal(data.live, undefined);
    assert.equal(data.last24h, undefined);
    // Antwort enthält nur Zahlen/Objekte – keinerlei Strings mit PII.
    const json = JSON.stringify(data);
    assert.ok(!/username|password|secret/i.test(json));
  } finally {
    await s.close();
  }
});

test('Stats: Registrierung zählt account_created', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'alice', password: clientHash('alice', 'pw') });
    await makeClient(s.baseURL).post('/api/register', { username: 'bob', password: clientHash('bob', 'pw') });

    const { data } = await s.client.get('/api/usage');
    assert.equal(data.totals.account_created, 2);
  } finally {
    await s.close();
  }
});

test('Stats: erfolgreiche und fehlgeschlagene Passwort-Logins werden getrennt gezählt', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'carol', password: clientHash('carol', 'richtig') });
    const fresh = makeClient(s.baseURL);

    await fresh.post('/api/login', { username: 'carol', password: clientHash('carol', 'falsch') });
    await fresh.post('/api/login', { username: 'gibtsnicht', password: clientHash('gibtsnicht', 'x') });
    await fresh.post('/api/login', { username: 'carol', password: clientHash('carol', 'richtig') });

    const { data } = await s.client.get('/api/usage');
    assert.equal(data.totals.login_password, 1);
    assert.equal(data.totals.login_failed_password, 2);
  } finally {
    await s.close();
  }
});

test('Stats: nur echte Logouts (mit Session) zählen', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'dave', password: clientHash('dave', 'pw') });
    await s.client.post('/api/logout'); // echte Session -> zählt

    const stranger = makeClient(s.baseURL);
    await stranger.post('/api/logout'); // keine Session -> zählt nicht

    const { data } = await s.client.get('/api/usage');
    assert.equal(data.totals.logout, 1);
  } finally {
    await s.close();
  }
});

test('Stats: manuelles Löschen zählt account_deleted', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'erin', password: clientHash('erin', 'pw') });
    await makeClient(s.baseURL).post('/api/delete-account', { username: 'erin' });
    // Löschen eines nicht existierenden Namens darf NICHT zählen.
    await makeClient(s.baseURL).post('/api/delete-account', { username: 'gibtsnicht' });

    const { data } = await s.client.get('/api/usage');
    assert.equal(data.totals.account_deleted, 1);
  } finally {
    await s.close();
  }
});

test('Stats: Cleanup zählt account_pruned je entferntem Account', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'old1', password: clientHash('old1', 'pw') });
    await makeClient(s.baseURL).post('/api/register', { username: 'old2', password: clientHash('old2', 'pw') });

    // maxAgeHours = 0 -> alle bestehenden Accounts gelten als überfällig.
    const removed = runCleanupOnce(s.db, 0);
    assert.equal(removed, 2);

    const { data } = await s.client.get('/api/usage');
    assert.equal(data.totals.account_pruned, 2);
  } finally {
    await s.close();
  }
});

test('Stats: /api/usage umgeht das Login-Rate-Limit nicht-blockierend', async () => {
  const s = await startTestServer();
  try {
    // Viele Stats-Abrufe dürfen das Login-Limit nicht aufbrauchen.
    for (let i = 0; i < 120; i++) {
      const r = await s.client.get('/api/usage');
      assert.equal(r.status, 200);
    }
    const reg = await s.client.post('/api/register', { username: 'frank', password: clientHash('frank', 'pw') });
    assert.equal(reg.status, 201);
  } finally {
    await s.close();
  }
});

test('Stats: Migration der alten events-Tabelle in akkumulierte Zähler', () => {
  const db = new Database(':memory:');
  try {
    // Alten Zustand nachstellen: leere Zähler-Tabelle + befüllte events-Tabelle.
    db.exec(`
      CREATE TABLE stat_counters (type TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
    const ins = db.prepare('INSERT INTO events (type, created_at) VALUES (?, ?)');
    ins.run('account_created', 1);
    ins.run('account_created', 2);
    ins.run('logout', 3);

    migrateLegacyEvents(db);

    // events-Zeilen sind zu Summen geworden …
    assert.equal(db.prepare("SELECT count FROM stat_counters WHERE type = 'account_created'").get().count, 2);
    assert.equal(db.prepare("SELECT count FROM stat_counters WHERE type = 'logout'").get().count, 1);
    // … und die wachsende events-Tabelle ist weg.
    const ev = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'").get();
    assert.equal(ev, undefined);

    // Idempotent: erneuter Aufruf ohne events-Tabelle ändert nichts / wirft nicht.
    migrateLegacyEvents(db);
    assert.equal(db.prepare("SELECT count FROM stat_counters WHERE type = 'account_created'").get().count, 2);
  } finally {
    db.close();
  }
});
