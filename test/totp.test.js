'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authenticator } = require('otplib');
const { startTestServer, makeClient } = require('./helpers');

test('2FA-Flow: einrichten, aktivieren, Login mit Code', async () => {
  const s = await startTestServer();
  try {
    const c = s.client;
    await c.post('/api/register', { username: 'tina', password: 'geheim' });

    // Setup
    const setup = await c.post('/api/2fa/setup');
    assert.equal(setup.status, 200);
    assert.ok(setup.data.secret, 'Secret erwartet');
    assert.match(setup.data.qrDataUrl, /^data:image\/png;base64,/);
    assert.match(setup.data.otpauthUrl, /^otpauth:\/\/totp\//);

    // Falscher Code -> 400
    const wrong = await c.post('/api/2fa/verify', { token: '000000' });
    assert.equal(wrong.status, 400);

    // Richtiger Code -> aktiviert
    const token = authenticator.generate(setup.data.secret);
    const verify = await c.post('/api/2fa/verify', { token });
    assert.equal(verify.status, 200);

    const me = await c.get('/api/me');
    assert.equal(me.data.user.totpEnabled, true);

    // Neuer Login verlangt jetzt 2FA
    const fresh = makeClient(s.baseURL);
    const login = await fresh.post('/api/login', { username: 'tina', password: 'geheim' });
    assert.equal(login.status, 200);
    assert.equal(login.data.twofa, true);

    // Vor TOTP noch nicht eingeloggt
    assert.equal((await fresh.get('/api/me')).status, 401);

    // TOTP-Schritt
    const token2 = authenticator.generate(setup.data.secret);
    const step2 = await fresh.post('/api/login/totp', { token: token2 });
    assert.equal(step2.status, 200);
    assert.equal((await fresh.get('/api/me')).data.user.username, 'tina');
  } finally {
    await s.close();
  }
});

test('2FA deaktivieren entfernt die Anforderung', async () => {
  const s = await startTestServer();
  try {
    const c = s.client;
    await c.post('/api/register', { username: 'uwe', password: 'pw' });
    const setup = await c.post('/api/2fa/setup');
    await c.post('/api/2fa/verify', { token: authenticator.generate(setup.data.secret) });
    await c.post('/api/2fa/disable');

    const fresh = makeClient(s.baseURL);
    const login = await fresh.post('/api/login', { username: 'uwe', password: 'pw' });
    assert.equal(login.data.twofa, false);
  } finally {
    await s.close();
  }
});

test('Passkey-Login-Optionen liefern eine Challenge', async () => {
  const s = await startTestServer();
  try {
    const r = await s.client.post('/api/passkey/login/options', {});
    assert.equal(r.status, 200);
    assert.ok(r.data.challenge, 'Challenge erwartet');
    assert.equal(r.data.rpId, 'localhost');
  } finally {
    await s.close();
  }
});

test('2FA-Setup ohne Login -> 401', async () => {
  const s = await startTestServer();
  try {
    const fresh = makeClient(s.baseURL);
    const r = await fresh.post('/api/2fa/setup');
    assert.equal(r.status, 401);
  } finally {
    await s.close();
  }
});
