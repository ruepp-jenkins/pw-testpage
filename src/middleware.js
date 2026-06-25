'use strict';

/* Gemeinsame Hilfen für Routen: Auth-Guard und das Säubern von User-Objekten. */

/** Express-Middleware: blockt, wenn keine eingeloggte Session vorhanden ist. */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Nicht angemeldet.', code: 'NOT_AUTHENTICATED' });
  }
  next();
}

/**
 * Macht die Session authentifiziert und erneuert dabei die Session-ID
 * (Schutz gegen Session-Fixation): bei jeder Anmeldung wird eine frische ID
 * vergeben, eine evtl. vorher untergeschobene ID wird ungültig. Speichert die
 * Session, bevor weitergemacht wird, damit der Cookie sicher gesetzt ist.
 * @returns {Promise<void>}
 */
function establishSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

/** Reduziert ein DB-User-Objekt auf für das Frontend unbedenkliche Felder. */
function publicUser(db, user) {
  const passkeyCount = db
    .prepare('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?')
    .get(user.id).n;
  return {
    id: user.id,
    username: user.username,
    totpEnabled: !!user.totp_enabled,
    passkeyCount,
    createdAt: user.created_at,
  };
}

module.exports = { requireAuth, publicUser, establishSession };
