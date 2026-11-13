'use strict';

const CACHE_NAME = 'hydra-shell-v1';
const SHELL_FILES = [
  './index.html',
  './fullhydra.html',
  './hydra.html',
  './manifest.webmanifest',
  './hydra-icon-192.png',
  './hydra-icon-512.png'
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
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

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
