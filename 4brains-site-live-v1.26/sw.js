/* ==========================================================================
   sw.js — offline cache for the roadshow.

   After the first online visit the whole site (and any renders that have
   been viewed) is served from cache, so it keeps working on hall wifi that
   drops out. Fonts from Google are cached at runtime too.

   DEPLOYING AN UPDATE: bump VERSION below. Old caches are deleted on activate.
   Only registers over http(s) — opening index.html from disk skips it.
   ========================================================================== */
const VERSION = "v1.26";
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/styles.css',
  'js/data.js', 'js/qr.js', 'js/app.js',
  'assets/brand/logo-mark.png', 'assets/brand/logo-lockup.png', 'assets/brand/logo-lockup-tagline.png', 'assets/brand/favicon-64.png',
  'assets/brand/apple-touch-icon.png', 'assets/brand/icon-192.png', 'assets/brand/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  const isOwn = url.origin === self.location.origin;
  if (!isFont && !isOwn) return;

  // Cache-first for everything we own and for fonts; refresh in the background.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
