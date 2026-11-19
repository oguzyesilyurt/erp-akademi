// ERP Akademi service worker: uygulama kabuğunu ve veriyi önbelleğe alır.
// Herhangi bir dosya değiştiğinde CACHE_VERSION artırılmalı; etkinleşme sırasında
// "erp-akademi-" önekli eski önbellekler silinir.
const CACHE_VERSION = 'v15';
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
  './css/docs.css',
  './css/testlab.css',
  './css/c4c.css',
  './css/mm.css',
  './css/fi.css',
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
  './js/markdown.js',
  './js/docs.js',
  './js/users-page.js',
  './js/release.js',
  './js/testlab.js',
  './js/c4c.js',
  './js/mm.js',
  './js/fi.js',
  './js/demo-reset.js',
  './js/settings-page.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './data/tracks.json',
  './data/company.json',
  './data/roles.json',
  './data/releases.json',
  './data/docs/index.json',
  './data/docs/glossary.json',
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
      // Dokümantasyon makaleleri (index.json'daki tüm .md dosyaları)
      try {
        const res = await cache.match('./data/docs/index.json');
        const { articles = [] } = await res.json();
        await cache.addAll(articles.map((a) => `./data/docs/${encodeURIComponent(a.slug)}.md`));
      } catch (e) {
        /* makaleler ilk açılışta önbelleğe alınır */
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
