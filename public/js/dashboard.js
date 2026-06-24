'use strict';

/*
 * Dashboard-Logik: 2FA einrichten/aktivieren/deaktivieren und Passkeys
 * verwalten. Spricht ausschließlich die API an, hält keine Secrets.
 * Texte/Fehlermeldungen werden über window.I18n lokalisiert; dynamische
 * Inhalte werden bei Sprachwechsel neu gerendert.
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const webauthn = window.SimpleWebAuthnBrowser;
  const L = (key) => (window.I18n ? window.I18n.t(key) : key);
  const alertBox = $('alert');

  // Letzter bekannter Zustand – für Re-Render bei Sprachwechsel.
  const state = { user: null, passkeys: [], deletesAt: null };

  function showAlert(message, type = 'error') {
    alertBox.textContent = message;
    alertBox.className = 'alert show alert-' + type;
    if (type === 'success') setTimeout(() => (alertBox.className = 'alert'), 3500);
  }
  function clearAlert() {
    alertBox.className = 'alert';
  }

  function errMsg(err) {
    if (err && err.code && window.I18n && window.I18n.has('errors.' + err.code)) {
      return L('errors.' + err.code);
    }
    return (err && err.message) || L('errors.GENERIC');
  }

  async function api(path, { method = 'POST', body } = {}) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 401 && path !== '/api/logout') {
      window.location.href = '/';
      throw new Error('not authenticated');
    }
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* leer */
    }
    if (!res.ok) {
      const err = new Error(data.error || L('errors.GENERIC'));
      err.code = data.code;
      throw err;
    }
    return data;
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = '<span class="spin"></span> …';
    } else if (btn.dataset.label !== undefined) {
      btn.innerHTML = btn.dataset.label;
    }
  }

  function dateLocale() {
    return window.I18n && window.I18n.getLang() === 'de' ? 'de-DE' : 'en-GB';
  }

  // ---------- Zustand rendern ----------
  function updateTwofaBadge(enabled) {
    const badge = $('twofa-badge');
    badge.textContent = enabled ? L('dashboard.badgeActive') : L('dashboard.badgeInactive');
    badge.className = 'badge ' + (enabled ? 'badge-on' : 'badge-off');
  }

  function renderTwofa(enabled) {
    updateTwofaBadge(enabled);
    $('twofa-setup-start').classList.toggle('hidden', enabled);
    $('twofa-active').classList.toggle('hidden', !enabled);
    $('twofa-setup-confirm').classList.add('hidden');
  }

  function renderPasskeys(list) {
    const ul = $('passkey-list');
    ul.innerHTML = '';
    $('passkey-count-badge').textContent = String(list.length);
    $('passkey-empty').classList.toggle('hidden', list.length > 0);
    list.forEach((pk) => {
      const li = document.createElement('li');
      li.className = 'list-item';
      const date = new Date(pk.createdAt).toLocaleString(dateLocale());
      const name = pk.nickname || L('dashboard.passkeyDefaultName');
      const left = document.createElement('div');
      left.innerHTML = `<div>🔑 ${escapeHtml(name)}</div><div class="meta">${L('dashboard.addedOn')} ${date}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger btn-inline';
      btn.type = 'button';
      btn.textContent = L('dashboard.remove');
      btn.addEventListener('click', () => removePasskey(pk.id, btn));
      li.append(left, btn);
      ul.appendChild(li);
    });
  }

  // Dezenter Hinweis, wann der Übungs-Account automatisch entfernt wird.
  function renderDeletionNotice(deletesAt) {
    const el = $('deletion-notice');
    if (!deletesAt) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    const date = new Date(deletesAt).toLocaleString(dateLocale());
    el.textContent = L('dashboard.deletionNotice').replace('{date}', date);
    el.hidden = false;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ---------- Laden ----------
  async function load() {
    const { user, deletesAt } = await api('/api/me', { method: 'GET' });
    state.user = user;
    state.deletesAt = deletesAt;
    $('username').textContent = user.username;
    renderTwofa(user.totpEnabled);
    renderDeletionNotice(deletesAt);
    const { passkeys } = await api('/api/passkey', { method: 'GET' });
    state.passkeys = passkeys;
    renderPasskeys(passkeys);
  }

  // Bei Sprachwechsel dynamische Teile neu rendern (statische Texte erledigt I18n).
  if (window.I18n) {
    window.I18n.onChange(() => {
      if (state.user) updateTwofaBadge(state.user.totpEnabled);
      renderPasskeys(state.passkeys);
      renderDeletionNotice(state.deletesAt);
    });
  }

  // ---------- 2FA ----------
  $('btn-2fa-start').addEventListener('click', async () => {
    clearAlert();
    const btn = $('btn-2fa-start');
    setLoading(btn, true);
    try {
      const data = await api('/api/2fa/setup');
      $('twofa-qr').src = data.qrDataUrl;
      $('twofa-secret').textContent = data.secret;
      $('twofa-setup-start').classList.add('hidden');
      $('twofa-setup-confirm').classList.remove('hidden');
      $('twofa-code').focus();
    } catch (err) {
      showAlert(errMsg(err));
    } finally {
      setLoading(btn, false);
    }
  });

  $('btn-2fa-cancel').addEventListener('click', () => {
    $('twofa-setup-confirm').classList.add('hidden');
    $('twofa-setup-start').classList.remove('hidden');
    clearAlert();
  });

  $('form-2fa-verify').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    try {
      await api('/api/2fa/verify', { body: { token: $('twofa-code').value } });
      if (state.user) state.user.totpEnabled = true;
      renderTwofa(true);
      showAlert(L('dashboard.twofaActivated'), 'success');
    } catch (err) {
      showAlert(errMsg(err));
    }
  });

  $('btn-2fa-disable').addEventListener('click', async () => {
    clearAlert();
    if (!confirm(L('dashboard.confirmDisable'))) return;
    try {
      await api('/api/2fa/disable');
      if (state.user) state.user.totpEnabled = false;
      renderTwofa(false);
      showAlert(L('dashboard.twofaDeactivated'), 'success');
    } catch (err) {
      showAlert(errMsg(err));
    }
  });

  // ---------- Passkeys ----------
  $('form-passkey-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    if (!webauthn || !webauthn.browserSupportsWebAuthn || !webauthn.browserSupportsWebAuthn()) {
      showAlert(L('dashboard.passkeyUnsupported'));
      return;
    }
    const btn = $('btn-passkey-add');
    setLoading(btn, true);
    try {
      const options = await api('/api/passkey/register/options');
      const attResp = await webauthn.startRegistration({ optionsJSON: options });
      await api('/api/passkey/register/verify', {
        body: { response: attResp, nickname: $('passkey-nickname').value },
      });
      $('passkey-nickname').value = '';
      const { passkeys } = await api('/api/passkey', { method: 'GET' });
      state.passkeys = passkeys;
      renderPasskeys(passkeys);
      showAlert(L('dashboard.passkeySaved'), 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        showAlert(L('dashboard.passkeyCancelled'), 'info');
      } else {
        showAlert(errMsg(err));
      }
    } finally {
      setLoading(btn, false);
    }
  });

  async function removePasskey(id, btn) {
    clearAlert();
    if (!confirm(L('dashboard.confirmRemovePasskey'))) return;
    setLoading(btn, true);
    try {
      await api('/api/passkey/' + id, { method: 'DELETE' });
      const { passkeys } = await api('/api/passkey', { method: 'GET' });
      state.passkeys = passkeys;
      renderPasskeys(passkeys);
    } catch (err) {
      showAlert(errMsg(err));
      setLoading(btn, false);
    }
  }

  // ---------- Logout ----------
  $('logout').addEventListener('click', async () => {
    try {
      await api('/api/logout');
    } catch (_) {
      /* egal */
    }
    window.location.href = '/';
  });

  // ---------- Start ----------
  load().catch((err) => showAlert(errMsg(err)));
})();
