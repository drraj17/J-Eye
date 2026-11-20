const CACHE_NAME = 'jeye-pwa-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

// Install: pre-cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== 'jeye-share-target')
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: handle Web Share Target image uploads + offline caching
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Android/Chrome Share Sheet POST requests with images
  if (event.request.method === 'POST' && url.pathname.endsWith('index.html')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const imageFile = formData.get('image');
          if (imageFile) {
            const shareCache = await caches.open('jeye-share-target');
            await shareCache.put('/shared-image', new Response(imageFile));
          }
        } catch (err) {}
        return Response.redirect('./index.html?shared=1', 303);
      })()
    );
    return;
  }

  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Network-first for API calls, Stale-While-Revalidate for app assets & CDNs
  const isApiRequest =
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('openrouter.ai');

  if (isApiRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});