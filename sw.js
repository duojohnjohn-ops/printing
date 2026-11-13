// Minimal service worker: makes the app installable and shows a friendly page when offline.
// It never caches API calls, Supabase or Netlify Functions, so data is always live.
const CACHE = 'psms-v2';
const SHELL = ['/offline.html', '/css/style.css', '/css/components.css', '/css/dashboard.css', '/css/responsive.css', '/assets/images/business-logo.png', '/assets/icons/mjs-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/.netlify/')) return;
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('/offline.html'))); return; }
  // static files: network first, fall back to cache
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req)));
});
