'use strict';

const CACHE_NAME = 'hydra-shell-v6';
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

  if (request.mode !== 'navigate') {
    const path = new URL(request.url).pathname;
    if (path.endsWith('/hydra-boot-voice.mp3') || path.endsWith('/hydra-wake.mp3')) {
      event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request))
      );
    }
    return;
  }

  event.respondWith(
    fetch(request).then((response) => {
      if (!response.ok) return response;
      return caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, response.clone()).then(() => response));
    }).catch(async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached || caches.match('./fullhydra.html');
    })
  );
});
