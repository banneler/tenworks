// TenWorks Shop Floor PWA service worker.
// - Precaches the app shell so mobile.html opens with no signal.
// - Same-origin GETs: network-first, refresh the cache on success, fall back to cache offline.
// - Never touches POSTs, /api/*, or cross-origin (Supabase) requests, so data is always live.
const CACHE_NAME = 'tenworks-mobile-v2';
const ASSETS_TO_CACHE = [
    '/mobile.html', '/manifest.json',
    '/css/style.css', '/css/mobile.css',
    '/js/mobile.js', '/js/shared_constants.js',
    '/assets/logo.svg', '/assets/icon-192.png', '/assets/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
    event.respondWith(
        fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
                const copy = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
        }).catch(async () => {
            const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
            if (hit) return hit;
            if (req.mode === 'navigate') return caches.match('/mobile.html');
            return new Response('', { status: 504, statusText: 'Offline' });
        })
    );
});
