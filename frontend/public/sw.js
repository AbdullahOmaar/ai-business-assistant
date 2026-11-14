// Keep each worker release isolated so a failed install cannot delete the active worker's cache.
const CACHE_NAME = 'aba-shell-v1.3.9-unknown-v2';
const CACHE_PREFIX = 'aba-shell-';
const SHELL_URLS = [
  // Public client bootstrap config; this contains no server credentials or business records.
  '/runtime-config.json',
  '/i18n/ar.json',
  '/i18n/en.json',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL_URLS);

      // Cache only the complete public app shell and same-origin JS/CSS bundles.
      // Never cache API calls, auth requests, or business records.
      const response = await fetch('/');
      if (!response.ok) {
        throw new Error('App shell cache request failed (' + response.status + ').');
      }

      const html = await response.clone().text();
      await cache.put('/', response);
      const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))(?:\?[^\"]*)?"/g)]
        .map((match) => new URL(match[1], self.location.origin))
        .filter((url) => url.origin === self.location.origin && !url.pathname.startsWith('/api/'))
        .map((url) => url.href))];
      // Do not replace a working worker with a partial offline shell.
      await Promise.all(assets.map((assetUrl) => cache.add(assetUrl)));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Runtime config is public bootstrap data. Refresh it online, but keep the last
  // successful version available when the network is unavailable.
  if (/^\/i18n\/(?:ar|en)\.json$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(url.pathname, response.clone());
          return response;
        }
        return (await cache.match(url.pathname)) || response;
      } catch {
        return (await cache.match(url.pathname)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname === '/runtime-config.json') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/runtime-config.json', response.clone()).catch(() => undefined);
          return response;
        }
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/runtime-config.json')) || response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/runtime-config.json')) || Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('/')) || Response.error();
    }));
    return;
  }

  if (/\.(?:js|css|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || fetch(request);
    })());
  }
});
