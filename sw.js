/* ════════════════════════════════════════════════════════════════════
   sw.js — Service Worker pro Finance Terminal
   ────────────────────────────────────────────────────────────────────
   Strategie:
     • App shell (HTML/CSS/JS soubory) → cache-first (rychlé otevření offline).
     • Externí CDN (Tailwind, Lucide, Chart.js, fonts) → stale-while-revalidate
       (vrátíme z cache hned, na pozadí stáhneme novou verzi).
     • Google Apps Script (cloud sync) → network-only — nikdy necachovat,
       jsou to user-specific data + tokeny.
     • Google Fonts → cache-first (mění se zřídka).
   ════════════════════════════════════════════════════════════════════ */

const VERSION = 'fc-v3';
const APP_CACHE = 'fc-app-' + VERSION;
const CDN_CACHE = 'fc-cdn-' + VERSION;

/* App shell — vše, co je třeba pro offline UX. */
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './Soubory/finance-common.js',
  './Soubory/tailwind-loader.js',
  './Soubory/Nastavení.html',
  './Soubory/Příjmy-Výdaje.html',
  './Soubory/Spoření.html',
  './Soubory/Půjčky.html',
  './Soubory/Investice-penze.html',
  './Soubory/Fondy.html',
  './Soubory/Fondy-podrobně.html',
  './Soubory/fondy-podrobně-config.js',
  './Soubory/Majetek-odpisy.html',
  './Soubory/Předplatná.html',
  './Soubory/Pre-FI-RE.html',
  './Soubory/Broker.html',
  './Soubory/Energie.html',
  './BTC/index.html',
  './BTC/css/styles.css',
  './BTC/js/app.js',
  './BTC/js/storage.js',
  './BTC/js/api-btc.js',
  './BTC/js/algorithm.js',
  './BTC/js/ai.js',
  './BTC/js/chart-view.js'
];

self.addEventListener('install', (e) => {
  // Pre-cache app shell. addAll selže, pokud kterýkoli soubor neexistuje
  // (např. byl přejmenován) — proto fetch+put po jednom, fail-tolerant.
  e.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(APP_FILES.map(async (url) => {
      try { await cache.add(url); } catch (_) { /* ignore missing */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  // Smaž staré verze cachí
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n.startsWith('fc-') && n !== APP_CACHE && n !== CDN_CACHE)
           .map(n => caches.delete(n))
    );
    self.clients.claim();
  })());
});

function isCloudSync(req) {
  const u = req.url || '';
  return u.includes('script.google.com') || u.includes('googleusercontent.com');
}
function isAIProvider(req) {
  const u = req.url || '';
  return u.includes('api.groq.com') ||
         u.includes('generativelanguage.googleapis.com') ||
         u.includes('api.openai.com');
}
function isAppShell(req) {
  // Stejný origin jako SW
  return new URL(req.url).origin === self.location.origin;
}
function isCDN(req) {
  const u = req.url || '';
  return u.includes('cdn.tailwindcss.com') ||
         u.includes('unpkg.com') ||
         u.includes('jsdelivr.net') ||
         u.includes('fonts.googleapis.com') ||
         u.includes('fonts.gstatic.com');
}
function isStooqOrFinAPI(req) {
  const u = req.url || '';
  return u.includes('stooq.com') ||
         u.includes('query1.finance.yahoo.com') ||
         u.includes('api.cnb.cz');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // POSTy a další non-GET nikdy necachovat
  if (req.method !== 'GET') return;

  // Cloud sync, AI API, finanční API → network-only (user-specific / live data)
  if (isCloudSync(req) || isAIProvider(req) || isStooqOrFinAPI(req)) {
    return; // necháme default network handling
  }

  // App shell → cache-first
  if (isAppShell(req)) {
    e.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone()).catch(() => {});
        return resp;
      } catch (err) {
        // Offline + ne v cache → vrátíme nejbližší (např. index.html)
        const fallback = await cache.match('./index.html');
        return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // CDN soubory → stale-while-revalidate
  if (isCDN(req)) {
    e.respondWith((async () => {
      const cache = await caches.open(CDN_CACHE);
      const hit = await cache.match(req);
      const networkPromise = fetch(req).then(resp => {
        if (resp.ok) cache.put(req, resp.clone()).catch(() => {});
        return resp;
      }).catch(() => null);
      return hit || (await networkPromise) || new Response('CDN unavailable', { status: 503 });
    })());
    return;
  }
});

// Komunikace s parent stránkou (skip waiting on update)
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
