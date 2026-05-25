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

    /* Registry modulů a jejich storage klíčů — single source of truth.
       Používá se pro:
         a) globální Export/Import (všechna modulová data v jednom souboru),
         b) globální cloud pull/push (po loginu stáhnout VŠECHNY moduly,
            nikoliv jen ten, který je otevřený v iframe).
       moduleKey = identifikátor pro `mod_<key>` v user's Sheetu;
       storageKey = klíč v localStorage v daném modulu. */
    var MODULE_DATA_REGISTRY = {
        prijmy:       'FinanceAI_data',
        predplatna:   'predplatna_v1',
        sporeni:      'sporici_data_ai_tree',
        pujcky:       'pujcky_data_v1',
        investice:    'pension_settings',
        broker:       'broker_v1',
        btc:          'btc-invest:v1',
        majetek:      'majetek_odpisy_items',
        energie:      'energie_v1',
        'pre-fi-re':  'pre_fi_re_v1'
    };

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
        // Coerceme na string — Apps Script může vrátit číslo/boolean,
        // localStorage stejně uloží stringovou variantu, ale naše srovnání
        // by jinak vždy selhalo (kvůli strict equality).
        var strVal = (typeof value === 'string') ? value : String(value);
        // KLÍČOVÉ: setItem se stejnou hodnotou ZBYTEČNĚ vyvolá `storage` event
        // v jiných oknech/iframech, což u nás způsobovalo smyčku po loginu:
        //   pull → applyConfig → writeUnified(key, sameValue) → storage event v parentu
        //   → renderAll → recreate iframes → každý iframe pull → loop.
        // Skipneme zápis, pokud je hodnota identická.
        if (lsGet(key) !== strVal) lsSet(key, strVal);
        // Cookie nevyvolává storage event, takže ji můžeme aktualizovat vždy.
        setCookie(key, strVal, COOKIE_DAYS);
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
        if (!password) throw new Error('Vyplň heslo.');
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

    /* ── Změna hesla ──
       Backend musí podporovat action 'changePassword' s payloadem
       { username, token, oldClientHash, newClientHash }. Při úspěchu
       vrátí { ok:true, token } (token se obvykle obnoví). */
    async function changePassword(oldPw, newPw) {
        var s = getSession();
        if (!s.user || !s.token) throw new Error('Nejsi přihlášen.');
        if (!oldPw || !newPw) throw new Error('Vyplň staré i nové heslo.');
        var oldHash = await pbkdf2Hex(oldPw, s.user);
        var newHash = await pbkdf2Hex(newPw, s.user);
        var res = await apiCall('changePassword', {
            username: s.user, token: s.token,
            oldClientHash: oldHash, newClientHash: newHash
        });
        if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'change_password_failed');
        // Backend nám vrátí čerstvý token; pokud ne, ponecháme stávající.
        setSession(s.user, res.token || s.token, newHash);
        notifyChange();
        return true;
    }

    /* ── Přejmenování účtu ──
       Backend musí podporovat action 'renameUser' s payloadem
       { username, token, clientHash (potvrzení heslem), newUsername, newClientHash }.
       newClientHash je PBKDF2 starého hesla, ale solený NOVÝM jménem
       (sůl je username v lowercase). Backend přejmenuje záznam v Auth listu
       i mod_<user>_* listy. Vrací { ok:true, token }. */
    async function renameUser(newUsername, password) {
        var s = getSession();
        if (!s.user || !s.token) throw new Error('Nejsi přihlášen.');
        var u = String(newUsername || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw new Error('Jméno: 3–32 znaků, jen a-z 0-9 . _ -');
        if (u === s.user) throw new Error('Nové jméno je stejné jako staré.');
        if (!password) throw new Error('Pro potvrzení zadej heslo.');
        var oldHash = await pbkdf2Hex(password, s.user);
        var newHash = await pbkdf2Hex(password, u);
        var res = await apiCall('renameUser', {
            username: s.user, token: s.token,
            clientHash: oldHash,
            newUsername: u, newClientHash: newHash
        });
        if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'rename_failed');
        setSession(u, res.token || s.token, newHash);
        notifyChange();
        return true;
    }

    /* ── Pull / push configu ──
       KLÍČOVÉ: na úspěšný pull NEVYVOLÁVÁME `fc-session-change`.
       Důvod: ten event v index.html spouští renderAll() → recreate iframes →
       každý iframe znovu volá autoPullOnStart → smyčka. Změny config-hodnot
       (téma, pořadí, viditelnost, AI klíče) jdou v applyConfig přes
       writeUnified → setItem → `storage` event (jen pro reálně změněné klíče),
       takže parent reaguje selektivně. */
    /* Generická apiCall s retry — používá se pro getConfig/saveConfig.
       Pro auth akce (login/register/changePassword/renameUser) NE — tam musí
       chyby projít hned, aby se uživateli zobrazila správná hláška. */
    async function _apiCallRetry(action, payload) {
        return await _withRetry(function () { return apiCall(action, payload); });
    }

    async function pull() {
        var s = getSession();
        if (!s.user || !s.token) return null;
        var res;
        try {
            res = await _apiCallRetry('getConfig', { username: s.user, token: s.token });
        } catch (e) { return null; }
        if (!res || !res.ok) {
            // token mohl expirovat – pokus o automatický relogin přes uložený hash
            if (s.hash) {
                try {
                    var relog = await apiCall('login', { username: s.user, clientHash: s.hash });
                    if (relog && relog.ok) {
                        setSession(s.user, relog.token, s.hash);
                        applyConfig(relog.config || {});
                        // Token se obnovil — login state se efektivně změnil, notifikuj.
                        notifyChange();
                        return relog.config || {};
                    }
                } catch (e) {}
            }
            // relogin neuspěl → vyčistíme session, aby uživatel ručně zadal heslo.
            // To je skutečná změna login-state, notifikujeme.
            clearSession();
            notifyChange();
            return null;
        }
        applyConfig(res.config || {});
        // Úspěšný pull = config refresh, ne session change. Nesignalizujeme.
        return res.config || {};
    }

    async function push() {
        var s = getSession();
        if (!s.user || !s.token) return false;
        var cfg = collectConfig();
        try {
            setSyncBusy && setSyncBusy(true);
            var res = await _apiCallRetry('saveConfig', { username: s.user, token: s.token, config: cfg });
            var ok = !!(res && res.ok);
            if (!ok) setSyncBusy && setSyncBusy(false, true);
            return ok;
        } catch (e) {
            setSyncBusy && setSyncBusy(false, true);
            return false;
        }
        finally { setSyncBusy && setSyncBusy(false); }
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

    /* Retry helper — exponential backoff (300ms, 900ms, 2700ms). */
    function _sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
    async function _withRetry(fn, attempts) {
        var max = attempts || 3;
        var lastErr;
        for (var i = 0; i < max; i++) {
            try { return await fn(); }
            catch (e) { lastErr = e; }
            if (i < max - 1) await _sleep(300 * Math.pow(3, i));
        }
        throw lastErr || new Error('all retries failed');
    }

    /* Pošle libovolný JSON objekt jako data modulu. S retry + verifikací úspěchu. */
    async function pushModuleData(moduleName, data) {
        var base = _userSheetUrl();
        if (!base) return false; // user nemá Sheet nastavený — nic neděláme
        var t = readUnified('finance_sheets_token');
        var body = { action: 'saveData', module: moduleName, data: data };
        if (t) body.token = t;
        setSyncBusy(true);
        try {
            return await _withRetry(async function () {
                var r = await fetch(base, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(body),
                    redirect: 'follow'
                });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                var j = await r.json().catch(function () { return null; });
                if (!j || !j.ok) throw new Error((j && j.error) || 'push_failed');
                return true;
            });
        } catch (e) {
            // Po vyčerpání retry — log a vrátí false, ale data zůstávají v localStorage,
            // takže příští úspěšný push je dotáhne nahoru.
            try { console.warn('[FinanceCommon] pushModuleData failed for', moduleName, e && e.message); } catch (_) {}
            return false;
        }
        finally { setSyncBusy(false); }
    }

    /* Stáhne `mod_<moduleName>`. Vrací parsovaný JSON nebo null. S retry. */
    async function pullModuleData(moduleName) {
        var url = _sheetUrlWithToken('action=getData&module=' + encodeURIComponent(moduleName));
        if (!url) return null;
        try {
            return await _withRetry(async function () {
                var r = await fetch(url);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                var j = await r.json().catch(function () { return null; });
                if (!j || !j.ok) throw new Error((j && j.error) || 'pull_failed');
                return (j.data == null) ? null : j.data;
            });
        } catch (e) {
            try { console.warn('[FinanceCommon] pullModuleData failed for', moduleName, e && e.message); } catch (_) {}
            return null;
        }
    }

    /* ═══ Globální Export / Import / Cloud sync všech modulů najednou ═══ */

    /* Sebere modulová data ze všech známých modulů (z localStorage).
       Vrací { moduleKey: parsedData }. Modulové klíče bez dat se nezahrnou. */
    function collectAllModuleData() {
        var out = {};
        Object.keys(MODULE_DATA_REGISTRY).forEach(function (modKey) {
            var sKey = MODULE_DATA_REGISTRY[modKey];
            var raw = lsGet(sKey);
            if (!raw) return;
            try { out[modKey] = JSON.parse(raw); }
            catch (e) { out[modKey] = raw; } // raw fallback
        });
        return out;
    }

    /* Aplikuje modulová data lokálně (zapíše do localStorage a vyvolá
       fc-module-data-updated, aby se v ostatních iframech zobrazila). */
    function applyAllModuleData(map) {
        if (!map || typeof map !== 'object') return;
        Object.keys(map).forEach(function (modKey) {
            var sKey = MODULE_DATA_REGISTRY[modKey];
            if (!sKey) return;
            var data = map[modKey];
            var payload = (typeof data === 'string') ? data : JSON.stringify(data);
            try { lsSet(sKey, payload); } catch (e) {}
            try {
                window.dispatchEvent(new CustomEvent('fc-module-data-updated', {
                    detail: { module: modKey, data: data, storageKey: sKey, source: 'global-import' }
                }));
            } catch (e) {}
        });
    }

    /* Push všech modulů do user's Sheetu (sekvenčně, šetří kvótu). */
    async function pushAllModuleData() {
        if (!_userSheetUrl()) return false;
        var all = collectAllModuleData();
        var keys = Object.keys(all);
        for (var i = 0; i < keys.length; i++) {
            try { await pushModuleData(keys[i], all[keys[i]]); }
            catch (e) { /* pokračuj — jeden nefungující modul nesmí zastavit ostatní */ }
        }
        return true;
    }

    /* Pull všech modulů z user's Sheetu po loginu / refreshi.
       Aplikuje pouze tam, kde lokál je prázdný nebo se data liší.
       Vrací { moduleKey: data } — co se podařilo stáhnout. */
    async function pullAllModuleData(options) {
        if (!_userSheetUrl()) return null;
        var opts = options || {};
        var preferRemote = !!opts.preferRemote; // pokud true → cloud přepíše lokál bez ptaní
        var keys = Object.keys(MODULE_DATA_REGISTRY);
        var loaded = {};
        for (var i = 0; i < keys.length; i++) {
            var modKey = keys[i];
            var sKey = MODULE_DATA_REGISTRY[modKey];
            var remote;
            try { remote = await pullModuleData(modKey); }
            catch (e) { remote = null; }
            if (remote == null) continue;
            loaded[modKey] = remote;
            var localRaw = lsGet(sKey);
            var local = null;
            try { local = localRaw ? JSON.parse(localRaw) : null; } catch (e) { local = null; }
            if (preferRemote || _isEmpty(local)) {
                try { lsSet(sKey, JSON.stringify(remote)); } catch (e) {}
                try {
                    window.dispatchEvent(new CustomEvent('fc-module-data-updated', {
                        detail: { module: modKey, data: remote, storageKey: sKey, source: 'global-pull' }
                    }));
                } catch (e) {}
                // Označ že už jsme to v rámci session pulled — autoSyncModuleViaMeta initialPull pak nebude duplikovat
                try { sessionStorage.setItem('fc_pulled_' + modKey, '1'); } catch (e) {}
            } else {
                // Lokál neprázdný a remote se liší → necháme rozhodnutí na auto-sync uvnitř modulu
                // (initialPull v autoSyncModuleViaMeta ukáže konflikt dialog jen pokud
                // se data reálně liší; my jsme jen "ohřáli" cache toho, co je v cloudu).
            }
        }
        return loaded;
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
    /* Fuzzy fingerprint pro položky bez ID — používáme stabilní podmnožinu polí
       (nikoliv timestamp, který se může nepatrně lišit). Pokud položka má ID,
       toto se nezavolá. */
    function _fingerprint(item) {
        if (!item || typeof item !== 'object') return JSON.stringify(item);
        // Vyber stabilní pole, která bývají u všech modulů použita.
        var picks = [
            item.info, item.pohyb, item.ucet, item.suma, item.origMena,    // PV transakce
            item.name, item.amount, item.currency, item.cycle,             // Předplatná
            item.target, item.initial, item.monthly, item.type,            // Spoření cíle
            item.principal, item.rate, item.termMonths,                    // Půjčky
            item.linkedTxId
        ].filter(function (v) { return v !== undefined; });
        if (picks.length === 0) {
            // Fallback — celý objekt
            try { return JSON.stringify(item); } catch (e) { return String(item); }
        }
        return picks.map(function (v) { return String(v).toLowerCase().trim(); }).join('|');
    }

    function _mergeArraysById(local, remote) {
        // Union podle id; v případě konfliktu lokální verze vyhrává.
        // Položky bez ID se deduplikují podle fingerprint (nejčastěji bývá
        // duplikace způsobena tím, že modul po importu/restoru přidělil novou
        // sadu ID — fingerprint to zachytí).
        var byId = {};
        var localById = {}, remoteById = {};
        var fpLocal = {}, fpRemote = {};
        (Array.isArray(remote) ? remote : []).forEach(function (it) {
            if (it && it.id != null) {
                byId[it.id] = { remote: it };
                remoteById[it.id] = true;
            } else {
                fpRemote[_fingerprint(it)] = it;
            }
        });
        (Array.isArray(local) ? local : []).forEach(function (it) {
            if (it && it.id != null) {
                if (byId[it.id]) byId[it.id].local = it; // local wins
                else byId[it.id] = { local: it };
                localById[it.id] = true;
            } else {
                fpLocal[_fingerprint(it)] = it;
            }
        });
        var out = [];
        Object.keys(byId).forEach(function (k) {
            var pair = byId[k];
            out.push(pair.local || pair.remote);
        });
        // Sloučení položek bez ID podle fingerprint — duplicity zmizí.
        var seenFp = {};
        Object.keys(fpLocal).forEach(function (fp) {
            if (!seenFp[fp]) { out.push(fpLocal[fp]); seenFp[fp] = true; }
        });
        Object.keys(fpRemote).forEach(function (fp) {
            if (!seenFp[fp]) { out.push(fpRemote[fp]); seenFp[fp] = true; }
        });
        return out;
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

        // Cross-iframe sync: když jiný iframe (např. Příjmy přes syncCrossModules)
        // zapíše do našeho storageKey, browser pošle `storage` event do ostatních
        // window's stejného origin. Re-emitneme jako 'fc-module-data-updated',
        // aby modul re-renderoval, A NAVÍC pushneme do cloudu — protože setItem
        // hook ve zdrojovém iframu naše storageKey neoznačí jako svůj (kontroluje
        // svůj vlastní). (Same-window setItem 'storage' event nevolá, takže smyčka nehrozí.)
        window.addEventListener('storage', function (e) {
            if (!e || e.key !== storageKey) return;
            var parsed = null;
            try { parsed = e.newValue ? JSON.parse(e.newValue) : null; } catch (err) {}
            // Push do cloudu (debounced; ostatní iframe by toho ani neměl vědět)
            if (parsed != null) {
                scheduleModulePush(moduleName, parsed);
            }
            // Re-render modulu
            try {
                window.dispatchEvent(new CustomEvent('fc-module-data-updated', {
                    detail: { module: moduleName, data: parsed, storageKey: storageKey, source: 'cross-iframe' }
                }));
            } catch (err) {}
        });

        /* Zapíše data do localStorage a pošle event, KTERÝ MODUL POSLOUCHÁ A SÁM SE PŘEKRESLÍ.
           Žádný location.reload — destruktivní uprostřed psaní (předchozí verze flickerovala). */
        function applyDataAndNotify(newData) {
            _suppressPushOnce = true;
            try { localStorage.setItem(storageKey, JSON.stringify(newData)); } catch (e) {}
            try {
                window.dispatchEvent(new CustomEvent('fc-module-data-updated', {
                    detail: { module: moduleName, data: newData, storageKey: storageKey }
                }));
            } catch (e) {}
        }

        function initialPull() {
            if (!_userSheetUrl()) return;
            // Anti-loop: pull jen jednou za session per modul. Po dalším tab-switchi
            // (iframe se znovu načte) bychom jinak fetchovali znovu a při jakékoliv
            // serializační odlišnosti by ekran flickerl.
            var sessKey = 'fc_pulled_' + moduleName;
            try { if (sessionStorage.getItem(sessKey) === '1') return; } catch (e) {}
            try { sessionStorage.setItem(sessKey, '1'); } catch (e) {}

            pullModuleData(moduleName).then(function (remote) {
                if (remote == null) return; // cloud prázdný → necháme lokál

                var localRaw = lsGet(storageKey);
                var local = null;
                try { local = localRaw ? JSON.parse(localRaw) : null; } catch (e) { local = null; }

                // Lokál je prázdný → použij remote bez ptaní (žádný konflikt, žádný reload).
                if (_isEmpty(local)) {
                    applyDataAndNotify(remote);
                    return;
                }
                // Identické → nic neudělej.
                try {
                    if (JSON.stringify(local) === JSON.stringify(remote)) return;
                } catch (e) {}

                // Rozdíl → zeptej se uživatele. Konflikt dialog je opt-in akce,
                // takže tady reload v případě výběru 'remote' nebo 'merge' DÁVÁ smysl —
                // uživatel ho vědomě potvrdil.
                showConflictDialog(moduleName, local, remote, function (choice) {
                    if (choice === 'remote') {
                        applyDataAndNotify(remote);
                    } else if (choice === 'local') {
                        // Pošli lokál do cloudu, lokál zůstává.
                        pushModuleData(moduleName, local);
                    } else if (choice === 'merge') {
                        var merged = _mergeData(local, remote);
                        applyDataAndNotify(merged);
                        // Push merged do cloudu, ať druhé zařízení dostane sloučenou verzi.
                        pushModuleData(moduleName, merged);
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

    /* ════════════════════════════════════════════════════════════
       6.5) UI HELPERS — toast + sync indikátor
       ════════════════════════════════════════════════════════════
       Sjednocený toast pro všechny moduly, aby UX byl konzistentní.
       Sync indikátor vysílá CustomEvent 'fc-sync-state' s {busy:true|false},
       který parent index.html zachytí a anime status dot. */

    var _toastEl = null;
    function _ensureToastEl() {
        if (_toastEl && document.body && document.body.contains(_toastEl)) return _toastEl;
        var el = document.createElement('div');
        el.id = 'fc-toast';
        el.style.cssText = [
            'position:fixed', 'right:1rem', 'bottom:1rem', 'z-index:2147483646',
            'padding:0.7rem 1rem', 'border-radius:0.5rem', 'font-size:0.8rem',
            'font-family:Inter,system-ui,sans-serif', 'color:#fff',
            'box-shadow:0 10px 25px rgba(0,0,0,0.4)', 'opacity:0',
            'transform:translateY(8px)', 'transition:opacity .2s, transform .2s',
            'max-width:24rem', 'pointer-events:none'
        ].join(';');
        if (document.body) document.body.appendChild(el);
        else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(el); });
        _toastEl = el;
        return el;
    }
    var _toastTmr = null;
    function showToast(msg, kind, durationMs) {
        var el = _ensureToastEl();
        var colors = {
            success: '#15803d', error: '#b91c1c', info: '#0369a1', warn: '#b45309'
        };
        el.style.background = colors[kind] || colors.info;
        el.textContent = String(msg == null ? '' : msg);
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        clearTimeout(_toastTmr);
        _toastTmr = setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translateY(8px)';
        }, durationMs || 3000);
    }

    /* Sync indikátor — vysílá event do parent / index.html.
       Volitelný 2. argument `errored=true` označuje stav, kdy poslední pokus
       o sync selhal i po retry — parent může změnit barvu dotu na červenou. */
    function setSyncBusy(busy, errored) {
        try {
            window.dispatchEvent(new CustomEvent('fc-sync-state', { detail: { busy: !!busy, errored: !!errored } }));
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'fc-sync-state', busy: !!busy, errored: !!errored }, '*');
            }
        } catch (e) {}
    }

    /* ════════════════════════════════════════════════════════════
       6) CROSS-MODULE LINKING (bi-directional)
       ════════════════════════════════════════════════════════════
       Smazání položky s `linkedTxId` v podružném modulu (Spoření/Předplatná/Půjčky)
       může také smazat propojenou transakci v Příjmech & Výdaje. Modul před tím
       zeptá uživatele přes confirm(). */

    /* Smaže transakci s daným ID z FinanceAI_data v localStorage.
       Vrací true, pokud něco smazala, false jinak. */
    function deleteLinkedTransaction(linkedTxId) {
        if (linkedTxId == null) return false;
        try {
            var raw = localStorage.getItem('FinanceAI_data');
            if (!raw) return false;
            var arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return false;
            var before = arr.length;
            arr = arr.filter(function (t) { return t && t.id !== linkedTxId; });
            if (arr.length === before) return false;
            localStorage.setItem('FinanceAI_data', JSON.stringify(arr));
            return true;
        } catch (e) { return false; }
    }

    /* Označí transakci jako vyloučenou (isExcluded=true) místo smazání —
       zachová auditní stopu. */
    function excludeLinkedTransaction(linkedTxId) {
        if (linkedTxId == null) return false;
        try {
            var raw = localStorage.getItem('FinanceAI_data');
            if (!raw) return false;
            var arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return false;
            var found = false;
            arr = arr.map(function (t) {
                if (t && t.id === linkedTxId) { found = true; return Object.assign({}, t, { isExcluded: true }); }
                return t;
            });
            if (!found) return false;
            localStorage.setItem('FinanceAI_data', JSON.stringify(arr));
            return true;
        } catch (e) { return false; }
    }

    /* Najde transakci podle ID (pro confirmation dialog). */
    function findLinkedTransaction(linkedTxId) {
        if (linkedTxId == null) return null;
        try {
            var raw = localStorage.getItem('FinanceAI_data');
            if (!raw) return null;
            var arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return null;
            return arr.find(function (t) { return t && t.id === linkedTxId; }) || null;
        } catch (e) { return null; }
    }

    /* High-level prompt + delete. Vrací jednu z hodnot:
       - 'deleted' (uživatel zvolil smazat),
       - 'excluded' (uživatel zvolil jen vyloučit),
       - 'kept' (uživatel chce zachovat),
       - 'no-link' (linkedTxId neukazuje na žádnou tx — nic neudělá). */
    function promptHandleLinkedTransaction(linkedTxId, sourceLabel) {
        var tx = findLinkedTransaction(linkedTxId);
        if (!tx) return 'no-link';
        var preview = (tx.pohyb || '?') + ' · ' + (tx.info || '') + ' · ' +
                      (typeof tx.suma === 'number' ? tx.suma.toFixed(0) + ' Kč' : '');
        var msg = 'V Příjmech & Výdaje je propojený záznam:\n\n  ' + preview + '\n\n' +
                  'Chceš ho také smazat?\n\n' +
                  'OK = smazat\nZrušit = ponechat (zůstane v Příjmech, jen bez propojení)';
        // Browser confirm: 2 možnosti (OK/Cancel). Pro 3. možnost (exclude) by byl
        // potřeba vlastní modal — pro jednoduchost zatím jen smazat/ponechat.
        // Modul (caller) může předem nabídnout vyloučení jiným způsobem.
        try {
            if (confirm(msg)) {
                deleteLinkedTransaction(linkedTxId);
                return 'deleted';
            }
            return 'kept';
        } catch (e) { return 'kept'; }
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
            login:          login,
            register:       register,
            logout:         logout,
            isLoggedIn:     isLoggedIn,
            getSession:     getSession,
            changePassword: changePassword,
            renameUser:     renameUser,
            backendUrl:     FC_AUTH_URL
        },

        /* cloud sync */
        cloud: {
            pull:               pull,
            push:               push,
            scheduleSync:       scheduleSync,
            collectConfig:      collectConfig,
            applyConfig:        applyConfig,
            keys:               CLOUD_KEYS,
            /* module-data sync proti uživatelovu Sheetu */
            pushModule:         pushModuleData,
            pullModule:         pullModuleData,
            scheduleModulePush: scheduleModulePush,
            hasSheetsUrl:       function () { return !!_userSheetUrl(); },
            /* globální Export/Import/Sync (všechny moduly najednou) */
            moduleRegistry:     MODULE_DATA_REGISTRY,
            collectAllData:     collectAllModuleData,
            applyAllData:       applyAllModuleData,
            pushAllData:        pushAllModuleData,
            pullAllData:        pullAllModuleData
        },

        /* bi-directional cross-module linking */
        crossModule: {
            deleteLinkedTransaction:  deleteLinkedTransaction,
            excludeLinkedTransaction: excludeLinkedTransaction,
            findLinkedTransaction:    findLinkedTransaction,
            promptHandleLinked:       promptHandleLinkedTransaction
        },

        /* UI helpers — jednotný toast + sync indikátor */
        ui: {
            toast:        showToast,
            setSyncBusy:  setSyncBusy
        },

        /* Help modal — strukturovaná nápověda pro každý modul */
        help: {
            show: showHelpModal,
            hide: hideHelpModal
        }
    };

    /* ════════════════════════════════════════════════════════════
       HELP MODAL — strukturovaná nápověda pro každý modul
       ────────────────────────────────────────────────────────────
       Použití (z modulu):
         FinanceCommon.help.show({
           title: 'Příjmy & Výdaje',
           subtitle: 'Sledování transakcí a cashflow',
           sections: [
             { kind: 'intro',    heading: '🎯 K čemu slouží', body: '<p>...</p>' },
             { kind: 'steps',    heading: '📝 Postup', body: '<ol><li>...</li></ol>' },
             { kind: 'features', heading: '✨ Vychytávky', body: '<ul>...</ul>' },
             { kind: 'tips',     heading: '💡 Tipy & triky', body: '...' },
             { kind: 'linked',   heading: '🔗 Provázanost', body: '...' }
           ]
         });
       ════════════════════════════════════════════════════════════ */
    function ensureHelpStyles() {
        if (document.getElementById('fc-help-styles')) return;
        var st = document.createElement('style');
        st.id = 'fc-help-styles';
        st.textContent =
            '#fc-help-bg { position:fixed; inset:0; background:rgba(2,6,23,0.85); backdrop-filter:blur(6px); z-index:99999; display:none; align-items:flex-start; justify-content:center; padding:2rem 1rem; overflow-y:auto; }' +
            '#fc-help-bg.show { display:flex; }' +
            '#fc-help-box { background:#0f172a; border:1px solid #1e293b; border-radius:0.75rem; max-width:48rem; width:100%; box-shadow:0 25px 50px rgba(0,0,0,0.5); margin:auto; }' +
            '#fc-help-header { padding:1.25rem 1.5rem; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; position:sticky; top:0; background:#0f172a; border-radius:0.75rem 0.75rem 0 0; z-index:1; }' +
            '#fc-help-title { font:600 1.1rem/1.3 Inter,sans-serif; color:#f8fafc; margin:0; }' +
            '#fc-help-subtitle { font:400 0.78rem/1.4 Inter,sans-serif; color:#64748b; margin:0.2rem 0 0; }' +
            '#fc-help-close { background:transparent; border:1px solid #1e293b; color:#94a3b8; width:2rem; height:2rem; border-radius:0.4rem; cursor:pointer; font:500 1rem Inter,sans-serif; flex-shrink:0; transition:all .15s; }' +
            '#fc-help-close:hover { background:#1e293b; color:#f8fafc; }' +
            '#fc-help-body { padding:1.25rem 1.5rem 1.5rem; }' +
            '.fc-help-section { margin-bottom:1.5rem; padding:1rem 1.1rem; border-radius:0.55rem; border:1px solid #1e293b; background:#020617; }' +
            '.fc-help-section:last-child { margin-bottom:0; }' +
            '.fc-help-section h3 { font:600 0.92rem/1.3 Inter,sans-serif; color:#f8fafc; margin:0 0 0.7rem; display:flex; align-items:center; gap:0.4rem; }' +
            '.fc-help-section.kind-intro    { border-left:3px solid #38bdf8; }' +
            '.fc-help-section.kind-steps    { border-left:3px solid #a855f7; }' +
            '.fc-help-section.kind-features { border-left:3px solid #22c55e; }' +
            '.fc-help-section.kind-tips     { border-left:3px solid #fbbf24; background:rgba(251,191,36,0.05); }' +
            '.fc-help-section.kind-linked   { border-left:3px solid #f472b6; }' +
            '.fc-help-section.kind-warn     { border-left:3px solid #fb7185; background:rgba(244,63,94,0.05); }' +
            '.fc-help-section p { font:400 0.85rem/1.55 Inter,sans-serif; color:#cbd5e1; margin:0 0 0.6rem; }' +
            '.fc-help-section p:last-child { margin-bottom:0; }' +
            '.fc-help-section ul, .fc-help-section ol { font:400 0.85rem/1.55 Inter,sans-serif; color:#cbd5e1; padding-left:1.3rem; margin:0.3rem 0 0.6rem; }' +
            '.fc-help-section li { margin-bottom:0.35rem; }' +
            '.fc-help-section li:last-child { margin-bottom:0; }' +
            '.fc-help-section b, .fc-help-section strong { color:#f8fafc; font-weight:600; }' +
            '.fc-help-section code, .fc-help-section .kbd { font:500 0.78rem/1 "JetBrains Mono",monospace; background:#1e293b; color:#7dd3fc; padding:0.12rem 0.45rem; border-radius:0.25rem; }' +
            '.fc-help-section .example { margin-top:0.5rem; padding:0.6rem 0.8rem; background:#0f172a; border-left:2px solid #475569; border-radius:0 0.3rem 0.3rem 0; font:400 0.78rem/1.5 Inter,sans-serif; color:#94a3b8; }' +
            '.fc-help-section .example b { color:#cbd5e1; }' +
            '/* Light theme */' +
            'html.light #fc-help-bg { background:rgba(241,245,249,0.85); }' +
            'html.light #fc-help-box, html.light #fc-help-header { background:#ffffff; border-color:#e2e8f0; }' +
            'html.light #fc-help-title { color:#0f172a; }' +
            'html.light #fc-help-subtitle { color:#64748b; }' +
            'html.light #fc-help-close { background:#f8fafc; color:#64748b; border-color:#e2e8f0; }' +
            'html.light .fc-help-section { background:#f8fafc; border-color:#e2e8f0; }' +
            'html.light .fc-help-section h3 { color:#0f172a; }' +
            'html.light .fc-help-section p, html.light .fc-help-section ul, html.light .fc-help-section ol { color:#475569; }' +
            'html.light .fc-help-section b, html.light .fc-help-section strong { color:#0f172a; }' +
            'html.light .fc-help-section code, html.light .fc-help-section .kbd { background:#e2e8f0; color:#0369a1; }' +
            'html.light .fc-help-section .example { background:#fff; color:#64748b; border-color:#cbd5e1; }';
        document.head.appendChild(st);
    }

    function ensureHelpModal() {
        if (document.getElementById('fc-help-bg')) return;
        ensureHelpStyles();
        var bg = document.createElement('div');
        bg.id = 'fc-help-bg';
        bg.innerHTML =
            '<div id="fc-help-box" role="dialog" aria-modal="true" aria-labelledby="fc-help-title">' +
              '<header id="fc-help-header">' +
                '<div>' +
                  '<h2 id="fc-help-title">Nápověda</h2>' +
                  '<p id="fc-help-subtitle"></p>' +
                '</div>' +
                '<button id="fc-help-close" type="button" aria-label="Zavřít">×</button>' +
              '</header>' +
              '<div id="fc-help-body"></div>' +
            '</div>';
        bg.addEventListener('click', function (e) { if (e.target === bg) hideHelpModal(); });
        if (document.body) document.body.appendChild(bg);
        else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(bg); });
        // Close button
        setTimeout(function () {
            var btn = document.getElementById('fc-help-close');
            if (btn) btn.addEventListener('click', hideHelpModal);
        }, 0);
        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var b = document.getElementById('fc-help-bg');
                if (b && b.classList.contains('show')) hideHelpModal();
            }
        });
    }

    function showHelpModal(content) {
        ensureHelpModal();
        if (!content) return;
        var titleEl    = document.getElementById('fc-help-title');
        var subtitleEl = document.getElementById('fc-help-subtitle');
        var bodyEl     = document.getElementById('fc-help-body');
        var bg         = document.getElementById('fc-help-bg');
        if (!titleEl || !bodyEl || !bg) return;
        titleEl.textContent    = content.title || 'Nápověda';
        subtitleEl.textContent  = content.subtitle || '';
        subtitleEl.style.display = content.subtitle ? '' : 'none';
        var html = '';
        (content.sections || []).forEach(function (s) {
            var kind = s.kind || 'intro';
            html += '<section class="fc-help-section kind-' + kind + '">' +
                      '<h3>' + (s.heading || '') + '</h3>' +
                      (s.body || '') +
                    '</section>';
        });
        bodyEl.innerHTML = html;
        bg.classList.add('show');
        document.body.style.overflow = 'hidden'; // prevent background scroll
    }

    function hideHelpModal() {
        var bg = document.getElementById('fc-help-bg');
        if (bg) bg.classList.remove('show');
        document.body.style.overflow = '';
    }
})();
