/* Jimmy — offline cache. Bump CACHE when any file changes. */
const CACHE = 'jimmy-v2';
const FILES = [
  './', './index.html', './style.css', './app.js', './jimmy.js', './jobs.js', './lines.js',
  './pdf.min.js', './pdf.worker.min.js', './pdf-lib.min.js', './jszip.min.js', './xlsx.full.min.js', './mammoth.browser.min.js',
  './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('jimmy-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    if (r && r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match('./index.html'))));
});
