'use strict';

/*
 * Hell/Dunkel-Umschalter – analog zur Sprachwahl (i18n.js).
 *
 * - Auswahl wird in localStorage ('pm_theme') gehalten ('light' | 'dark').
 * - Ohne gespeicherte Wahl folgt das Design der System-Einstellung
 *   (prefers-color-scheme) und reagiert live auf deren Wechsel.
 * - Das Theme wird per data-theme="dark" am <html> gesetzt; die eigentlichen
 *   Farben liegen als CSS-Variablen in styles.css.
 * - Dieses Skript wird bewusst im <head> (blockierend) geladen, damit das
 *   data-theme-Attribut vor dem ersten Paint steht – sonst blitzt kurz das
 *   helle Design auf. Externe Datei statt Inline-Script wegen der strikten CSP.
 * - Umschalter: Buttons mit data-theme-set="light|dark" (Event-Delegation,
 *   funktioniert auch für erst später geparste Buttons).
 */

(function () {
  const STORAGE_KEY = 'pm_theme';
  const SUPPORTED = ['light', 'dark'];
  const root = document.documentElement;
  const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.includes(v)) return v;
    } catch (_) {
      /* localStorage evtl. nicht verfügbar */
    }
    return null;
  }

  function systemPref() {
    return mql && mql.matches ? 'dark' : 'light';
  }

  let current = saved() || systemPref();

  // Setzt das Attribut (sofort, schon im <head>) und – sobald vorhanden – den
  // aktiven Zustand der Umschalt-Buttons.
  function apply() {
    root.setAttribute('data-theme', current);
    document.querySelectorAll('[data-theme-set]').forEach((b) => {
      const on = b.getAttribute('data-theme-set') === current;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function setTheme(theme) {
    if (!SUPPORTED.includes(theme)) return;
    current = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
      /* ignore */
    }
    apply();
  }

  // Frühest möglich anwenden (Body ist hier evtl. noch nicht geparst – dann
  // werden nur die Button-Zustände später nachgezogen).
  apply();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-set]');
    if (btn) {
      e.preventDefault();
      setTheme(btn.getAttribute('data-theme-set'));
    }
  });

  // Button-Zustände setzen, sobald das DOM steht.
  document.addEventListener('DOMContentLoaded', apply);

  // Systemwechsel nur folgen, solange der Nutzer nicht selbst gewählt hat.
  if (mql) {
    const onSystemChange = (e) => {
      if (!saved()) {
        current = e.matches ? 'dark' : 'light';
        apply();
      }
    };
    if (mql.addEventListener) mql.addEventListener('change', onSystemChange);
    else if (mql.addListener) mql.addListener(onSystemChange);
  }

  window.Theme = { set: setTheme, get: () => current };
})();
