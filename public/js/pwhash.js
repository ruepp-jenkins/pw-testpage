'use strict';

/*
 * Client-seitiges Passwort-Hashing – erste Stufe des "Double-Hash".
 *
 * Das KLARTEXT-Passwort verlässt damit nie den Browser: gesendet wird nur ein
 * PBKDF2-Hash. Der Server hasht diesen Wert anschließend ein zweites Mal mit
 * argon2 (siehe src/routes/auth.js). Der Server – und damit auch Logs, DB oder
 * der Betreiber – bekommt das eigentliche Passwort nie zu sehen.
 *
 * Designentscheidungen:
 * - Web Crypto (crypto.subtle): in jedem Browser vorhanden, KEINE externe
 *   Abhängigkeit und CSP-konform (kein zusätzliches Skript/WASM nötig).
 *   Verfügbar nur in "secure contexts": http://localhost gilt als sicher, in
 *   Produktion ist ohnehin HTTPS erforderlich (siehe CLAUDE.md).
 * - Der Salt wird DETERMINISTISCH aus dem Benutzernamen abgeleitet, damit
 *   dasselbe Passwort bei Registrierung und Login denselben Hash ergibt – ohne
 *   den Salt erst vom Server holen zu müssen. Das vermeidet eine zusätzliche
 *   Anfrage und – wichtiger – User-Enumeration (ein per-User-Salt vom Server
 *   würde verraten, ob es den Namen gibt). Die "echte" Absicherung der
 *   gespeicherten Daten leistet der zufällige argon2-Salt auf dem Server.
 *
 * Das Wire-Format (auch serverseitig geprüft) lautet: pbkdf2$<iter>$<hex>.
 * WICHTIG: Parameter müssen mit test/helpers.js (Node-PBKDF2) übereinstimmen.
 */

(function () {
  const ITERATIONS = 210000;
  const KEYLEN_BITS = 256; // 32 Byte -> 64 Hex-Zeichen
  const CONTEXT = 'pm-practice|pw|v1|'; // Domänen-Trennung des Salts
  const enc = new TextEncoder();

  function toHex(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  function supported() {
    return !!(window.crypto && window.crypto.subtle && window.isSecureContext !== false);
  }

  async function hashPassword(username, password) {
    if (!supported()) {
      // Bewusst abbrechen statt im Zweifel Klartext zu senden.
      const err = new Error('Secure context with Web Crypto required.');
      err.code = 'SECURE_CONTEXT_REQUIRED';
      throw err;
    }
    const salt = enc.encode(CONTEXT + String(username == null ? '' : username).trim());
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(String(password == null ? '' : password)),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      KEYLEN_BITS
    );
    return 'pbkdf2$' + ITERATIONS + '$' + toHex(bits);
  }

  window.PwHash = { hashPassword, supported };
})();
