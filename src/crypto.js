'use strict';

/*
 * Verschlüsselung sensibler Daten "at rest" (z.B. das TOTP-Secret).
 *
 * Verfahren: AES-256-GCM (authentifizierte Verschlüsselung).
 * Der 32-Byte-Schlüssel kommt ausschließlich aus der Umgebungsvariable
 * APP_ENCRYPTION_KEY (hex oder base64) und verlässt niemals den Server.
 *
 * Speicherformat (ein String):  v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // empfohlen für GCM
const VERSION = 'v1';

/**
 * Liest den 32-Byte-Schlüssel aus APP_ENCRYPTION_KEY (hex oder base64).
 * Wirft einen klaren Fehler, wenn der Schlüssel fehlt oder die falsche Länge hat.
 * @returns {Buffer}
 */
function loadKey(rawKey = process.env.APP_ENCRYPTION_KEY) {
  if (!rawKey) {
    throw new Error(
      'APP_ENCRYPTION_KEY fehlt. Bitte einen 32-Byte-Schlüssel setzen, z.B.: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  let key;
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    key = Buffer.from(rawKey, 'hex');
  } else {
    key = Buffer.from(rawKey, 'base64');
  }

  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY muss 32 Byte lang sein (hex 64 Zeichen oder base64). Aktuell: ${key.length} Byte.`
    );
  }
  return key;
}

/**
 * Verschlüsselt einen Klartext-String.
 * @param {string} plaintext
 * @param {Buffer} [key]
 * @returns {string} v1:<iv>:<tag>:<ciphertext>
 */
function encrypt(plaintext, key = loadKey()) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Entschlüsselt einen mit encrypt() erzeugten String.
 * Wirft bei manipuliertem Ciphertext (GCM-Tag stimmt nicht).
 * @param {string} payload
 * @param {Buffer} [key]
 * @returns {string} Klartext
 */
function decrypt(payload, key = loadKey()) {
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Ungültiges Ciphertext-Format.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Erzeugt einen neuen zufälligen 32-Byte-Schlüssel als Hex-String (Hilfe für Setup).
 * @returns {string}
 */
function generateKeyHex() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { encrypt, decrypt, loadKey, generateKeyHex };
