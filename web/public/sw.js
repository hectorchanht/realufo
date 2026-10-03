// RealUFO service worker (spec docs/superpowers/specs/2026-10-03-realufo-pwa-push-design.md).
// This URL used to serve a kill-switch for the old Astro site's SW; visitors who
// still run that one update straight to this file, and activate deletes every
// cache that isn't ours. BUILD is stamped per build (web/vite.config.ts) so each
// deploy installs a fresh SW that re-precaches the new bundles and prunes old ones.
importScripts("/sw-route.js");

const BUILD = "__BUILD__";
const API_TIMEOUT_MS = 5000;
const API_MAX = 300;
const IMG_MAX = 300;
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

async function bundleFiles() {
  const res = await fetch("/asset-manifest.json", { cache: "no-store" });
  return self.swPrecache(await res.json());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const files = await bundleFiles();
      const assets = await caches.open("ru-assets");
      const have = new Set((await assets.keys()).map((r) => new URL(r.url).pathname));
      await assets.addAll(files.filter((f) => !have.has(f)));
      const shell = await caches.open("ru-shell");
      await shell.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!self.swOwnCache(k)) await caches.delete(k);
      try {
        const keep = new Set(await bundleFiles());
        const assets = await caches.open("ru-assets");
        for (const r of await assets.keys()) if (!keep.has(new URL(r.url).pathname)) await assets.delete(r);
      } catch {
        // offline during activate: prune next time
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const kind = self.swRoute(req.url, req.method, req.mode, self.location.origin);
  if (kind === "navigate") event.respondWith(navigate(req));
  else if (kind === "asset") event.respondWith(cacheFirst(req, "ru-assets"));
  else if (kind === "api") event.respondWith(api(req));
  else if (kind === "img") event.respondWith(image(req));
});

// Network-first keeps the Worker's per-route meta/body fresh; offline → the cached shell.
async function navigate(req) {
  try {
    return await fetch(req);
  } catch {
    return (await caches.match("/", { cacheName: "ru-shell" })) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const hit = await caches.match(req, { cacheName: name });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}

// Network-first with a timeout; a cached copy served instead is marked X-SW-Cache: 1
// so the app can show its "offline — saved copy" banner.
async function api(req) {
  const cache = await caches.open("ru-api");
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone()).then(() => trim(cache, API_MAX));
    return res;
  });
  net.catch(() => {}); // handled below; avoid an unhandled rejection after a timeout
  try {
    const first = await Promise.race([net, new Promise((r) => setTimeout(() => r(null), API_TIMEOUT_MS))]);
    if (first) return first;
    const hit = await cache.match(req);
    return hit ? stale(hit) : await net;
  } catch {
    const hit = await cache.match(req);
    return hit ? stale(hit) : Response.error();
  }
}

function stale(res) {
  const headers = new Headers(res.headers);
  headers.set("X-SW-Cache", "1");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Thumbnails: refetched as CORS (assets.realufo.org allows realufo.org) so the cached
// copy is a real response, not an opaque one that eats ~7 MB of quota each.
async function image(req) {
  const cache = await caches.open("ru-img");
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
    if (res.ok && res.type === "cors") cache.put(req.url, res.clone()).then(() => trim(cache, IMG_MAX));
    return res;
  } catch {
    return fetch(req); // CORS refetch refused: plain image load, not cached
  }
}

// Oldest entries first (Cache keys keep insertion order).
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

void BUILD;
