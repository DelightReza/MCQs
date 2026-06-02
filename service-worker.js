const CACHE = 'uqp-v5';
const STATIC_OFFLINE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js?v=2',
  './metadata.json',
  './manifest.json'
];

const FALLBACK_QUESTIONBANK_ASSETS = [
  './questionbanks/*.txt'
];

const FALLBACK_MEDIA_ASSETS = [
  './media/*'
];

function normalizeAssetPath(path) {
  const normalized = String(path || '').trim().replace(/^\.?\//, '');
  if (!normalized || normalized.includes('*')) return null;
  return `./${normalized}`;
}

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

async function getMediaAssets(questionbankAssets) {
  const mediaAssets = new Set();
  const concreteQuestionbankAssets = questionbankAssets.filter((asset) => asset && !asset.includes('*'));

  await Promise.all(concreteQuestionbankAssets.map(async (asset) => {
    try {
      const res = await fetch(asset);
      if (!res.ok) return;
      const txt = await res.text();
      txt.split('\n').forEach((line) => {
        const match = line.trim().match(/^MEDIA:\s*(.+)$/i);
        if (!match) return;
        match[1].split(',').forEach((rawPath) => {
          const mediaPath = normalizeAssetPath(rawPath);
          if (mediaPath) mediaAssets.add(mediaPath);
        });
      });
    } catch {}
  }));

  return mediaAssets.size ? [...mediaAssets] : FALLBACK_MEDIA_ASSETS;
}

async function cacheAssets(cache, assets) {
  await Promise.all(
    assets
      .filter((asset) => asset && !asset.includes('*'))
      .map((asset) => cache.add(asset).catch(() => null))
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cacheAssets(cache, STATIC_OFFLINE_ASSETS);
    const questionbankAssets = await getQuestionbankAssets();
    await cacheAssets(cache, questionbankAssets);
    const mediaAssets = await getMediaAssets(questionbankAssets);
    await cacheAssets(cache, mediaAssets);
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
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const res = await fetch(request);
      if (res.ok) await cache.put(request, res.clone());
      return res;
    } catch (err) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
