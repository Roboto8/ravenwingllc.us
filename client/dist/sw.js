var CACHE_NAME = 'fencetrace-v21';
var TILE_CACHE_NAME = 'fencetrace-tiles-v1';
var MAX_TILE_CACHE = 2000; // ~200MB of tiles at ~100KB each
// Only stable, always-revalidated URLs belong here. JS/CSS are referenced with
// ?v= cache-busters and served with a 1-year immutable Cache-Control, so
// precaching their BARE paths would pull (possibly year-old) copies out of the
// browser's HTTP cache. The runtime network-first handler caches the real
// versioned URLs on first load, which keeps offline working.
var STATIC_ASSETS = [
  '/',
  '/index.html',
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
      // ignoreSearch: a cached /js/app.js?v=OLD still beats a blank screen
      // when offline after a version bump.
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
