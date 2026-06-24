'use strict';

/*
 * Minimalistische i18n ohne Build-Schritt.
 *
 * - Sprache wird zuerst aus localStorage ('pm_lang') gelesen (manuelle Wahl),
 *   sonst aus der Browsersprache abgeleitet (Deutsch -> 'de', sonst 'en').
 * - Texte werden über data-Attribute gesetzt:
 *     data-i18n="key"       -> textContent
 *     data-i18n-html="key"  -> innerHTML (für Texte mit <strong>, <a> …)
 *     data-i18n-ph="key"    -> placeholder
 *   Der Seitentitel kommt aus data-i18n-title am <html>-Element.
 * - Sprachumschalter: beliebige Buttons mit data-lang="de|en".
 * - window.I18n stellt t(), has(), setLang(), getLang(), apply(), onChange() bereit.
 */

(function () {
  const DICT = {
    de: {
      meta: {
        titleIndex: 'Passwortmanager Übungs-Demo',
        titleDashboard: 'Dashboard · Passwortmanager Übungs-Demo',
        titleGuide: 'Anleitung · Passwortmanager Übungs-Demo',
      },
      nav: {
        brand: 'Passwortmanager-Übung',
        guide: 'Anleitung',
        demo: 'Zur Demo',
        logout: 'Abmelden',
      },
      common: { waiting: 'Bitte warten …', or: 'oder', cancel: 'Abbrechen' },
      theme: { switchLabel: 'Design wählen', light: 'Helles Design', dark: 'Dunkles Design' },
      index: {
        badge: 'Demo · rein zum Üben',
        h1: 'Übe sicher mit deinem Passwortmanager',
        p: 'Lege einen Test-Account an, speichere ihn in deinem Passwortmanager und probiere Login, 2FA und Passkeys aus. Keine E-Mail, keine echten Daten nötig.',
        tabLogin: 'Anmelden',
        tabRegister: 'Registrieren',
        username: 'Benutzername',
        password: 'Passwort',
        loginSubmit: 'Anmelden',
        loginHint: 'Tipp: Lass deinen Passwortmanager Benutzername & Passwort speichern und ausfüllen.',
        totpLabel: '2FA-Code aus deiner Authenticator-App',
        totpSubmit: 'Code bestätigen',
        regSubmit: 'Account anlegen',
        regHint: 'Diese Übungsseite stellt keine Anforderungen an Benutzername oder Passwort.',
        passkeyLogin: '🔑 Mit Passkey anmelden',
        footer: 'Lerne mehr in der <a href="/guide">Schritt-für-Schritt-Anleitung</a>.',
        twofaPrompt: 'Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.',
        passkeyCancelled: 'Passkey-Anmeldung abgebrochen.',
        passkeyUnsupported: 'Dein Browser unterstützt keine Passkeys.',
        deleteSummary: 'Test-Account löschen',
        deleteHint: 'Gib einen Benutzernamen ein, um diesen Test-Account und alle zugehörigen Daten (2FA, Passkeys) sofort und unwiderruflich zu löschen – praktisch, um ihn neu anzulegen.',
        deleteSubmit: 'Account löschen',
        deleteConfirm: 'Test-Account „{name}" wirklich endgültig löschen?',
        deleteDone: 'Falls der Test-Account „{name}" existierte, wurde er gelöscht. Du kannst ihn jetzt neu anlegen.',
      },
      dashboard: {
        hello: 'Hallo,',
        accountBadge: 'Test-Account',
        intro: 'Hier kannst du <strong>2FA</strong> und <strong>Passkeys</strong> einrichten und mit deinem Passwortmanager üben. Melde dich danach ab und wieder an, um den Ablauf zu testen.',
        twofaTitle: '2FA · Google Authenticator',
        twofaSub: 'Zeitbasierte Einmal-Codes (TOTP) als zweiter Faktor.',
        badgeActive: 'aktiv',
        badgeInactive: 'inaktiv',
        twofaStart: '2FA einrichten',
        qrAlt: 'QR-Code für die Authenticator-App',
        twofaScan: 'QR scannen oder Schlüssel manuell eingeben:',
        twofaCodeLabel: 'Code aus der App',
        twofaActivate: 'Aktivieren',
        twofaActiveInfo: '2FA ist aktiv. Beim nächsten Login wird ein Code abgefragt.',
        twofaDisable: '2FA deaktivieren',
        passkeysTitle: 'Passkeys',
        passkeysSub: 'Passwortlose Anmeldung per Gerät, Fingerabdruck oder Sicherheits-Key.',
        passkeysEmpty: 'Noch keine Passkeys hinterlegt.',
        passkeyName: 'Name (optional)',
        passkeyNamePh: 'z.B. Mein Laptop',
        passkeyAdd: '🔑 Passkey hinzufügen',
        footer: 'Brauchst du Hilfe? Schau in die <a href="/guide">Anleitung</a>.',
        deletionNotice: 'Hinweis: Dieser Test-Account wird am {date} automatisch gelöscht.',
        remove: 'Entfernen',
        addedOn: 'hinzugefügt am',
        passkeyDefaultName: 'Passkey',
        twofaActivated: '2FA wurde aktiviert.',
        twofaDeactivated: '2FA wurde deaktiviert.',
        confirmDisable: '2FA wirklich deaktivieren?',
        passkeySaved: 'Passkey gespeichert.',
        passkeyCancelled: 'Passkey-Registrierung abgebrochen.',
        passkeySaveFailed: 'Passkey konnte nicht gespeichert werden.',
        confirmRemovePasskey: 'Diesen Passkey entfernen?',
        passkeyUnsupported: 'Dein Browser unterstützt keine Passkeys.',
        deleteDangerTitle: 'Account löschen',
        deleteDangerSub: 'Diesen Test-Account und alle zugehörigen Daten (2FA, Passkeys) sofort und unwiderruflich löschen.',
        deleteAccount: 'Diesen Account löschen',
        deleteAccountConfirm: 'Diesen Account „{name}" wirklich endgültig löschen?',
      },
      guide: {
        badge: 'Für Einsteiger erklärt',
        h1: 'Anleitung: Üben mit deinem Passwortmanager',
        sub: 'Diese Seite ist ein <strong>Übungsplatz</strong>. Hier kannst du gefahrlos ausprobieren, wie ein Passwortmanager funktioniert – mit Test-Accounts ohne echte Daten.',
        whatTitle: 'Was ist ein Passwortmanager?',
        whatP1: 'Ein Passwortmanager ist ein digitaler Tresor. Er erstellt für jede Webseite ein starkes, einzigartiges Passwort, speichert es verschlüsselt und füllt es beim Login automatisch aus. Du musst dir nur <em>ein</em> Master-Passwort merken.',
        whatP2: 'Beliebte Programme: <strong>Bitwarden</strong>, <strong>1Password</strong>, <strong>KeePass</strong> oder der in Chrome/Safari/Firefox eingebaute Manager.',
        stepsTitle: 'In 4 Schritten zum ersten Test',
        step1Title: 'Account anlegen',
        step1Body: 'Gehe auf die <a href="/">Startseite</a>, wähle „Registrieren" und denk dir einen beliebigen Benutzernamen und ein Passwort aus. Dein Passwortmanager bietet dabei an, ein sicheres Passwort zu erzeugen und zu speichern – nimm das Angebot an.',
        step2Title: 'Abmelden und neu anmelden',
        step2Body: 'Melde dich ab und wieder an. Beobachte, wie dein Passwortmanager die Felder automatisch ausfüllt. Genau so läuft es später bei echten Webseiten.',
        step3Title: '2FA einrichten',
        step3Body: 'Im Dashboard kannst du „2FA einrichten" wählen. Scanne den QR-Code mit einer Authenticator-App (z.B. <strong>Google Authenticator</strong>) oder speichere ihn in deinem Passwortmanager. Beim nächsten Login wird zusätzlich ein 6-stelliger Code abgefragt.',
        step4Title: 'Passkey ausprobieren',
        step4Body: 'Füge im Dashboard einen <strong>Passkey</strong> hinzu. Dein Gerät fragt nach Fingerabdruck, Gesicht oder PIN. Danach kannst du dich ganz ohne Passwort anmelden – einfach über „Mit Passkey anmelden".',
        explainTitle: 'Kurz erklärt: 2FA & Passkeys',
        explainP1: '<strong>2FA (Zwei-Faktor-Authentifizierung)</strong> ist eine zusätzliche Sicherheitsstufe: Neben dem Passwort brauchst du einen zeitlich begrenzten Code aus einer App. Selbst wenn jemand dein Passwort kennt, fehlt ihm dieser Code.',
        explainP2: '<strong>Passkeys</strong> ersetzen das Passwort komplett. Statt etwas einzutippen, bestätigst du die Anmeldung mit deinem Gerät (Fingerabdruck/Gesicht/PIN). Das ist bequemer und sicher gegen Phishing.',
        callout: '<strong>Gut zu wissen:</strong> Diese Seite läuft nur lokal auf deinem Rechner (<code>localhost</code>) und dient ausschließlich zum Üben. Es werden keine echten Konten, E-Mail-Adressen oder sensiblen Daten benötigt. Test-Accounts werden automatisch wieder aufgeräumt.',
        back: '← Zurück zur Demo',
      },
      errors: {
        MISSING_CREDENTIALS: 'Benutzername und Passwort sind erforderlich.',
        MISSING_USERNAME: 'Benutzername ist erforderlich.',
        USERNAME_TAKEN: 'Benutzername bereits vergeben.',
        INVALID_CREDENTIALS: 'Benutzername oder Passwort ist falsch.',
        NO_LOGIN_FLOW: 'Kein laufender Login-Vorgang.',
        INVALID_2FA_CODE: 'Der 2FA-Code ist ungültig. Bitte erneut versuchen.',
        NOT_AUTHENTICATED: 'Nicht angemeldet.',
        SETUP_2FA_FIRST: 'Bitte zuerst 2FA einrichten.',
        NO_PASSKEY_REG: 'Keine laufende Passkey-Registrierung.',
        PASSKEY_VERIFY_FAILED: 'Passkey konnte nicht verifiziert werden.',
        NO_PASSKEY_AUTH: 'Keine laufende Passkey-Anmeldung.',
        PASSKEY_UNKNOWN: 'Unbekannter Passkey.',
        PASSKEY_AUTH_FAILED: 'Passkey-Anmeldung fehlgeschlagen.',
        PASSKEY_NOT_FOUND: 'Passkey nicht gefunden.',
        NOT_FOUND: 'Nicht gefunden.',
        SERVER_ERROR: 'Interner Serverfehler.',
        RATE_LIMITED: 'Zu viele Versuche. Bitte kurz warten.',
        GENERIC: 'Es ist ein Fehler aufgetreten.',
      },
    },

    en: {
      meta: {
        titleIndex: 'Password Manager Practice Demo',
        titleDashboard: 'Dashboard · Password Manager Practice Demo',
        titleGuide: 'Guide · Password Manager Practice Demo',
      },
      nav: {
        brand: 'Password-Manager Practice',
        guide: 'Guide',
        demo: 'To the demo',
        logout: 'Sign out',
      },
      common: { waiting: 'Please wait …', or: 'or', cancel: 'Cancel' },
      theme: { switchLabel: 'Choose theme', light: 'Light theme', dark: 'Dark theme' },
      index: {
        badge: 'Demo · just for practice',
        h1: 'Practice safely with your password manager',
        p: 'Create a test account, save it in your password manager and try out login, 2FA and passkeys. No email, no real data required.',
        tabLogin: 'Sign in',
        tabRegister: 'Register',
        username: 'Username',
        password: 'Password',
        loginSubmit: 'Sign in',
        loginHint: 'Tip: let your password manager save and autofill your username & password.',
        totpLabel: '2FA code from your authenticator app',
        totpSubmit: 'Confirm code',
        regSubmit: 'Create account',
        regHint: 'This practice site has no requirements for username or password.',
        passkeyLogin: '🔑 Sign in with a passkey',
        footer: 'Learn more in the <a href="/guide">step-by-step guide</a>.',
        twofaPrompt: 'Please enter the 6-digit code from your authenticator app.',
        passkeyCancelled: 'Passkey sign-in cancelled.',
        passkeyUnsupported: 'Your browser does not support passkeys.',
        deleteSummary: 'Delete a test account',
        deleteHint: 'Enter a username to immediately and permanently delete that test account and all related data (2FA, passkeys) – handy for recreating it.',
        deleteSubmit: 'Delete account',
        deleteConfirm: 'Permanently delete test account “{name}”?',
        deleteDone: 'If the test account “{name}” existed, it has been deleted. You can recreate it now.',
      },
      dashboard: {
        hello: 'Hello,',
        accountBadge: 'Test account',
        intro: 'Here you can set up <strong>2FA</strong> and <strong>passkeys</strong> and practice with your password manager. Sign out and back in afterwards to test the flow.',
        twofaTitle: '2FA · Google Authenticator',
        twofaSub: 'Time-based one-time codes (TOTP) as a second factor.',
        badgeActive: 'active',
        badgeInactive: 'inactive',
        twofaStart: 'Set up 2FA',
        qrAlt: 'QR code for the authenticator app',
        twofaScan: 'Scan the QR code or enter the key manually:',
        twofaCodeLabel: 'Code from the app',
        twofaActivate: 'Activate',
        twofaActiveInfo: '2FA is active. A code will be requested at your next login.',
        twofaDisable: 'Disable 2FA',
        passkeysTitle: 'Passkeys',
        passkeysSub: 'Passwordless sign-in via device, fingerprint or security key.',
        passkeysEmpty: 'No passkeys yet.',
        passkeyName: 'Name (optional)',
        passkeyNamePh: 'e.g. My laptop',
        passkeyAdd: '🔑 Add passkey',
        footer: 'Need help? Check out the <a href="/guide">guide</a>.',
        deletionNotice: 'Note: this test account will be deleted automatically on {date}.',
        remove: 'Remove',
        addedOn: 'added on',
        passkeyDefaultName: 'Passkey',
        twofaActivated: '2FA has been activated.',
        twofaDeactivated: '2FA has been disabled.',
        confirmDisable: 'Really disable 2FA?',
        passkeySaved: 'Passkey saved.',
        passkeyCancelled: 'Passkey registration cancelled.',
        passkeySaveFailed: 'The passkey could not be saved.',
        confirmRemovePasskey: 'Remove this passkey?',
        passkeyUnsupported: 'Your browser does not support passkeys.',
        deleteDangerTitle: 'Delete account',
        deleteDangerSub: 'Immediately and permanently delete this test account and all related data (2FA, passkeys).',
        deleteAccount: 'Delete this account',
        deleteAccountConfirm: 'Permanently delete this account “{name}”?',
      },
      guide: {
        badge: 'Explained for beginners',
        h1: 'Guide: practising with your password manager',
        sub: 'This page is a <strong>practice playground</strong>. Here you can safely try out how a password manager works – with test accounts and no real data.',
        whatTitle: 'What is a password manager?',
        whatP1: 'A password manager is a digital vault. It creates a strong, unique password for every website, stores it encrypted and fills it in automatically when you log in. You only need to remember <em>one</em> master password.',
        whatP2: 'Popular apps: <strong>Bitwarden</strong>, <strong>1Password</strong>, <strong>KeePass</strong> or the manager built into Chrome/Safari/Firefox.',
        stepsTitle: 'Your first test in 4 steps',
        step1Title: 'Create an account',
        step1Body: 'Go to the <a href="/">home page</a>, choose “Register” and pick any username and password you like. Your password manager will offer to generate and save a secure password – accept the offer.',
        step2Title: 'Sign out and back in',
        step2Body: 'Sign out and back in. Watch how your password manager fills in the fields automatically. This is exactly how it works on real websites.',
        step3Title: 'Set up 2FA',
        step3Body: 'In the dashboard you can choose “Set up 2FA”. Scan the QR code with an authenticator app (e.g. <strong>Google Authenticator</strong>) or save it in your password manager. At your next login a 6-digit code will also be requested.',
        step4Title: 'Try a passkey',
        step4Body: 'Add a <strong>passkey</strong> in the dashboard. Your device will ask for fingerprint, face or PIN. After that you can sign in completely without a password – simply via “Sign in with a passkey”.',
        explainTitle: 'In short: 2FA & passkeys',
        explainP1: '<strong>2FA (two-factor authentication)</strong> is an extra layer of security: besides your password you need a time-limited code from an app. Even if someone knows your password, they are missing this code.',
        explainP2: '<strong>Passkeys</strong> replace the password entirely. Instead of typing something, you confirm the sign-in with your device (fingerprint/face/PIN). It is more convenient and secure against phishing.',
        callout: '<strong>Good to know:</strong> this page runs only locally on your computer (<code>localhost</code>) and is solely for practice. No real accounts, email addresses or sensitive data are needed. Test accounts are cleaned up automatically.',
        back: '← Back to the demo',
      },
      errors: {
        MISSING_CREDENTIALS: 'Username and password are required.',
        MISSING_USERNAME: 'A username is required.',
        USERNAME_TAKEN: 'Username is already taken.',
        INVALID_CREDENTIALS: 'Username or password is incorrect.',
        NO_LOGIN_FLOW: 'No login in progress.',
        INVALID_2FA_CODE: 'The 2FA code is invalid. Please try again.',
        NOT_AUTHENTICATED: 'Not signed in.',
        SETUP_2FA_FIRST: 'Please set up 2FA first.',
        NO_PASSKEY_REG: 'No passkey registration in progress.',
        PASSKEY_VERIFY_FAILED: 'The passkey could not be verified.',
        NO_PASSKEY_AUTH: 'No passkey sign-in in progress.',
        PASSKEY_UNKNOWN: 'Unknown passkey.',
        PASSKEY_AUTH_FAILED: 'Passkey sign-in failed.',
        PASSKEY_NOT_FOUND: 'Passkey not found.',
        NOT_FOUND: 'Not found.',
        SERVER_ERROR: 'Internal server error.',
        RATE_LIMITED: 'Too many attempts. Please wait a moment.',
        GENERIC: 'An error occurred.',
      },
    },
  };

  const STORAGE_KEY = 'pm_lang';
  const SUPPORTED = ['de', 'en'];
  let current = detect();

  function detect() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.includes(saved)) return saved;
    } catch (_) {
      /* localStorage evtl. nicht verfügbar */
    }
    const primary = (navigator.language || 'en').toLowerCase();
    return primary.startsWith('de') ? 'de' : 'en';
  }

  function lookup(lang, key) {
    return key.split('.').reduce((o, part) => (o == null ? undefined : o[part]), DICT[lang]);
  }

  function t(key, vars) {
    let val = lookup(current, key);
    if (val === undefined) val = lookup('en', key);
    if (val === undefined) return key;
    if (vars) {
      val = String(val).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    }
    return val;
  }

  function has(key) {
    return lookup(current, key) !== undefined || lookup('en', key) !== undefined;
  }

  function apply(root) {
    root = root || document;
    document.documentElement.lang = current;

    const titleKey = document.documentElement.getAttribute('data-i18n-title');
    if (titleKey) document.title = t(titleKey);

    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    root.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      el.setAttribute('alt', t(el.getAttribute('data-i18n-alt')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });

    document.querySelectorAll('[data-lang]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-lang') === current);
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === current));
    });
  }

  const listeners = [];
  function onChange(fn) {
    listeners.push(fn);
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang) || lang === current) return;
    current = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {
      /* ignore */
    }
    apply();
    listeners.forEach((fn) => {
      try {
        fn(current);
      } catch (_) {
        /* ignore */
      }
    });
  }

  // Sprachumschalter (data-lang Buttons) verdrahten – funktioniert auch für
  // dynamisch eingefügte Buttons via Event-Delegation.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lang]');
    if (btn) {
      e.preventDefault();
      setLang(btn.getAttribute('data-lang'));
    }
  });

  window.I18n = { t, has, setLang, getLang: () => current, apply, onChange };

  // Initiale Übersetzung anwenden (Skript liegt am Ende des <body>).
  apply();
})();
