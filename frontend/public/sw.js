const CACHE_NAME = 'aba-shell-v3';
const SHELL_URLS = [
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_URLS);

    // Cache only the static JS/CSS bundles referenced by the app shell.
    // Never cache API calls, auth requests, or business records.
    const response = await fetch('/');
    if (response.ok) {
      const html = await response.clone().text();
      await cache.put('/', response);
      const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))(?:\?[^"]*)?"/g)]
        .map((match) => new URL(match[1], self.location.origin))
        .filter((url) => url.origin === self.location.origin && !url.pathname.startsWith('/api/'));
      await Promise.allSettled(assets.map((url) => cache.add(url.href)));
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }

  if (/\.(?:js|css|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
