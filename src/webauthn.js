'use strict';

/*
 * Dünne Hülle um @simplewebauthn/server. Bündelt die RP-Konfiguration
 * (Relying Party) und Hilfen für die base64url-Kodierung von Schlüsseln.
 *
 * Für localhost gilt: rpID = "localhost", origin = "http://localhost:3000".
 * Browser behandeln localhost als sicheren Kontext, daher funktioniert WebAuthn
 * dort auch ohne HTTPS.
 */

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

function toBase64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromBase64url(str) {
  return new Uint8Array(Buffer.from(str, 'base64url'));
}

module.exports = {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  toBase64url,
  fromBase64url,
};
