const CACHE = 'pluto-admission-v5';
const ASSETS = ['/tickets/staff', '/assets/site.js', '/assets/ticketing.js', '/assets/ticketing.css', '/assets/images/pluto-logo.webp', '/assets/fonts/Montserrat-Medium.ttf', '/assets/fonts/SourceCodePro-SemiBold.ttf'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pluto-admission-') && key !== CACHE).map(key => caches.delete(key))))])));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  // Never cache customer orders, APIs, payment requests, or credentials.
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const clone = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, clone)); } return response; }).catch(() => caches.match(event.request)));
});
