'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, makeClient, clientHash } = require('./helpers');

let srv;
before(async () => {
  srv = await startTestServer();
});
after(async () => {
  await srv.close();
});

test('Registrierung legt Account an und meldet an', async () => {
  const c = srv.client;
  const reg = await c.post('/api/register', { username: 'alice', password: clientHash('alice', 'pw-egal-123') });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.username, 'alice');
  assert.equal(reg.data.user.totpEnabled, false);

  const me = await c.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, 'alice');
});

test('leerer Benutzername/Passwort wird abgelehnt (400)', async () => {
  const c = srv.client;
  const r1 = await c.post('/api/register', { username: '', password: clientHash('', 'x') });
  assert.equal(r1.status, 400);
  const r2 = await c.post('/api/register', { username: 'bob', password: '' });
  assert.equal(r2.status, 400);
});

test('Klartext-Passwort (nicht client-gehasht) wird abgelehnt (400)', async () => {
  const c = srv.client;
  const reg = await c.post('/api/register', { username: 'plain', password: 'klartext' });
  assert.equal(reg.status, 400);
  assert.equal(reg.data.code, 'PASSWORD_NOT_HASHED');

  const login = await c.post('/api/login', { username: 'plain', password: 'klartext' });
  assert.equal(login.status, 400);
  assert.equal(login.data.code, 'PASSWORD_NOT_HASHED');
});

test('doppelter Benutzername wird abgelehnt (409)', async () => {
  const s = await startTestServer();
  try {
    const first = await s.client.post('/api/register', { username: 'carol', password: clientHash('carol', 'a') });
    assert.equal(first.status, 201);
    // zweiter Client, gleicher Name
    const second = await s.client.post('/api/register', { username: 'carol', password: clientHash('carol', 'b') });
    assert.equal(second.status, 409);
    assert.equal(second.data.code, 'USERNAME_TAKEN');
  } finally {
    await s.close();
  }
});

test('Login: falsches Passwort -> 401, richtiges -> 200', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'dave', password: clientHash('dave', 'richtig') });
    // neue Session (logout) simulieren wir durch frischen Client
    const fresh = makeClient(s.baseURL);

    const bad = await fresh.post('/api/login', { username: 'dave', password: clientHash('dave', 'falsch') });
    assert.equal(bad.status, 401);
    assert.equal(bad.data.code, 'INVALID_CREDENTIALS');

    const good = await fresh.post('/api/login', { username: 'dave', password: clientHash('dave', 'richtig') });
    assert.equal(good.status, 200);
    assert.equal(good.data.twofa, false);

    const me = await fresh.get('/api/me');
    assert.equal(me.data.user.username, 'dave');
  } finally {
    await s.close();
  }
});

test('Login eines unbekannten Nutzers -> 401', async () => {
  const r = await srv.client.post('/api/login', { username: 'gibtsnicht', password: clientHash('gibtsnicht', 'x') });
  assert.equal(r.status, 401);
});

test('Account löschen (ohne Login) entfernt User + Daten und erlaubt Neuanlage', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'frank', password: clientHash('frank', 'pw') });

    // Ein fremder, nicht eingeloggter Client darf per Benutzername löschen.
    const stranger = makeClient(s.baseURL);
    const del = await stranger.post('/api/delete-account', { username: 'frank' });
    assert.equal(del.status, 200);
    assert.equal(del.data.ok, true);

    // User ist weg -> Login schlägt fehl, Name ist wieder frei.
    const login = await stranger.post('/api/login', { username: 'frank', password: clientHash('frank', 'pw') });
    assert.equal(login.status, 401);

    const again = await stranger.post('/api/register', { username: 'frank', password: clientHash('frank', 'neu') });
    assert.equal(again.status, 201);
  } finally {
    await s.close();
  }
});

test('Account löschen ohne Benutzername -> 400', async () => {
  const s = await startTestServer();
  try {
    const empty = await s.client.post('/api/delete-account', { username: '' });
    assert.equal(empty.status, 400);
    assert.equal(empty.data.code, 'MISSING_USERNAME');

    const noField = await s.client.post('/api/delete-account', {});
    assert.equal(noField.status, 400);
    assert.equal(noField.data.code, 'MISSING_USERNAME');
  } finally {
    await s.close();
  }
});

test('Account löschen verrät nicht, ob der Benutzername existierte', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'heidi', password: clientHash('heidi', 'pw') });
    const stranger = makeClient(s.baseURL);

    const existed = await stranger.post('/api/delete-account', { username: 'heidi' });
    const neverExisted = await stranger.post('/api/delete-account', { username: 'gibtsnicht' });

    // Bewusst nicht unterscheidbar -> keine Rückschlüsse auf die Existenz.
    assert.equal(existed.status, neverExisted.status);
    assert.deepEqual(existed.data, neverExisted.data);
    assert.equal(existed.status, 200);
    assert.deepEqual(existed.data, { ok: true });

    // Der existierende Account wurde trotzdem wirklich gelöscht.
    const login = await stranger.post('/api/login', { username: 'heidi', password: clientHash('heidi', 'pw') });
    assert.equal(login.status, 401);
  } finally {
    await s.close();
  }
});

test('Eigenen Account löschen beendet die Session', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'gina', password: clientHash('gina', 'pw') });
    assert.equal((await s.client.get('/api/me')).status, 200);

    const del = await s.client.post('/api/delete-account', { username: 'gina' });
    assert.equal(del.status, 200);
    assert.equal((await s.client.get('/api/me')).status, 401);
  } finally {
    await s.close();
  }
});

test('Login erneuert die Session-ID (Schutz vor Session-Fixation)', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'sigi', password: clientHash('sigi', 'pw') });

    // Frischer Client; zuerst eine anonyme Session erzeugen (setzt authChallenge).
    const c = makeClient(s.baseURL);
    await c.post('/api/passkey/login/options', {});
    const before = c.cookie('sid');
    assert.ok(before, 'erwartete eine anonyme Session-Cookie');

    // Erfolgreicher Login muss eine NEUE Session-ID vergeben.
    const login = await c.post('/api/login', { username: 'sigi', password: clientHash('sigi', 'pw') });
    assert.equal(login.status, 200);
    const after = c.cookie('sid');
    assert.ok(after);
    assert.notEqual(after, before);
  } finally {
    await s.close();
  }
});

test('Logout beendet die Session', async () => {
  const s = await startTestServer();
  try {
    await s.client.post('/api/register', { username: 'erin', password: clientHash('erin', 'pw') });
    assert.equal((await s.client.get('/api/me')).status, 200);
    await s.client.post('/api/logout');
    assert.equal((await s.client.get('/api/me')).status, 401);
  } finally {
    await s.close();
  }
});
