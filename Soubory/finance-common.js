/*  ════════════════════════════════════════════════════════════════════
    finance-common.js
    Společný most mezi sjednoceným "Nastavení.html" a všemi moduly.
    Obsahuje:
      1) Migrace sjednoceného nastavení do legacy klíčů (zpětná
         kompatibilita s historickými moduly).
      2) Plovoucí tlačítko "Nastavení" v rohu každého modulu.
      3) postMessage handler pro téma (modul jako iframe v Index.html).
      4) Cloud auth + sync proti Google Apps Script backendu:
         přihlášení uživatelským jménem a heslem (PBKDF2 hash na klientu),
         automatický pull konfigurace při startu, debounced push při změně.
    ════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ─────────────  KONSTANTY  ───────────── */
    var COOKIE_DAYS = 365;

    /* URL Apps Script Web App, který hostí účty Finance Terminalu.
       Pokud se rozhodnete změnit / přesunout backend, stačí upravit
       tuto jedinou konstantu. */
    var FC_AUTH_URL = 'https://script.google.com/macros/s/AKfycby7bCEqwuTeqBqksHDVdJRQ7CmywUixcOUhh6X1ACpX7EoCEhc7i2iOJL8UKOsDjQc/exec';

    /* Klíče, které tvoří "cloud config" — synchronizují se mezi zařízeními. */
    var CLOUD_KEYS = [
        'groq_api_key',
        'gemini_api_key',
        'chatgpt_api_key',
        'ai_provider',
        'finance_sheets_url',
        'finance_sheets_id',
        'finance_sheets_token',
        'finance_theme',
        'fc_module_order'
    ];

    /* PBKDF2 parametry — musí přesně odpovídat tomu, co očekává Apps Script. */
    var PBKDF2_ITERS = 200000;

    /* ═════════════  STORAGE PRIMITIVES  ═════════════ */
    function setCookie(name, value, days) {
        try {
            var exp = new Date(Date.now() + (days || COOKIE_DAYS) * 86400000).toUTCString();
            document.cookie = name + '=' + encodeURIComponent(value == null ? '' : value) +
                '; expires=' + exp + '; path=/; SameSite=Lax';
        } catch (e) {}
    }
    function getCookie(name) {
        try {
            var pairs = document.cookie ? document.cookie.split('; ') : [];
            for (var i = 0; i < pairs.length; i++) {
                if (pairs[i].indexOf(name + '=') === 0) {
                    return decodeURIComponent(pairs[i].substring(name.length + 1));
                }
            }
        } catch (e) {}
        return '';
    }
    function delCookie(name) {
        try { document.cookie = name + '=; Max-Age=0; path=/'; } catch (e) {}
    }
    function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v == null ? '' : v); } catch (e) {} }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

    function readUnified(key) { return lsGet(key) || getCookie(key); }
    function writeUnified(key, value) {
        if (value == null) value = '';
        lsSet(key, value);
        setCookie(key, value, COOKIE_DAYS);
    }
    function deleteUnified(key) { lsDel(key); delCookie(key); }

    /* ════════════  1) LEGACY MIGRACE  ════════════ */

    /* AI klíče jsou ve všech modulech pojmenované shodně, ale některé je
       drží jen v cookie, jiné jen v localStorage. Sjednotíme do obojího. */
    ['groq_api_key', 'gemini_api_key', 'chatgpt_api_key', 'ai_provider'].forEach(function (key) {
        var v = readUnified(key);
        if (v) writeUnified(key, v);
    });

    /* Google Sheets URL — jeden sjednocený `finance_sheets_url` převedeme
       i do legacy klíčů, které jednotlivé moduly hledají. */
    var legacySheetsKeys = [
        'google_sync_pension',
        'FinanceAI_api',
        'google_sync_finance_ai',
        'f_pro_vFinal_api',
        'f_vProFinal_api',
        'google_sync_pujcky',
        'google_sync_api',
        'google_sync_fondy'
    ];
    var unifiedSheets = readUnified('finance_sheets_url');
    if (!unifiedSheets) {
        for (var i = 0; i < legacySheetsKeys.length; i++) {
            var v = readUnified(legacySheetsKeys[i]);
            if (v && /^https?:\/\//.test(v)) { unifiedSheets = v; writeUnified('finance_sheets_url', v); break; }
        }
    }
    if (unifiedSheets) {
        legacySheetsKeys.forEach(function (k) {
            if (readUnified(k) !== unifiedSheets) writeUnified(k, unifiedSheets);
        });
    }

    /* Téma — master `finance_theme`, aliasy do všech historických klíčů. */
    var theme = readUnified('finance_theme') || 'dark';
    ['finance_theme', 'pension_theme', 'prijmy_vydaje_theme',
     'sporeni_theme', 'pujcky_theme', 'majetek_theme'].forEach(function (k) {
        writeUnified(k, theme);
    });

    /* ════════════  2) PLOVOUCÍ TLAČÍTKO "NASTAVENÍ"  ════════════ */
    function injectSettingsButton() {
        if (document.getElementById('fc-settings-fab')) return;
        // V iframe (modul otevřený přes Index.html) FAB nepotřebujeme — Nastavení
        // už je v top navu Index.html. FAB injektujeme jen ve standalone režimu.
        try {
            if (window.self !== window.top) return;
        } catch (e) { return; }

        var style = document.createElement('style');
        style.id = 'fc-settings-fab-style';
        style.textContent =
            '#fc-settings-fab{' +
                'position:fixed;top:10px;right:14px;z-index:99998;' +
                'display:inline-flex;align-items:center;gap:6px;' +
                'padding:6px 10px;border-radius:8px;' +
                'background:rgba(15,23,42,.85);color:#cbd5e1;' +
                'font:500 11px/1 Inter,system-ui,sans-serif;' +
                'border:1px solid #1e293b;text-decoration:none;' +
                'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
                'transition:color .15s,border-color .15s,background .15s;' +
                'box-shadow:0 4px 12px rgba(0,0,0,.25);' +
            '}' +
            '#fc-settings-fab:hover{color:#f8fafc;border-color:#334155;background:rgba(30,41,59,.95);}' +
            '#fc-settings-fab svg{width:13px;height:13px;}' +
            'html.light #fc-settings-fab{background:rgba(255,255,255,.92);color:#475569;border-color:#e2e8f0;}' +
            'html.light #fc-settings-fab:hover{color:#0f172a;border-color:#cbd5e1;}';
        document.head.appendChild(style);

        var a = document.createElement('a');
        a.id = 'fc-settings-fab';
        a.href = './Nastavení.html';
        a.title = 'Sjednocené nastavení (AI klíče, Google Sheets, cloud účet)';
        a.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
                '<circle cx="12" cy="12" r="3"/>' +
            '</svg>' +
            '<span>Nastavení</span>';
        document.body.appendChild(a);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectSettingsButton);
    } else {
        injectSettingsButton();
    }

    /* ════════════  3) postMessage HANDLER PRO TÉMA  ════════════ */
    window.addEventListener('message', function (e) {
        try {
            if (e.data && e.data.type === 'finance-theme' && e.data.theme) {
                var t = e.data.theme === 'dark' ? 'dark' : 'light';
                writeUnified('finance_theme', t);
                document.documentElement.classList.toggle('light', t === 'light');
                document.documentElement.classList.toggle('dark', t === 'dark');
            }
        } catch (err) {}
    });

    /* ════════════════════════════════════════════════════════════
       4) CLOUD AUTH + SYNC
       ════════════════════════════════════════════════════════════ */

    /* Hash hesla na klientovi (PBKDF2-HMAC-SHA256, 200k iterací, salt = username).
       Vrací hex string délky 64. */
    async function pbkdf2Hex(password, salt) {
        if (!window.crypto || !crypto.subtle) {
            throw new Error('Tento prohlížeč nepodporuje Web Crypto API.');
        }
        var enc = new TextEncoder();
        var km = await crypto.subtle.importKey(
            'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
        );
        var bits = await crypto.subtle.deriveBits({
            name: 'PBKDF2', salt: enc.encode(salt),
            iterations: PBKDF2_ITERS, hash: 'SHA-256'
        }, km, 256);
        var arr = new Uint8Array(bits);
        var out = '';
        for (var i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
        return out;
    }

    /* Volání backendu — POST s text/plain (žádný CORS preflight). */
    async function apiCall(action, payload) {
        if (!FC_AUTH_URL) throw new Error('FC_AUTH_URL není nastaveno.');
        var body = Object.assign({ action: action }, payload || {});
        var r = await fetch(FC_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body),
            redirect: 'follow'
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }

    /* ── Session storage (localStorage, ne cookie — JS-only) ── */
    function getSession() {
        return {
            user:  lsGet('fc_session_user'),
            token: lsGet('fc_session_token'),
            hash:  lsGet('fc_session_hash')
        };
    }
    function setSession(user, token, clientHash) {
        if (user)       lsSet('fc_session_user', user);
        if (token)      lsSet('fc_session_token', token);
        if (clientHash) lsSet('fc_session_hash',  clientHash);
    }
    function clearSession() {
        lsDel('fc_session_user');
        lsDel('fc_session_token');
        lsDel('fc_session_hash');
    }
    function isLoggedIn() {
        var s = getSession();
        return !!(s.user && s.token);
    }

    /* ── Login flow ── */
    async function login(username, password) {
        var u = String(username || '').trim().toLowerCase();
        if (!u || !password) throw new Error('Vyplňte jméno i heslo.');
        var hash = await pbkdf2Hex(password, u);
        var res = await apiCall('login', { username: u, clientHash: hash });
        if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'login_failed');
        setSession(u, res.token, hash);
        // aplikujeme cloud config lokálně
        applyConfig(res.config || {});
        notifyChange();
        return res;
    }

    /* ── Register flow (po registraci rovnou loginujeme) ── */
    async function register(username, password) {
        var u = String(username || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw new Error('Jméno: 3–32 znaků, jen a-z 0-9 . _ -');
        if (!password || password.length < 6) throw new Error('Heslo musí mít alespoň 6 znaků.');
        var hash = await pbkdf2Hex(password, u);
        var reg = await apiCall('register', { username: u, clientHash: hash });
        if (!reg || !reg.ok) throw new Error(reg && reg.error ? reg.error : 'register_failed');
        // Po registraci se rovnou přihlásíme a pošleme aktuální lokální config nahoru
        var log = await apiCall('login', { username: u, clientHash: hash });
        if (!log || !log.ok) throw new Error(log && log.error ? log.error : 'login_after_register_failed');
        setSession(u, log.token, hash);
        // Pošleme nahoru, co lokálně máme (aby nový účet ihned obsahoval AI klíče atd.)
        await push();
        notifyChange();
        return log;
    }

    function logout() {
        clearSession();
        notifyChange();
    }

    /* ── Pull / push configu ── */
    async function pull() {
        var s = getSession();
        if (!s.user || !s.token) return null;
        var res;
        try {
            res = await apiCall('getConfig', { username: s.user, token: s.token });
        } catch (e) { return null; }
        if (!res || !res.ok) {
            // token mohl expirovat – pokus o automatický relogin přes uložený hash
            if (s.hash) {
                try {
                    var relog = await apiCall('login', { username: s.user, clientHash: s.hash });
                    if (relog && relog.ok) {
                        setSession(s.user, relog.token, s.hash);
                        applyConfig(relog.config || {});
                        notifyChange();
                        return relog.config || {};
                    }
                } catch (e) {}
            }
            // relogin neuspěl → vyčistíme session, aby uživatel ručně zadal heslo
            clearSession();
            notifyChange();
            return null;
        }
        applyConfig(res.config || {});
        notifyChange();
        return res.config || {};
    }

    async function push() {
        var s = getSession();
        if (!s.user || !s.token) return false;
        var cfg = collectConfig();
        try {
            var res = await apiCall('saveConfig', { username: s.user, token: s.token, config: cfg });
            return !!(res && res.ok);
        } catch (e) { return false; }
    }

    /* Sebere aktuální cloudově-synchronizované hodnoty z localStorage/cookies. */
    function collectConfig() {
        var cfg = {};
        CLOUD_KEYS.forEach(function (k) {
            var v = readUnified(k);
            if (v !== '') cfg[k] = v;
        });
        return cfg;
    }

    /* Aplikuje config (z cloudu) lokálně. */
    function applyConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        CLOUD_KEYS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(cfg, k) && cfg[k] != null) {
                writeUnified(k, cfg[k]);
            }
        });
        // Téma rovnou aplikujeme i na document.documentElement
        var t = cfg.finance_theme;
        if (t === 'dark' || t === 'light') {
            document.documentElement.classList.toggle('light', t === 'light');
            document.documentElement.classList.toggle('dark',  t === 'dark');
        }
    }

    /* Debounced push — volání ze stránek po každé změně AI/Sheets/téma/pořadí. */
    var pushTimer = null;
    function scheduleSync(delayMs) {
        if (!isLoggedIn()) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(function () {
            pushTimer = null;
            push();
        }, typeof delayMs === 'number' ? delayMs : 1500);
    }

    /* CustomEvent — stránky (Nastavení.html, Index.html) se hooknou
       a překreslí svůj login indikátor / pole. */
    function notifyChange() {
        try {
            window.dispatchEvent(new CustomEvent('fc-session-change', { detail: getSession() }));
        } catch (e) {}
    }

    /* ── Auto-pull při startu ── */
    function autoPullOnStart() {
        if (!isLoggedIn()) return;
        pull().catch(function () {});
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoPullOnStart);
    } else {
        autoPullOnStart();
    }

    /* ════════════  PUBLIC API  ════════════ */
    window.FinanceCommon = {
        /* legacy helpers (zachovány kvůli kompatibilitě) */
        getSheetsUrl:  function () { return readUnified('finance_sheets_url'); },
        getSheetsToken: function () { return readUnified('finance_sheets_token'); },
        getApiKey: function (provider) {
            if (provider === 'gemini')  return readUnified('gemini_api_key');
            if (provider === 'chatgpt' || provider === 'openai') return readUnified('chatgpt_api_key');
            return readUnified('groq_api_key');
        },
        getCookie: getCookie,
        setCookie: setCookie,

        /* unified read/write */
        read:  readUnified,
        write: writeUnified,
        del:   deleteUnified,

        /* cloud auth */
        auth: {
            login:       login,
            register:    register,
            logout:      logout,
            isLoggedIn:  isLoggedIn,
            getSession:  getSession,
            backendUrl:  FC_AUTH_URL
        },

        /* cloud sync */
        cloud: {
            pull:           pull,
            push:           push,
            scheduleSync:   scheduleSync,
            collectConfig:  collectConfig,
            applyConfig:    applyConfig,
            keys:           CLOUD_KEYS
        }
    };
})();
