const CACHE_NAME = 'shengciben-v47';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/epubjs/0.3.93/epub.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// Install: cache core assets + CDN scripts
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => {
        // Pre-cache CDN scripts (best-effort, don't fail install if unavailable)
        return Promise.allSettled(CDN_ASSETS.map(url =>
          fetch(url, { mode: 'cors' }).then(r => {
            if (r.ok) return caches.open(CACHE_NAME).then(c => c.put(url, r));
          }).catch(() => {})
        ));
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// 页面通知新版本立即接管
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: index.html 走 network-first（保证每次都拿到最新版），其余静态资源 cache-first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests (API calls go through network)
  // Exception: cache CDN scripts (epub.js, pdf.js) for offline use
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'cdnjs.cloudflare.com') {
      event.respondWith(
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok && event.request.method === 'GET') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          }).catch(() => new Response('', { status: 504, statusText: 'Offline' }));
        })
      );
    }
    return;
  }

  // For API requests, always go to network
  if (url.hostname.includes('api.') || url.hostname.includes('translate.')) return;

  // 导航/HTML 请求：网络优先，失败再回退缓存（离线可用）
  if (event.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 其余静态资源：缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});
