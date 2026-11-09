// network-first สำหรับไฟล์ของแอป (อัปเดตเห็นทันที), ไม่แคชคำขอ Supabase
const CACHE = 'myhome-v11';
const ASSETS = ['./', './index.html', './css/app.css?v=11', './js/core.js?v=11', './js/loan.js?v=11', './js/tax.js?v=11', './js/income.js?v=11', './js/rent.js?v=11', './js/deduct.js?v=11', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('.supabase.co')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && (req.url.startsWith(self.location.origin) || req.url.includes('cdn'))) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
