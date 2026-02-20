const CACHE = 'pcalc11111111-v4';
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

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request).then((c) => c || caches.match('index.html')))
    );
    return;
  }

  if (e.request.destination === 'script' || e.request.destination === 'style' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if (url.pathname.endsWith('manifest.json') || url.pathname.endsWith('icon.svg')) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});
