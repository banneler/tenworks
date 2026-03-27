const CACHE_NAME = 'tenworks-mobile-v1';
const ASSETS_TO_CACHE = [
    '/mobile.html',
    '/css/style.css',
    '/css/mobile.css',
    '/js/mobile.js',
    '/js/shared_constants.js',
    '/assets/logo.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Network-first strategy for API calls and dynamic HTML, fallback to cache
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});