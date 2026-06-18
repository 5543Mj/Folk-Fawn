const CACHE_NAME = 'folk-fawn-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './media/silence.mp3',
  './media/lier.png',
  './media/lier-192.png',
  './media/lier-512.png'
];

// Install the worker and cache the UI assets
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Intercept network requests and serve from cache if offline
self.addEventListener('fetch', (e) => {
  // We only want to intercept basic GET requests (CSS, JS, HTML)
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Return cached file if found, otherwise try the network
      return cachedResponse || fetch(e.request).catch(() => {
        // Fallback for when offline and file isn't cached
        return new Response('App is offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// Clean up old caches if we update the version number
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});
