var CACHE_NAME = 'fencetrace-v17';
var TILE_CACHE_NAME = 'fencetrace-tiles-v1';
var MAX_TILE_CACHE = 2000; // ~200MB of tiles at ~100KB each
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/bom.js',
  '/js/i18n.js',
  '/js/regions.js',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/favicon.svg'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME && n !== TILE_CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Map tiles: cache-first (tiles don't change), separate cache with size limit
  var isTile = url.includes('tile.openstreetmap') || url.includes('mt0.google') ||
               url.includes('mt1.google') || url.includes('server.arcgisonline') ||
               url.includes('basemaps.cartocdn') || url.includes('tiles.stadiamaps');
  if (isTile) {
    e.respondWith(
      caches.open(TILE_CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(response) {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(function() { return cached; });
        });
      })
    );
    return;
  }

  // API calls: network-only (never cache)
  if (url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Static assets: network-first with cache fallback for offline
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
