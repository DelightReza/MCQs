const CACHE = 'uqp-v4';
const STATIC_OFFLINE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js?v=2',
  './metadata.json',
  './manifest.json'
];

const FALLBACK_QUESTIONBANK_ASSETS = [
  './questionbanks/pediatrics.txt',
  './questionbanks/medicine.txt',
  './questionbanks/surgery.txt',
  './questionbanks/obgyn.txt',
  './questionbanks/pharmacology.txt',
  './questionbanks/custom_exam.txt'
];

async function getQuestionbankAssets() {
  try {
    const res = await fetch('./metadata.json');
    if (!res.ok) throw new Error('metadata fetch failed');
    const data = await res.json();
    if (!Array.isArray(data?.question_banks)) return FALLBACK_QUESTIONBANK_ASSETS;
    const dynamicAssets = data.question_banks
      .map((bank) => String(bank?.file || '').trim())
      .filter(Boolean)
      .map((file) => `./questionbanks/${file}`);
    return [...new Set(dynamicAssets)];
  } catch {
    return FALLBACK_QUESTIONBANK_ASSETS;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const questionbankAssets = await getQuestionbankAssets();
    await cache.addAll([...STATIC_OFFLINE_ASSETS, ...questionbankAssets]);
  })());
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
