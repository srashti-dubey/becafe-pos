// Bump this whenever app files change — it forces old caches to clear.
const CACHE_VERSION = 'becafe-pos-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

// Cache each file individually (not cache.addAll) so ONE missing or
// failing file — e.g. an icon that 404s — can't silently break the
// entire install and leave the app with no offline support at all.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          fetch(url)
            .then((response) => {
              if (response.ok) return cache.put(url, response);
              console.warn('[sw] not caching (bad response):', url, response.status);
            })
            .catch((err) => {
              console.warn('[sw] not caching (fetch failed):', url, err);
            })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isNavigation = request.mode === 'navigate' || request.destination === 'document';

  if (isNavigation) {
    // Network-first: always try to get the latest page when online,
    // so a new deploy shows up immediately instead of an old cached
    // version sticking around. Falls back to the cached shell offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match(request))
        )
    );
    return;
  }

  // Everything else (manifest, icons, etc.): cache-first for speed,
  // fall back to network, and cache what we fetch along the way.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && new URL(request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => undefined);
    })
  );
});
