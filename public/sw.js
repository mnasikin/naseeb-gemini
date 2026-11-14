const CACHE_PREFIX = 'naseeb-offline-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(OFFLINE_PAGE, { cache: 'reload', credentials: 'omit' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const oldCaches = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    await Promise.all(oldCaches.map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  if (url.origin !== self.location.origin || path === '/api' || path.startsWith('/api/')) return;

  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(OFFLINE_PAGE)) ?? Response.error();
  }));
});
