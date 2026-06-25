'use strict';

/*
 * Test-Hilfen: setzt benötigte Env-Variablen, startet die App auf einem
 * Ephemeral-Port mit In-Memory-DB und liefert einen cookie-fähigen HTTP-Client.
 */

// Muss vor dem Laden der Module gesetzt sein, die crypto.loadKey() nutzen.
process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY || 'a'.repeat(64); // 32 Byte als Hex
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.NODE_ENV = 'test';

const crypto = require('node:crypto');

const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

// Spiegelt das client-seitige Passwort-Hashing aus public/js/pwhash.js, damit
// Tests dasselbe Wire-Format (pbkdf2$<iter>$<hex>) senden wie ein echter Browser.
// Parameter MÜSSEN mit pwhash.js übereinstimmen.
const PW_ITERATIONS = 210000;
const PW_KEYLEN = 32; // 256 bit
const PW_CONTEXT = 'pm-practice|pw|v1|';

function clientHash(username, password) {
  const salt = PW_CONTEXT + String(username == null ? '' : username).trim();
  const hex = crypto
    .pbkdf2Sync(String(password == null ? '' : password), salt, PW_ITERATIONS, PW_KEYLEN, 'sha256')
    .toString('hex');
  return 'pbkdf2$' + PW_ITERATIONS + '$' + hex;
}

async function startTestServer() {
  const db = openDb(':memory:');
  const config = loadConfig();
  const app = createApp(db, config);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const baseURL = `http://127.0.0.1:${port}`;

  return {
    db,
    server,
    baseURL,
    client: makeClient(baseURL),
    close: () =>
      new Promise((resolve) => server.close(() => {
        db.close();
        resolve();
      })),
  };
}

/** Minimaler cookie-haltender Fetch-Client (eine "Session" pro Client). */
function makeClient(baseURL) {
  const cookies = new Map();

  function storeCookies(res) {
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookies) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx > -1) cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  function cookieHeader() {
    return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async function request(method, path, body) {
    const headers = {};
    if (cookies.size) headers.Cookie = cookieHeader();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(baseURL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    storeCookies(res);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* keine JSON-Antwort */
    }
    return { status: res.status, data };
  }

  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    del: (p) => request('DELETE', p),
  };
}

module.exports = { startTestServer, makeClient, clientHash };
