const CACHE = 'pcalc11111111-v3';
const ASSETS = ['index.html', 'styles.css', 'app.js', 'icon.svg', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

function isAppRoot(url) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  return path === '/' || path.endsWith('/index.html');
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation (opening the app from home screen or a link): serve index.html from cache when available
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        if (isAppRoot(url)) {
          return caches.match('index.html').then((cachedIndex) => cachedIndex || fetch(e.request));
        }
        return fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          return res;
        });
      }).catch(() => caches.match('index.html')).then((res) => res || caches.match('index.html'))
    );
    return;
  }

  // Script, style, and other same-origin assets: cache-first so offline works without leaving tab open
  if (e.request.destination === 'script' || e.request.destination === 'style' || e.request.destination === 'document') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Manifest, icon, etc.: try cache first
  if (url.pathname.endsWith('manifest.json') || url.pathname.endsWith('icon.svg')) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});
