// Our Days — service worker: keep the app openable offline.
// The app is a single file, so caching the shell caches essentially everything.
// Sync traffic (/api/*) is never cached — it must always hit the live server.
const CACHE = 'ourdays-v1';
const SHELL = ['/', '/index.html', '/sw.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;          // sync + media: always network

  if (req.mode === 'navigate') {                          // app shell: fresh when online, cached when not
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('/', cp)); return r; })
        .catch(() => caches.match('/').then(m => m || caches.match('/index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(m => m || fetch(req).then(r => {
      if (r.ok && url.origin === location.origin) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return r;
    }))
  );
});
