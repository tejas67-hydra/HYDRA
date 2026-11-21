'use strict';

const CACHE_NAME = 'hydra-shell-v11';
const SHELL_FILES = [
  './index.html',
  './fullhydra.html',
  './hydra.html',
  './manifest.webmanifest',
  './hydra-icon-192.png',
  './hydra-icon-512.png',
  './hydra-boot-voice.mp3',
  './hydra-wake.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('hydra-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const path = url.pathname;

  // HTML files: always network-first to get latest updates
  if (path.endsWith('.html') || request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) throw new Error('Network response was not ok');
          // Update cache with latest version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(async () => {
          // Fallback to cache if offline
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          return caches.match('./fullhydra.html');
        })
    );
    return;
  }

  // Audio files: cache-first
  if (path.endsWith('/hydra-boot-voice.mp3') || path.endsWith('/hydra-wake.mp3')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      }))
    );
    return;
  }

  // Images and manifest: cache-first with background update
  if (path.match(/\.(png|jpg|jpeg|webmanifest)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Fetch in background to update cache
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
            }
          });
          return cached;
        }
        return fetch(request).then((response) => {
          if (!response.ok) return response;
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
