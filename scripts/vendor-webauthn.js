'use strict';

/*
 * Kopiert den fertigen UMD-Browser-Build von @simplewebauthn/browser nach
 * public/vendor/. Dadurch braucht das Frontend keinen Build-Schritt und lädt
 * nichts von einem CDN (offline-/localhost-tauglich, keine externen Requests).
 *
 * Läuft als postinstall. Ist die Quelle nicht vorhanden (z.B. Prod-Install ohne
 * das Paket), aber die gevendorte Datei existiert bereits, wird still übersprungen.
 */

const fs = require('fs');
const path = require('path');

const DEST_DIR = path.join(__dirname, '..', 'public', 'vendor');
const DEST_FILE = path.join(DEST_DIR, 'simplewebauthn-browser.umd.min.js');

// Der "exports"-Block des Pakets verbietet tiefe require.resolve-Pfade, daher
// ermitteln wir das Paket-Wurzelverzeichnis und bauen den Pfad selbst.
function packageRoot() {
  try {
    const entry = require.resolve('@simplewebauthn/browser');
    const marker = path.join('@simplewebauthn', 'browser');
    const idx = entry.lastIndexOf(marker);
    if (idx !== -1) return entry.slice(0, idx + marker.length);
  } catch (_) {
    /* Paket nicht installiert */
  }
  return null;
}

function resolveSource() {
  const root = packageRoot();
  if (!root) return null;
  const candidates = [
    path.join(root, 'dist', 'bundle', 'index.umd.min.js'),
    path.join(root, 'dist', 'bundle', 'index.es5.umd.min.js'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function main() {
  const src = resolveSource();

  if (!src) {
    if (fs.existsSync(DEST_FILE)) {
      console.log('[vendor-webauthn] Quelle fehlt, vorhandene Vendor-Datei wird beibehalten.');
      return;
    }
    console.warn(
      '[vendor-webauthn] WARNUNG: @simplewebauthn/browser nicht gefunden und keine ' +
        'Vendor-Datei vorhanden. Passkey-UI funktioniert evtl. nicht.'
    );
    return;
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.copyFileSync(src, DEST_FILE);
  console.log('[vendor-webauthn] kopiert ->', path.relative(process.cwd(), DEST_FILE));
}

main();
