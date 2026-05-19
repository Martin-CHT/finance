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
        'fc_module_order',
        'fc_module_visibility',
        'fc_module_groups'
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

    /* Google Sheets URL — pokud máme legacy URL z minula a `finance_sheets_url`
       je prázdné, převedeme jí. ALE: legacy klíče už NEzrcadlíme dál, protože
       jejich syncToCloud rutiny posílají raw pole bez `?module=`, což skončí
       v listu `mod_unknown`. Nový auto-sync přes `finance_sheets_url` zapisuje
       do správných `mod_<modul>` listů — necháme jen ten. */
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
    // Vymažeme legacy klíče, ať starý syncToCloud nepošle žádný raw POST.
    // Sync teď řídí výhradně `finance_sheets_url` + auto-sync přes meta tagy.
    legacySheetsKeys.forEach(function (k) { deleteUnified(k); });

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
       a překreslí svůj login indikátor / pole.
       V iframe pošleme zprávu i do parent okna, aby Index.html mohl reloadnout
       všechny ostatní iframe moduly (aby si stáhly data z user's Sheetu pod novou sessionou). */
    function notifyChange() {
        try {
            window.dispatchEvent(new CustomEvent('fc-session-change', { detail: getSession() }));
        } catch (e) {}
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'fc-session-change', session: getSession() }, '*');
            }
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

    /* ════════════════════════════════════════════════════════════
       5) MODULE-DATA SYNC s uživatelovým Google Sheetem
       ════════════════════════════════════════════════════════════
       Toto je oddělené od cloud auth (FC_AUTH_URL):
       - Cloud auth (centralizovaný) drží jen MALÝ config (AI klíče, téma, pořadí).
       - Velká data jednotlivých modulů (transakce, cíle, půjčky, BTC investice,
         předplatná, ...) chodí do listu uživatelova vlastního Google Sheetu
         (URL je `finance_sheets_url`). Listy se jmenují `mod_<modulkey>`.

       Modul ji aktivuje dvěma `<meta>` tagy v <head>:
         <meta name="fc-module"      content="prijmy">
         <meta name="fc-storage-key" content="FinanceAI_data">

       Pak se automaticky stane:
         a) Při startu se z user's Sheetu stáhne `mod_prijmy` a zapíše do
            localStorage['FinanceAI_data'] (pokud se liší od stávající hodnoty).
            Po zápisu se dispatchne CustomEvent `fc-module-data-updated`,
            který modul může poslouchat a překreslit.
         b) Každý další zápis do localStorage['FinanceAI_data'] z modulu
            (po editu, importu, smazání) se debounced (3 s) pushne zpět
            do user's Sheetu jako `{action:"saveData", module:"prijmy", data:[...]}`. */

    function _userSheetUrl() {
        var u = readUnified('finance_sheets_url') || '';
        return /^https?:\/\//.test(u) ? u : '';
    }
    function _appendQuery(url, qs) {
        return url + (url.indexOf('?') === -1 ? '?' : '&') + qs;
    }
    function _sheetUrlWithToken(extraQs) {
        var u = _userSheetUrl(); if (!u) return '';
        var t = readUnified('finance_sheets_token');
        if (t) u = _appendQuery(u, 'token=' + encodeURIComponent(t));
        if (extraQs) u = _appendQuery(u, extraQs);
        return u;
    }

    /* Pošle libovolný JSON objekt jako data modulu. */
    async function pushModuleData(moduleName, data) {
        var base = _userSheetUrl();
        if (!base) return false; // user nemá Sheet nastavený — nic neděláme
        var t = readUnified('finance_sheets_token');
        var body = { action: 'saveData', module: moduleName, data: data };
        if (t) body.token = t;
        try {
            var r = await fetch(base, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                redirect: 'follow'
            });
            if (!r.ok) return false;
            var j = await r.json().catch(function () { return null; });
            return !!(j && j.ok);
        } catch (e) { return false; }
    }

    /* Stáhne `mod_<moduleName>`. Vrací parsovaný JSON nebo null. */
    async function pullModuleData(moduleName) {
        var url = _sheetUrlWithToken('action=getData&module=' + encodeURIComponent(moduleName));
        if (!url) return null;
        try {
            var r = await fetch(url);
            if (!r.ok) return null;
            var j = await r.json().catch(function () { return null; });
            if (!j || !j.ok) return null;
            return (j.data == null) ? null : j.data;
        } catch (e) { return null; }
    }

    /* Debounced push pro daný modul. */
    var _modulePushTimers = {};
    function scheduleModulePush(moduleName, dataProvider, delayMs) {
        if (!_userSheetUrl()) return;
        if (_modulePushTimers[moduleName]) clearTimeout(_modulePushTimers[moduleName]);
        _modulePushTimers[moduleName] = setTimeout(function () {
            delete _modulePushTimers[moduleName];
            try {
                var data = (typeof dataProvider === 'function') ? dataProvider() : dataProvider;
                pushModuleData(moduleName, data);
            } catch (e) {}
        }, typeof delayMs === 'number' ? delayMs : 3000);
    }

    /* ═══ Helpers pro merge / konflikt ═══ */
    function _isEmpty(d) {
        if (d == null) return true;
        if (Array.isArray(d)) return d.length === 0;
        if (typeof d === 'object') {
            if (Array.isArray(d.items)) return d.items.length === 0;
            return Object.keys(d).length === 0;
        }
        return false;
    }
    function _countItems(d) {
        if (Array.isArray(d)) return d.length;
        if (d && Array.isArray(d.items)) return d.items.length;
        if (d && typeof d === 'object') return Object.keys(d).length;
        return 0;
    }
    function _mergeArraysById(local, remote) {
        // Union podle id; v případě konfliktu lokální verze vyhrává.
        var byId = {};
        var withoutIdLocal = [], withoutIdRemote = [];
        (Array.isArray(remote) ? remote : []).forEach(function (it) {
            if (it && it.id != null) byId[it.id] = { remote: it };
            else withoutIdRemote.push(it);
        });
        (Array.isArray(local) ? local : []).forEach(function (it) {
            if (it && it.id != null) {
                if (byId[it.id]) byId[it.id].local = it; // local wins
                else byId[it.id] = { local: it };
            } else {
                withoutIdLocal.push(it);
            }
        });
        var out = [];
        Object.keys(byId).forEach(function (k) {
            var pair = byId[k];
            out.push(pair.local || pair.remote);
        });
        // Položky bez ID nemůžeme deduplikovat — bereme jen lokální (předpokládáme,
        // že cloudové bez ID jsou starší). Pokud uživatel preferuje merge i bez ID,
        // lze v budoucnu udělat fuzzy match podle obsahu.
        return out.concat(withoutIdLocal);
    }
    function _mergeData(local, remote) {
        if (Array.isArray(local) && Array.isArray(remote)) {
            return _mergeArraysById(local, remote);
        }
        if (local && remote && Array.isArray(local.items) && Array.isArray(remote.items)) {
            var merged = Object.assign({}, remote, local);
            merged.items = _mergeArraysById(local.items, remote.items);
            return merged;
        }
        // Strukturně neporovnatelné → lokální vyhrává
        return local;
    }
    function _escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
        });
    }

    /* Dialog: konflikt cloud vs. local. callback dostane 'local'/'remote'/'merge'/'cancel'. */
    function showConflictDialog(moduleName, local, remote, callback) {
        if (document.getElementById('fc-conflict-dlg')) return; // jeden najednou
        var localCount = _countItems(local);
        var remoteCount = _countItems(remote);
        var dlg = document.createElement('div');
        dlg.id = 'fc-conflict-dlg';
        dlg.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.85);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:Inter,system-ui,sans-serif;color:#f8fafc;';
        var localJson = '';
        var remoteJson = '';
        try { localJson  = JSON.stringify(local,  null, 2).slice(0, 3000); } catch (e) {}
        try { remoteJson = JSON.stringify(remote, null, 2).slice(0, 3000); } catch (e) {}
        dlg.innerHTML =
          '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:0.75rem;max-width:34rem;width:100%;padding:1.5rem;box-shadow:0 25px 60px rgba(0,0,0,0.5);">' +
            '<h3 style="margin:0 0 0.5rem;font-size:1rem;font-weight:600;display:flex;align-items:center;gap:0.5rem;">' +
              '<span style="color:#fbbf24;font-size:1.2rem;">⚠</span>' +
              'Konflikt synchronizace · modul <span style="color:#38bdf8;font-family:JetBrains Mono,monospace;">' + _escapeHtml(moduleName) + '</span>' +
            '</h3>' +
            '<p style="margin:0 0 1rem;font-size:0.85rem;color:#94a3b8;line-height:1.5;">' +
              'Lokální data a cloud data se liší. Žádná data <b style="color:#cbd5e1;">se ti při této volbě neztratí</b> — můžeš sloučit (nejbezpečnější) nebo vybrat, která verze přepíše druhou.' +
            '</p>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">' +
              '<div style="background:#020617;border:1px solid #1e293b;border-radius:0.5rem;padding:0.85rem;">' +
                '<div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">💾 Tento prohlížeč</div>' +
                '<div style="font-family:JetBrains Mono,monospace;font-size:1.5rem;font-weight:700;color:#38bdf8;margin-top:0.2rem;">' + localCount + '</div>' +
                '<div style="font-size:0.68rem;color:#64748b;">položek lokálně</div>' +
              '</div>' +
              '<div style="background:#020617;border:1px solid #1e293b;border-radius:0.5rem;padding:0.85rem;">' +
                '<div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">☁ Google Sheets</div>' +
                '<div style="font-family:JetBrains Mono,monospace;font-size:1.5rem;font-weight:700;color:#a78bfa;margin-top:0.2rem;">' + remoteCount + '</div>' +
                '<div style="font-size:0.68rem;color:#64748b;">položek v cloudu</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
              '<button id="fc-conf-merge" style="padding:0.65rem 0.85rem;background:#0ea5e9;color:#fff;border:none;border-radius:0.4rem;cursor:pointer;font-weight:500;font-size:0.85rem;text-align:left;">' +
                '🔗 <b>Sloučit</b> · přidat unikátní z obou (při duplicitě stejného ID vyhrává lokální)' +
              '</button>' +
              '<button id="fc-conf-remote" style="padding:0.65rem 0.85rem;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:0.4rem;cursor:pointer;font-size:0.85rem;text-align:left;">' +
                '☁ Použít <b>cloud</b> verzi (přepsat lokální)' +
              '</button>' +
              '<button id="fc-conf-local" style="padding:0.65rem 0.85rem;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:0.4rem;cursor:pointer;font-size:0.85rem;text-align:left;">' +
                '💾 Použít <b>lokální</b> verzi (přepsat cloud)' +
              '</button>' +
              '<button id="fc-conf-cancel" style="padding:0.55rem;background:transparent;color:#64748b;border:1px solid #1e293b;border-radius:0.4rem;cursor:pointer;font-size:0.75rem;">' +
                'Rozhodnu se později (nic neměnit)' +
              '</button>' +
              '<details style="margin-top:0.5rem;">' +
                '<summary style="cursor:pointer;font-size:0.72rem;color:#64748b;padding:0.25rem 0;">Zobrazit JSON detail (lokál vlevo, cloud vpravo)</summary>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.4rem;max-height:14rem;overflow:auto;">' +
                  '<pre style="background:#020617;padding:0.5rem;border:1px solid #1e293b;border-radius:0.3rem;color:#cbd5e1;font-size:0.6rem;line-height:1.3;font-family:JetBrains Mono,monospace;white-space:pre-wrap;word-break:break-all;margin:0;">' + _escapeHtml(localJson) + '</pre>' +
                  '<pre style="background:#020617;padding:0.5rem;border:1px solid #1e293b;border-radius:0.3rem;color:#cbd5e1;font-size:0.6rem;line-height:1.3;font-family:JetBrains Mono,monospace;white-space:pre-wrap;word-break:break-all;margin:0;">' + _escapeHtml(remoteJson) + '</pre>' +
                '</div>' +
              '</details>' +
            '</div>' +
          '</div>';
        function close(choice) { dlg.remove(); callback(choice); }
        document.body.appendChild(dlg);
        dlg.querySelector('#fc-conf-merge').onclick  = function () { close('merge'); };
        dlg.querySelector('#fc-conf-remote').onclick = function () { close('remote'); };
        dlg.querySelector('#fc-conf-local').onclick  = function () { close('local'); };
        dlg.querySelector('#fc-conf-cancel').onclick = function () { close('cancel'); };
    }

    /* Auto-sync hook — najde meta tagy v <head> a napojí localStorage zápis na cloud. */
    function autoSyncModuleViaMeta() {
        var mModule = document.querySelector('meta[name="fc-module"]');
        var mKey    = document.querySelector('meta[name="fc-storage-key"]');
        if (!mModule || !mKey || !mModule.content || !mKey.content) return;
        var moduleName = mModule.content.trim();
        var storageKey = mKey.content.trim();

        // Hook localStorage.setItem pro daný klíč — auto-push do cloudu (debounced 3 s)
        var _origSetItem = localStorage.setItem.bind(localStorage);
        var _suppressPushOnce = false;
        localStorage.setItem = function (k, v) {
            _origSetItem(k, v);
            if (k !== storageKey) return;
            if (_suppressPushOnce) { _suppressPushOnce = false; return; }
            scheduleModulePush(moduleName, function () {
                try { return JSON.parse(v); } catch (e) { return v; }
            });
        };

        function applyAndReload(newData) {
            _suppressPushOnce = true;
            try { localStorage.setItem(storageKey, JSON.stringify(newData)); } catch (e) {}
            setTimeout(function () { try { location.reload(); } catch (e) {} }, 150);
        }

        function initialPull() {
            if (!_userSheetUrl()) return;
            pullModuleData(moduleName).then(function (remote) {
                if (remote == null) return; // cloud prázdný → necháme lokál

                var localRaw = lsGet(storageKey);
                var local = null;
                try { local = localRaw ? JSON.parse(localRaw) : null; } catch (e) { local = null; }

                // Lokál je prázdný → použij remote bez ptaní (žádný konflikt).
                if (_isEmpty(local)) {
                    applyAndReload(remote);
                    return;
                }
                // Identické → nic neudělej.
                try {
                    if (JSON.stringify(local) === JSON.stringify(remote)) return;
                } catch (e) {}

                // Rozdíl → zeptej se uživatele
                showConflictDialog(moduleName, local, remote, function (choice) {
                    if (choice === 'remote') {
                        applyAndReload(remote);
                    } else if (choice === 'local') {
                        // Pošli lokál do cloudu, lokál zůstává; krátký toast místo reloadu
                        pushModuleData(moduleName, local);
                    } else if (choice === 'merge') {
                        var merged = _mergeData(local, remote);
                        _suppressPushOnce = true;
                        try { localStorage.setItem(storageKey, JSON.stringify(merged)); } catch (e) {}
                        // Počkáme na dokončení pushe, ať se po reloadu neukáže další konflikt
                        pushModuleData(moduleName, merged).then(function () {
                            try { location.reload(); } catch (e) {}
                        }, function () {
                            try { location.reload(); } catch (e) {}
                        });
                    }
                    // 'cancel' → nic neměnit
                });
            }).catch(function () { /* ignore network errors */ });
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialPull);
        } else {
            initialPull();
        }
    }
    // Spustit IHNED — meta tagy už jsou v <head> nad tímto skriptem.
    autoSyncModuleViaMeta();

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
            pull:               pull,
            push:               push,
            scheduleSync:       scheduleSync,
            collectConfig:      collectConfig,
            applyConfig:        applyConfig,
            keys:               CLOUD_KEYS,
            /* NEW: module-data sync proti uživatelovu Sheetu */
            pushModule:         pushModuleData,
            pullModule:         pullModuleData,
            scheduleModulePush: scheduleModulePush,
            hasSheetsUrl:       function () { return !!_userSheetUrl(); }
        }
    };
})();
