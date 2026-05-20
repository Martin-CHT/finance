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
     - "verze" CSS pro případ změny tailwind-loader.js
     - hash použitých class atributů v DOM (pokud se HTML změní, cache se
       invaliduje a Tailwind se spustí znovu)
   ════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var VERSION = 'v1';
    var CACHE_PREFIX = 'fc_tw_css_';

    /* Klíč modulu — co odlišuje jeden modul od druhého. */
    function moduleKey() {
        var path = (location.pathname || '').replace(/[^a-zA-Z0-9._-]/g, '_');
        return CACHE_PREFIX + VERSION + '_' + path;
    }

    /* Hash class atributů v DOM — odhalí, že se HTML změnilo a stávající CSS
       nemusí pokrýt nové třídy. Jednoduchý FNV-1a hash, ne kryptografický. */
    function htmlClassHash() {
        var s = '';
        var nodes = document.querySelectorAll('[class]');
        for (var i = 0; i < nodes.length; i++) {
            s += nodes[i].className + ' ';
        }
        // FNV-1a
        var h = 0x811c9dc5;
        for (var j = 0; j < s.length; j++) {
            h ^= s.charCodeAt(j);
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(16);
    }

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    /* Vrátí cached CSS pro modul, pokud existuje a hash sedí — jinak null. */
    function getCachedCSS() {
        try {
            var raw = lsGet(moduleKey());
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (!obj || !obj.css) return null;
            var currentHash = htmlClassHash();
            if (obj.hash !== currentHash) return null; // HTML se změnilo
            return obj.css;
        } catch (e) { return null; }
    }

    function setCachedCSS(css) {
        try {
            lsSet(moduleKey(), JSON.stringify({
                css: css,
                hash: htmlClassHash(),
                savedAt: new Date().toISOString()
            }));
        } catch (e) {}
    }

    /* Loaduje Tailwind CDN poprvé a po kompilaci zachytí výsledný CSS. */
    function loadCDNAndCache() {
        var script = document.createElement('script');
        script.src = 'https://cdn.tailwindcss.com';
        script.onload = function () {
            // Tailwind po loadu naskenuje DOM a injektne <style id="tailwind-cdn-css">
            // (přesný ID se mění mezi verzemi, hledáme tedy obecně).
            // Dáme mu 2 s na kompilaci (na pomalém HW i víc).
            var captured = false;
            function tryCapture() {
                if (captured) return;
                var css = '';
                var styles = document.head.querySelectorAll('style');
                for (var i = 0; i < styles.length; i++) {
                    var t = styles[i].textContent || '';
                    // Tailwind generovaný CSS obsahuje vždy --tw-* CSS proměnné
                    if (t.indexOf('--tw-') !== -1 || t.indexOf('tailwindcss') !== -1) {
                        css += t + '\n';
                    }
                }
                if (css.length > 1000) {
                    captured = true;
                    setCachedCSS(css);
                }
            }
            setTimeout(tryCapture, 1500);
            setTimeout(tryCapture, 3000); // záloha
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
