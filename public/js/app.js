'use strict';

/*
 * Frontend-Logik der Startseite: Tabs, Registrierung, Login, optionaler 2FA-Schritt
 * und passwortloser Passkey-Login. Enthält KEINE Secrets – spricht nur die API an.
 * Texte/Fehlermeldungen werden über window.I18n lokalisiert.
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const webauthn = window.SimpleWebAuthnBrowser;
  const L = (key) => (window.I18n ? window.I18n.t(key) : key);

  const alertBox = $('alert');
  const forms = {
    login: $('form-login'),
    register: $('form-register'),
    totp: $('form-totp'),
  };

  function showAlert(message, type = 'error') {
    alertBox.textContent = message;
    alertBox.className = 'alert show alert-' + type;
  }
  function clearAlert() {
    alertBox.className = 'alert';
  }

  // Lokalisiert einen API-Fehler bevorzugt über seinen Code.
  function errMsg(err) {
    if (err && err.code && window.I18n && window.I18n.has('errors.' + err.code)) {
      return L('errors.' + err.code);
    }
    return (err && err.message) || L('errors.GENERIC');
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* leere Antwort */
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
      btn.innerHTML = '<span class="spin"></span> ' + L('common.waiting');
    } else if (btn.dataset.label !== undefined) {
      btn.innerHTML = btn.dataset.label;
    }
  }

  function goDashboard() {
    window.location.href = '/dashboard';
  }

  // ---------- Tabs ----------
  function selectTab(which) {
    clearAlert();
    $('tab-login').classList.toggle('active', which === 'login');
    $('tab-register').classList.toggle('active', which === 'register');
    forms.login.classList.toggle('hidden', which !== 'login');
    forms.register.classList.toggle('hidden', which !== 'register');
    forms.totp.classList.add('hidden');
  }
  $('tab-login').addEventListener('click', () => selectTab('login'));
  $('tab-register').addEventListener('click', () => selectTab('register'));

  // ---------- Registrierung ----------
  forms.register.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    const btn = $('reg-submit');
    setLoading(btn, true);
    try {
      await api('/api/register', {
        username: $('reg-username').value,
        password: $('reg-password').value,
      });
      goDashboard();
    } catch (err) {
      showAlert(errMsg(err));
      setLoading(btn, false);
    }
  });

  // ---------- Login ----------
  forms.login.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    const btn = $('login-submit');
    setLoading(btn, true);
    try {
      const data = await api('/api/login', {
        username: $('login-username').value,
        password: $('login-password').value,
      });
      if (data.twofa) {
        // 2FA verlangt: Login-Form aus, TOTP-Form an.
        forms.login.classList.add('hidden');
        forms.totp.classList.remove('hidden');
        $('totp-code').focus();
        showAlert(L('index.twofaPrompt'), 'info');
      } else {
        goDashboard();
      }
    } catch (err) {
      showAlert(errMsg(err));
    } finally {
      setLoading(btn, false);
    }
  });

  // ---------- 2FA-Schritt ----------
  forms.totp.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    try {
      await api('/api/login/totp', { token: $('totp-code').value });
      goDashboard();
    } catch (err) {
      showAlert(errMsg(err));
    }
  });
  $('totp-cancel').addEventListener('click', () => {
    forms.totp.classList.add('hidden');
    forms.login.classList.remove('hidden');
    clearAlert();
  });

  // ---------- Passkey-Login (passwortlos) ----------
  // ---------- Test-Account löschen (ohne Login) ----------
  $('form-delete').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    const username = $('delete-username').value.trim();
    if (!username) return;
    if (!window.confirm(L('index.deleteConfirm').replace('{name}', username))) return;

    const btn = $('delete-submit');
    setLoading(btn, true);
    try {
      await api('/api/delete-account', { username });
      // Direkt zur Registrierung wechseln und Namen vorbelegen – Neuanlage leicht gemacht.
      selectTab('register');
      $('delete-account').open = false;
      $('reg-username').value = username;
      $('reg-password').value = '';
      $('delete-username').value = '';
      $('reg-password').focus();
      showAlert(L('index.deleteDone').replace('{name}', username), 'info');
    } catch (err) {
      showAlert(errMsg(err));
    } finally {
      setLoading(btn, false);
    }
  });

  $('passkey-login').addEventListener('click', async () => {
    clearAlert();
    if (!webauthn || !webauthn.browserSupportsWebAuthn || !webauthn.browserSupportsWebAuthn()) {
      showAlert(L('index.passkeyUnsupported'));
      return;
    }
    const btn = $('passkey-login');
    setLoading(btn, true);
    try {
      // Optional Benutzername vom Login-Feld nutzen (sonst discoverable).
      const username = $('login-username').value.trim();
      const options = await api('/api/passkey/login/options', username ? { username } : {});
      const assertion = await webauthn.startAuthentication({ optionsJSON: options });
      await api('/api/passkey/login/verify', { response: assertion });
      goDashboard();
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        showAlert(L('index.passkeyCancelled'), 'info');
      } else {
        showAlert(errMsg(err));
      }
      setLoading(btn, false);
    }
  });
})();
