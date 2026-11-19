// ERP Akademi service worker: uygulama kabuğunu ve veriyi önbelleğe alır.
// Herhangi bir dosya değiştiğinde CACHE_VERSION artırılmalı; etkinleşme sırasında
// "erp-akademi-" önekli eski önbellekler silinir.
const CACHE_VERSION = 'v7';
const CACHE_PREFIX = 'erp-akademi-';
const CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './css/company.css',
  './css/learn.css',
  './css/workflow.css',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/icons.js',
  './js/ui.js',
  './js/company.js',
  './js/track-content.js',
  './js/sim-quote.js',
  './js/quote-doc.js',
  './js/bug-hunt.js',
  './js/quiz.js',
  './js/auth.js',
  './js/quotes.js',
  './js/inbox.js',
  './js/roles-page.js',
  './js/erp.js',
  './js/interface-page.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './data/tracks.json',
  './data/company.json',
  './data/roles.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // tracks.json'daki tüm yol dosyalarını da çevrimdışı için al
      try {
        const res = await cache.match('./data/tracks.json');
        const { tracks = [] } = await res.json();
        await cache.addAll(tracks.map((t) => `./data/tracks/${encodeURIComponent(t.id)}.json`));
      } catch (e) {
        /* yol dosyaları ilk kullanımda önbelleğe alınır */
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Sayfa gezinmeleri: önce ağ, çevrimdışıysa kabuk
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match('./index.html')) || Response.error())
    );
    return;
  }

  // Veri: önbellekten hemen ver, arka planda tazele (stale-while-revalidate)
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req, { ignoreSearch: true });
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached || Response.error());
        return cached || network;
      })()
    );
    return;
  }

  // Statik dosyalar: önce önbellek
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })()
  );
});
