const APP_VERSION = '5.1.5';
const SHELL_CACHE_NAME = `unoric-shell-${APP_VERSION}`;
const DATA_CACHE_NAME = `unoric-data-${APP_VERSION}`;
const CDN_ORIGINS = new Set([
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net'
]);
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/socios.css',
  './css/lotes.css',
  './css/pagos.css',
  './js/app.js?v=5.1.5',
  './js/config.js?v=5.1.5',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
];

function isCacheableResponse(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'cors');
}

function isSociosOrLotesRequest(url) {
  return url.pathname.includes('/rest/v1/unoric_socios') || url.pathname.includes('/rest/v1/unoric_lotes');
}

function shouldHandleWithNetworkFirst(request, url) {
  if (request.mode === 'navigate') return true;
  if (url.origin === self.location.origin) return true;
  return CDN_ORIGINS.has(url.origin);
}

async function addShellAssets(cache) {
  await Promise.allSettled(
    APP_SHELL_ASSETS.map((asset) => cache.add(asset))
  );
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  return fetch(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => addShellAssets(cache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE_NAME && key !== DATA_CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (isSociosOrLotesRequest(url)) {
    event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE_NAME));
    return;
  }

  if (shouldHandleWithNetworkFirst(event.request, url)) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE_NAME));
  }
});
