// Bump this number whenever you change any cached file, so phones fetch the update.
const CACHE = 'hex-settlers-v3';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './ui/styles.css',
  './ui/main.js',
  './ui/board-view.js',
  './ui/pan-zoom.js',
  './ui/geometry.js',
  './ui/art.js',
  './engine/rng.js',
  './engine/hex.js',
  './engine/constants.js',
  './engine/board.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache first: serve from the phone's storage, fall back to the network.
// ignoreSearch: "./?seed=abc" is served by the cached "./" page.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request))
  );
});
