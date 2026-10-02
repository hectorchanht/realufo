// Kill-switch for the service worker the old Astro site (war-gov-ufo-release)
// registered at /sw.js. Without a real JS file here the SPA fallback returns
// index.html, the browser rejects the update (wrong MIME), and the old SW keeps
// serving its cached shell forever. Keep this file until old visitors are gone.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    // Reload open tabs so they fetch the new site without an SW in front.
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const client of windows) client.navigate(client.url);
  })());
});
