/* ════════════════════════════════════════════════════════════════════
   tailwind-loader.js — cache layer pro Tailwind CDN
   ────────────────────────────────────────────────────────────────────
   Tailwind CDN ('cdn.tailwindcss.com') je JIT kompilátor: stáhne ~70 KB JS,
   parsuje DOM a vygeneruje CSS — to trvá 2-4 s při každém otevření modulu.
   Tenhle skript ten výsledek cachuje v localStorage. Po prvním načtení
   modulu (cache miss) se Tailwind spustí normálně a my zachytíme jeho
   <style> výstup. Při dalším otevření (cache hit) injektneme CSS přímo
   a CDN vůbec neloadneme → loading <500 ms místo 5 s.

   Cache klíč obsahuje:
     - název modulu (location.pathname, normalizovaný)
     - "verze" CSS pro případ změny tailwind-loader.js samotného
   ════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var VERSION = 'v2';
    var CACHE_PREFIX = 'fc_tw_css_';

    /* Klíč modulu — co odlišuje jeden modul od druhého.
       Pozn.: skript běží v <head>, querySelectorAll nad body by ještě nic nevrátil,
       takže nemůžeme rozlišovat cache podle obsahu DOMu — řešíme to invalidací
       přes VERSION konstantu (zvedneš ji ručně, když do HTML přidáš nové Tailwind třídy
       a chceš všem uživatelům vyčistit cache). */
    function moduleKey() {
        var path = (location.pathname || '').replace(/[^a-zA-Z0-9._-]/g, '_');
        return CACHE_PREFIX + VERSION + '_' + path;
    }

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    /* Vrátí cached CSS pro modul, pokud existuje — jinak null. */
    function getCachedCSS() {
        try {
            var raw = lsGet(moduleKey());
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (!obj || !obj.css || typeof obj.css !== 'string') return null;
            return obj.css;
        } catch (e) { return null; }
    }

    function setCachedCSS(css) {
        try {
            lsSet(moduleKey(), JSON.stringify({
                css: css,
                version: VERSION,
                savedAt: new Date().toISOString()
            }));
        } catch (e) {}
    }

    /* Loaduje Tailwind CDN poprvé a po kompilaci zachytí výsledný CSS. */
    function loadCDNAndCache() {
        var script = document.createElement('script');
        script.src = 'https://cdn.tailwindcss.com';
        script.onload = function () {
            // Tailwind po loadu naskenuje DOM a injektne <style> s generovaným CSS.
            // Po 1.5 s + 3 s + 5 s zkusíme zachytit (záložně, kdyby compilace trvala déle).
            var captured = false;
            function tryCapture() {
                if (captured) return;
                var css = '';
                var styles = document.head.querySelectorAll('style');
                for (var i = 0; i < styles.length; i++) {
                    var t = styles[i].textContent || '';
                    // Tailwind generovaný CSS obsahuje vždy --tw-* CSS proměnné
                    if (t.indexOf('--tw-') !== -1) {
                        css += t + '\n';
                    }
                }
                if (css.length > 1000) {
                    captured = true;
                    setCachedCSS(css);
                }
            }
            setTimeout(tryCapture, 1500);
            setTimeout(tryCapture, 3000);
            setTimeout(tryCapture, 5000);
        };
        document.head.appendChild(script);
    }

    /* MAIN: snaž se cache, jinak CDN. */
    var cached = getCachedCSS();
    if (cached) {
        // Cache hit — injektni přímo a CDN neload.
        var st = document.createElement('style');
        st.id = 'fc-tw-cached';
        st.setAttribute('data-fc-tw-cached', '1');
        st.textContent = cached;
        document.head.appendChild(st);
    } else {
        // Cache miss — loadni CDN, captureni výsledek na příště.
        loadCDNAndCache();
    }
})();
