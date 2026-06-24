'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_ENCRYPTION_KEY = 'b'.repeat(64);
const { encrypt, decrypt, loadKey, generateKeyHex } = require('../src/crypto');

test('encrypt/decrypt: Round-Trip', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const enc = encrypt(secret);
  assert.notEqual(enc, secret, 'Ciphertext darf nicht dem Klartext entsprechen');
  assert.match(enc, /^v1:/, 'Format-Prefix erwartet');
  assert.equal(decrypt(enc), secret);
});

test('encrypt: zwei Aufrufe ergeben unterschiedliche Ciphertexts (zufällige IV)', () => {
  const a = encrypt('gleicher-text');
  const b = encrypt('gleicher-text');
  assert.notEqual(a, b);
  assert.equal(decrypt(a), decrypt(b));
});

test('decrypt: manipulierter Ciphertext wird durch GCM-Tag erkannt', () => {
  const enc = encrypt('streng-geheim');
  const parts = enc.split(':');
  // letztes Zeichen des Ciphertext-Teils kippen
  const tampered = parts.slice(0, 3).concat(parts[3].slice(0, -2) + (parts[3].slice(-2) === 'AA' ? 'BB' : 'AA')).join(':');
  assert.throws(() => decrypt(tampered));
});

test('loadKey: falsche Schlüssellänge wirft', () => {
  assert.throws(() => loadKey('zu-kurz'));
});

test('generateKeyHex: liefert 64 Hex-Zeichen', () => {
  assert.match(generateKeyHex(), /^[0-9a-f]{64}$/);
});
