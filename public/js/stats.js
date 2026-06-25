'use strict';

/*
 * Statistik-Seite: holt die anonymen Aggregat-Zahlen von /api/usage und füllt
 * die Kacheln. Enthält KEINE Secrets und zeigt ausschließlich Summen an.
 * Bei Sprachwechsel werden Zahlen/Datum im passenden Format neu gerendert.
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const L = (key) => (window.I18n ? window.I18n.t(key) : key);
  const alertBox = $('alert');

  // Ereignis-Schlüssel = Element-IDs (#stat-<key> für die Summe, #sub-<key> für 24 h).
  const EVENT_KEYS = [
    'account_created', 'account_deleted', 'account_pruned', 'logout',
    'login_password', 'login_2fa', 'login_passkey',
    'login_failed_password', 'login_failed_2fa', 'login_failed_passkey',
    'twofa_enabled', 'twofa_disabled', 'passkey_added', 'passkey_removed',
  ];

  // Zuletzt geladene Rohdaten – für Re-Render bei Sprachwechsel.
  let last = null;

  function locale() {
    return window.I18n && window.I18n.getLang() === 'de' ? 'de-DE' : 'en-GB';
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString(locale());
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function showAlert(message) {
    alertBox.textContent = message;
    alertBox.className = 'alert show alert-error';
  }
  function clearAlert() {
    alertBox.className = 'alert';
  }

  function render(data) {
    const totals = data.totals || {};
    const last24h = data.last24h || {};
    const live = data.live || {};

    setText('stat-live-activeAccounts', fmt(live.activeAccounts));
    setText('stat-live-accountsWithTotp', fmt(live.accountsWithTotp));
    setText('stat-live-totalPasskeys', fmt(live.totalPasskeys));

    EVENT_KEYS.forEach((key) => {
      setText('stat-' + key, fmt(totals[key]));
      setText('sub-' + key, fmt(last24h[key]));
    });

    // Login-Erfolgsquote (über alle Methoden, gesamte Laufzeit).
    const ok = (totals.login_password || 0) + (totals.login_2fa || 0) + (totals.login_passkey || 0);
    const fail =
      (totals.login_failed_password || 0) +
      (totals.login_failed_2fa || 0) +
      (totals.login_failed_passkey || 0);
    const attempts = ok + fail;
    setText('stat-successRate', attempts === 0 ? '–' : Math.round((ok / attempts) * 100) + ' %');

    const when = new Date(data.generatedAt || Date.now()).toLocaleString(locale());
    setText('generated-at', when);
  }

  async function load() {
    clearAlert();
    const btn = $('btn-refresh');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch('/api/usage', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      last = await res.json();
      render(last);
    } catch (_) {
      showAlert(L('stats.loadError'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  const refreshBtn = $('btn-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', load);

  // Bei Sprachwechsel Zahlen/Datum im neuen Format neu rendern.
  if (window.I18n) {
    window.I18n.onChange(() => {
      if (last) render(last);
    });
  }

  load();
})();
