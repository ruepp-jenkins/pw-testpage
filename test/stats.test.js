'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, makeClient, clientHash } = require('./helpers');
const { runCleanupOnce } = require('../src/cleanup');

test('Stats: leere Statistik liefert nur aggregierte Zahlen, keine Namen', async () => {
  const s = await startTestServer();
  try {
    const { status, data } = await s.client.get('/api/usage');
    assert.equal(status, 200);
    assert.ok(data.live && data.totals && data.last24h);
    assert.equal(data.live.activeAccounts, 0);
    // Antwort enthält nur Zahlen/Objekte – keinerlei Strings mit PII.
    const json = JSON.stringify(data);
    assert.ok(!/username|password|secret/i.test(json));
  } finally {
    await s.close();
  }
});

test('Stats: Registrierung zählt account_created + Live-Accounts', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'alice', password: clientHash('alice', 'pw') });
    await makeClient(s.baseURL).post('/api/register', { username: 'bob', password: clientHash('bob', 'pw') });

    const { data } = await s.client.get('/api/usage');
    assert.equal(data.totals.account_created, 2);
    assert.equal(data.last24h.account_created, 2);
    assert.equal(data.live.activeAccounts, 2);
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

test('Stats: manuelles Löschen zählt account_deleted und senkt Live-Accounts', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'erin', password: clientHash('erin', 'pw') });
    await makeClient(s.baseURL).post('/api/delete-account', { username: 'erin' });
    // Löschen eines nicht existierenden Namens darf NICHT zählen.
    await makeClient(s.baseURL).post('/api/delete-account', { username: 'gibtsnicht' });

    const { data } = await s.client.get('/api/usage');
    assert.equal(data.totals.account_deleted, 1);
    assert.equal(data.live.activeAccounts, 0);
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
    assert.equal(data.live.activeAccounts, 0);
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
