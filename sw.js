/* HYDRA service worker — offline shell, runtime caching for local assets. */
const CACHE = 'hydra-v2.8.1';
const CORE = [
  './', './index.html', './style.css', './hydra.bundle.js', './script.js',
  './js/nav.js', './js/config.js', './emo.html', './fullhydra.html', './account.html',
  './manifest.webmanifest', './manifest.companion.json', './manifest.workspace.json',
  './manifest.classic.json', './manifest.suite.json', './install.html', './install-app.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first: a cached stylesheet must never outlive a release. The
  // cache is only a fallback for offline use.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit
        || (request.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
