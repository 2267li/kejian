'use strict';
// Build replaces this value with a content hash, keeping each app shell coherent.
const CACHE = 'kejian-shell-__BUILD_ID__';
const ASSETS = ['./', './index.html', './style.css', './core.js', './app.js', './pwa.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('kejian-shell-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Only serve known app files; no user data, arbitrary pages or third-party caching.
  const asset = ASSETS.find(item => new URL(item, self.registration.scope).pathname === url.pathname);
  if (!asset) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    return await cache.match(new URL(asset, self.registration.scope).href) || fetch(event.request);
  }));
});
