/*  ════════════════════════════════════════════════════════════════════
    finance-common.js
    Společný most mezi sjednoceným "Nastavení.html" a všemi moduly.
    Vkládá se do KAŽDÉHO HTML modulu (Investice, Příjmy, Spoření,
    Půjčky, Fondy, Majetek). Soubor je idempotentní a defenzivní —
    nikdy nepřepíše hodnoty, které modul aktivně mění za běhu.

    Co dělá:
      1) Načte ze cookies/localStorage sjednocené klíče (AI klíče,
         Google Sheets URL, téma, pořadí) a doplní je do legacy klíčů,
         které jednotlivé moduly historicky používají. Obousměrná
         migrace, aby starší prohlížeč s daty pouze ve starých klíčích
         dostal hodnoty do sjednocených.
      2) Vloží do pravého horního rohu plovoucí tlačítko "Nastavení",
         které otevře ./Nastavení.html — odkaz na sjednocenou
         konfiguraci. Tlačítko ladí s tmavým i světlým motivem.
      3) Naslouchá postMessage typu "finance-theme" a aplikuje téma
         (pro případ, že modul běží uvnitř Index.html iframe).
    ════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var COOKIE_DAYS = 365;

    /* ── cookie helpers ── */
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
    function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v == null ? '' : v); } catch (e) {} }

    function readUnified(key) {
        return lsGet(key) || getCookie(key);
    }
    function writeUnified(key, value) {
        if (value == null || value === '') return;
        lsSet(key, value);
        setCookie(key, value, COOKIE_DAYS);
    }

    /* ────────────────────────────────────────────────────────────────
       1) Migrace sjednocené ↔ legacy
       ──────────────────────────────────────────────────────────────── */

    /* AI klíče jsou už ve všech modulech nazvané shodně, ale některé
       moduly je ukládají jen do cookie, jiné navíc do localStorage.
       Sjednotíme: hodnota = max(cookie, localStorage), pak zapíšeme
       do obou. */
    ['groq_api_key', 'gemini_api_key', 'ai_provider'].forEach(function (key) {
        var v = readUnified(key);
        if (v) writeUnified(key, v);
    });

    /* Google Sheets URL — jeden sjednocený zdroj `finance_sheets_url`
       převedeme i do legacy klíčů, které jednotlivé moduly hledají. */
    var legacySheetsKeys = [
        'google_sync_pension',     // Investice/Penze
        'FinanceAI_api',           // Příjmy & Výdaje (primární)
        'google_sync_finance_ai',  // Příjmy & Výdaje (cookie)
        'f_pro_vFinal_api',        // Příjmy & Výdaje (legacy)
        'f_vProFinal_api',         // Příjmy & Výdaje (legacy)
        'google_sync_pujcky',      // Půjčky
        'google_sync_api',         // Spoření
        'google_sync_fondy'        // Fondy (zavádíme nový)
    ];

    var unifiedSheets = readUnified('finance_sheets_url');
    if (!unifiedSheets) {
        // pokud sjednocený ještě neexistuje, převezmeme první nalezený legacy
        for (var i = 0; i < legacySheetsKeys.length; i++) {
            var v = readUnified(legacySheetsKeys[i]);
            if (v && /^https?:\/\//.test(v)) { unifiedSheets = v; writeUnified('finance_sheets_url', v); break; }
        }
    }
    if (unifiedSheets) {
        legacySheetsKeys.forEach(function (k) {
            // přepíše legacy klíče pouze pokud jsou prázdné nebo se liší
            if (readUnified(k) !== unifiedSheets) writeUnified(k, unifiedSheets);
        });
    }

    /* Téma — master `finance_theme`, aliasy do všech historických klíčů. */
    var theme = readUnified('finance_theme') || 'dark';
    ['finance_theme', 'pension_theme', 'prijmy_vydaje_theme',
     'sporeni_theme', 'pujcky_theme', 'majetek_theme'].forEach(function (k) {
        writeUnified(k, theme);
    });

    /* ────────────────────────────────────────────────────────────────
       2) Plovoucí tlačítko "Nastavení" v pravém horním rohu
       ──────────────────────────────────────────────────────────────── */
    function injectSettingsButton() {
        if (document.getElementById('fc-settings-fab')) return;

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
        a.title = 'Sjednocené nastavení (AI klíče, Google Sheets, pořadí modulů)';
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

    /* ────────────────────────────────────────────────────────────────
       3) postMessage handler pro téma (modul jako iframe v Index.html)
       ──────────────────────────────────────────────────────────────── */
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

    /* Pomocné API pro moduly: vystavíme jednoduché globální helpery, kdyby
       interní logika modulu potřebovala číst sjednocenou Google Sheets URL. */
    window.FinanceCommon = {
        getSheetsUrl: function () { return readUnified('finance_sheets_url'); },
        getSheetsToken: function () { return readUnified('finance_sheets_token'); },
        getApiKey: function (provider) {
            return readUnified(provider === 'gemini' ? 'gemini_api_key' : 'groq_api_key');
        },
        getCookie: getCookie,
        setCookie: setCookie
    };
})();
