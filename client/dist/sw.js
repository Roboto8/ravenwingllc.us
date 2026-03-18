var CACHE_NAME = 'fencetrace-v2';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/bom.js',
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
        names.filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      });
    })
  );
});
