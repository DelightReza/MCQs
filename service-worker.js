const CACHE = 'uqp-v3';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js?v=2',
  './metadata.json',
  './manifest.json',
  './questionbanks/pediatrics.txt',
  './questionbanks/medicine.txt',
  './questionbanks/surgery.txt',
  './questionbanks/obgyn.txt',
  './questionbanks/pharmacology.txt',
  './questionbanks/custom_exam.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
