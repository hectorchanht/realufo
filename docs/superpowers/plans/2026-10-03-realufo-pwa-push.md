# RealUFO PWA + Offline + Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** realufo.org installs to the home screen, opens standalone and instantly, reads visited pages offline, queues posts made offline, and sends opt-in push notifications (replies, followed records/threads/cases/hubs, new files, daily pick).

**Architecture:** A hand-written service worker (`web/public/sw.js` + pure router `web/public/sw-route.js`) replaces today's kill-switch SW and precaches the Vite bundle listed in `dist/asset-manifest.json`. Offline writes are queued page-side in `web/src/lib/outbox.ts`, hooked into the single fetch wrapper `web/src/api/client.ts`. Push is sent from the Worker with WebCrypto only (`worker/lib/webpush.ts`: RFC 8291 encryption + VAPID JWT), fan-out in `worker/lib/push.ts`, state in D1 (`push_subs`, `follows`, `push_state`), gated by `FEATURE_PUSH`.

**Tech Stack:** Cloudflare Workers + D1 + static assets, Vite 8 + React 19 + TanStack Query 5, vitest (jsdom for web, `@cloudflare/vitest-pool-workers` for worker), Python 3 + Pillow (one-off icon render).

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-pwa-push-design.md`

## Global Constraints

- No new npm dependencies (web or root). WebCrypto only for push crypto.
- Phase 1 (Tasks 1–7) must ship and work on its own; Phase 2 (Tasks 8–15) is invisible while `FEATURE_PUSH` is `"off"`.
- `FEATURE_PUSH` default `"off"` in `wrangler.jsonc`; values `off` | `on`.
- UI controls: lucide icons, minimal visible text, every icon button has `aria-label` + `title` (user rule).
- New D1 migration is `db/migrations/0035_push.sql` — re-run `ls db/migrations | tail -3` first; if another chat already took `0034`, use the next free number everywhere this plan says 0034.
- Caches owned by the SW: `ru-shell`, `ru-assets`, `ru-api`, `ru-img`. Every other cache name is deleted on activate.
- API reads network-first with 5 s timeout; thumbnails cap 300 entries; API cache cap 300 entries.
- Outbox caps: 50 items, 7 days.
- Activity push throttle: ≤ 1 push per target per 10 min. Payload title ≤ 80 chars, body ≤ 100 chars.
- Notification permission is only requested from a user tap, never on load.
- This checkout is shared with other chats: before each commit run `git status --short` and stage only the files the task names. Never `git add -A`. Do not push.
- Test commands: worker `pnpm test:worker worker/tests/<file>.spec.ts` (repo root); web `pnpm -C web test src/tests/<file>` ; typecheck/build `pnpm build:web`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Old Astro service-worker visitors** — the new SW must delete caches it does not own on activate (e.g. an `astro-...` cache). Pinned by `swOwnCache` test in Task 2.
2. **Two open tabs flushing the outbox at once** — must not send an item twice. Pinned by a Web Locks test in Task 5.
3. **Record ids with spaces / odd characters in notification URLs** (ids like `of _Western` exist) — URLs must be `encodeURIComponent`-ed. Pinned by `followUrl` test in Task 11.
4. **Comment author without `X-Anon-Id`** — no auto-follow row, and every follower still notified (nobody "is" the author). Pinned in Tasks 10 and 12.
5. **Long titles/snippets in pushes** — must be clipped so the encrypted payload stays well under the 4 KB push limit. Pinned by `clip` test in Task 12.

---

## Phase 1 — PWA core, offline reading, offline queue

### Task 1: Manifest, icons, head tags

**Files:**
- Create: `scripts/pwa_icons.py`
- Create: `web/public/manifest.webmanifest`
- Create (generated, committed): `web/public/icon-192.png`, `web/public/icon-512.png`, `web/public/icon-maskable-512.png`, `web/public/apple-touch-icon.png`
- Modify: `web/index.html` (head, above `<!--META-->`)

**Interfaces:**
- Produces: static files at `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/apple-touch-icon.png` (used by Task 3 precache and Task 14 notifications).

- [ ] **Step 1: Write the icon script**

```python
"""Render the PWA icons from web/public/favicon.svg (pixel-art <rect>s only).

One-off; re-run only if the favicon changes:  python3 scripts/pwa_icons.py
Writes web/public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png.
"""
import re
from pathlib import Path

from PIL import Image, ImageDraw

PUB = Path(__file__).resolve().parent.parent / "web" / "public"
BG = "#07080c"  # index.html theme-color

svg = (PUB / "favicon.svg").read_text()
vx, vy, vw, vh = map(float, re.search(r'viewBox="([^"]+)"', svg).group(1).split())
rects = [
    (fill, *map(float, r))
    for fill, body in re.findall(r'<g fill="(#[0-9a-fA-F]{6})">(.*?)</g>', svg, re.S)
    for r in re.findall(r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', body)
]
assert rects, "no <rect>s found in favicon.svg"


def render(size: int, art: float) -> Image.Image:
    """art = share of the canvas the viewBox fills (maskable keeps the saucer in the 80% safe circle)."""
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    s = size * art / max(vw, vh)
    ox = (size - vw * s) / 2 - vx * s
    oy = (size - vh * s) / 2 - vy * s
    for fill, x, y, w, h in rects:
        d.rectangle(
            [round(ox + x * s), round(oy + y * s), round(ox + (x + w) * s) - 1, round(oy + (y + h) * s) - 1],
            fill=fill,
        )
    return img


for name, size, art in [
    ("icon-192.png", 192, 0.8),
    ("icon-512.png", 512, 0.8),
    ("icon-maskable-512.png", 512, 0.6),
    ("apple-touch-icon.png", 180, 0.75),
]:
    render(size, art).save(PUB / name, optimize=True)
    print(name)
```

- [ ] **Step 2: Run it and look at one icon**

Run: `python3 scripts/pwa_icons.py && file web/public/icon-*.png web/public/apple-touch-icon.png`
Expected: four names printed; `file` reports PNG 192x192, 512x512, 512x512, 180x180. Open `web/public/icon-512.png` with the Read tool and confirm a green/cyan pixel saucer centred on near-black.

- [ ] **Step 3: Write the manifest**

`web/public/manifest.webmanifest`:

```json
{
  "id": "/",
  "name": "RealUFO — Declassified UAP Archive",
  "short_name": "RealUFO",
  "description": "Searchable archive of declassified UAP/UFO records, with case files, a sighting map and anonymous discussion boards.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#07080c",
  "theme_color": "#07080c",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Head tags**

In `web/index.html`, directly after the existing `<meta name="theme-color" content="#07080c" />` line (which is above `<!--META-->`, so the Worker's meta swap leaves these alone), add:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="RealUFO" />
```

- [ ] **Step 5: Build and confirm files land in dist**

Run: `pnpm build:web && ls web/dist/manifest.webmanifest web/dist/icon-192.png web/dist/apple-touch-icon.png && grep -c 'rel="manifest"' web/dist/index.html`
Expected: three paths listed, count `1`.

- [ ] **Step 6: Commit**

```bash
git add scripts/pwa_icons.py web/public/manifest.webmanifest web/public/icon-192.png web/public/icon-512.png web/public/icon-maskable-512.png web/public/apple-touch-icon.png web/index.html
git commit -m "feat(pwa): web app manifest, icons, iOS home-screen tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Service-worker request router (pure)

**Files:**
- Create: `web/public/sw-route.js`
- Test: `web/src/tests/swRoute.test.ts`

**Interfaces:**
- Produces (globals on the SW `self`, loaded by `importScripts("/sw-route.js")` in Task 3):
  - `self.swRoute(href: string, method: string, mode: string, origin: string): "navigate" | "asset" | "api" | "img" | null`
  - `self.swOwnCache(name: string): boolean`
  - `self.swPrecache(manifest: Record<string, {file?: string; css?: string[]; assets?: string[]}>): string[]` — absolute paths of the files to precache (skips legacy `.woff`; browsers use the `.woff2` twins).

- [ ] **Step 1: Write the failing test**

`web/src/tests/swRoute.test.ts`:

```ts
// sw-route.js is a classic script for the service worker; evaluate it against a fake `self`.
import src from "../../public/sw-route.js?raw";
import { describe, it, expect } from "vitest";

const self: Record<string, any> = {};
new Function("self", src)(self);
const O = "https://realufo.org";
const route = (href: string, method = "GET", mode = "cors") => self.swRoute(href, method, mode, O);

describe("swRoute", () => {
  it("navigations: same-origin only", () => {
    expect(route(`${O}/doc/X`, "GET", "navigate")).toBe("navigate");
    expect(route("https://example.com/", "GET", "navigate")).toBeNull();
  });
  it("hashed bundles cache-first", () => {
    expect(route(`${O}/assets/index-abc.js`)).toBe("asset");
  });
  it("API reads network-first, minus the never-cache list", () => {
    expect(route(`${O}/api/records/DOW-UAP-D006`)).toBe("api");
    expect(route(`${O}/api/feed`)).toBe("api");
    for (const p of ["/api/ask?q=x", "/api/ask/recent", "/api/asks/12", "/api/file/X", "/api/u/a.jpg", "/api/health"])
      expect(route(O + p)).toBeNull();
  });
  it("never touches writes", () => {
    expect(route(`${O}/api/votes`, "POST")).toBeNull();
    expect(route(`${O}/assets/a.js`, "POST")).toBeNull();
  });
  it("CDN thumbnails and share cards only", () => {
    expect(route("https://assets.realufo.org/thumbs/wargov/X.jpg", "GET", "no-cors")).toBe("img");
    expect(route("https://assets.realufo.org/cards/X-r2.png", "GET", "no-cors")).toBe("img");
    expect(route("https://assets.realufo.org/files/wargov/X.pdf")).toBeNull();
    expect(route("https://assets.realufo.org/clips/wargov/X.mp4")).toBeNull();
  });
  it("other same-origin files pass through", () => {
    expect(route(`${O}/sw.js`)).toBeNull();
    expect(route(`${O}/rss.xml`)).toBeNull();
  });
  it("owns only its four caches (old Astro caches get deleted)", () => {
    for (const c of ["ru-shell", "ru-assets", "ru-api", "ru-img"]) expect(self.swOwnCache(c)).toBe(true);
    expect(self.swOwnCache("astro-pages-v3")).toBe(false);
    expect(self.swOwnCache("workbox-precache")).toBe(false);
  });
  it("precache list from the Vite manifest, no legacy .woff", () => {
    const list = self.swPrecache({
      "index.html": { file: "assets/index-a.js", css: ["assets/index-b.css"], assets: ["assets/f-c.woff2", "assets/f-c.woff"] },
      "src/screens/Doc.tsx": { file: "assets/Doc-d.js" },
      "_shared": { file: "assets/index-a.js" },
    });
    expect(list.sort()).toEqual(["/assets/Doc-d.js", "/assets/f-c.woff2", "/assets/index-a.js", "/assets/index-b.css"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C web test src/tests/swRoute.test.ts`
Expected: FAIL — cannot resolve `../../public/sw-route.js?raw`.

- [ ] **Step 3: Write the router**

`web/public/sw-route.js`:

```js
// Pure request routing for the service worker (sw.js loads it with importScripts).
// Classic script, not an ES module: module service workers are patchy on older
// Safari/Firefox. Tested in web/src/tests/swRoute.test.ts against a fake `self`.
(function (self) {
  var CDN = "https://assets.realufo.org";
  var CACHES = ["ru-shell", "ru-assets", "ru-api", "ru-img"];
  // Reads that must always be live: Ask answers, file/upload streams, health.
  var API_SKIP = /^\/api\/(ask(\/|$)|asks\/|file\/|u\/|health$)/;

  // → "navigate" | "asset" | "api" | "img" | null (null = browser handles it, SW stays out)
  self.swRoute = function (href, method, mode, origin) {
    if (method !== "GET") return null;
    var u = new URL(href);
    if (mode === "navigate") return u.origin === origin ? "navigate" : null;
    if (u.origin === origin) {
      if (u.pathname.indexOf("/assets/") === 0) return "asset";
      if (u.pathname.indexOf("/api/") === 0 && !API_SKIP.test(u.pathname)) return "api";
      return null;
    }
    if (u.origin === CDN && /^\/(thumbs|cards)\//.test(u.pathname)) return "img";
    return null;
  };

  self.swOwnCache = function (name) {
    return CACHES.indexOf(name) !== -1;
  };

  // Vite build manifest (dist/asset-manifest.json) → every bundle file, deduped.
  // Legacy .woff skipped: every font also ships as .woff2, which all supported browsers use.
  self.swPrecache = function (manifest) {
    var out = {};
    Object.keys(manifest).forEach(function (k) {
      var e = manifest[k];
      [e.file].concat(e.css || [], e.assets || []).forEach(function (f) {
        if (f && !/\.woff$/.test(f)) out["/" + f] = true;
      });
    });
    return Object.keys(out);
  };
})(self);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C web test src/tests/swRoute.test.ts`
Expected: PASS (8 tests). If TypeScript complains about the `?raw` import, check `web/src/vite-env.d.ts` references `vite/client`; add `/// <reference types="vite/client" />` there if missing.

- [ ] **Step 5: Commit**

```bash
git add web/public/sw-route.js web/src/tests/swRoute.test.ts
git commit -m "feat(pwa): pure service-worker request router + precache list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Service worker, build stamp, registration

**Files:**
- Modify (replace whole file): `web/public/sw.js`
- Modify: `web/vite.config.ts`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: `self.swRoute`, `self.swOwnCache`, `self.swPrecache` (Task 2); `/asset-manifest.json` (this task's Vite config).
- Produces: SW responses answered from `ru-api` after a network failure carry header `X-SW-Cache: 1` (Task 4 reads it). Push handlers are added to this file in Task 14.

- [ ] **Step 1: Vite build manifest + SW stamp**

Replace `web/vite.config.ts` with:

```ts
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Stamps dist/sw.js with a hash of this build's asset list, so every deploy ships a
// byte-different service worker → browsers install it → it precaches the new
// bundles and prunes the old ones (public/sw.js).
const swBuildId = (): Plugin => ({
  name: 'sw-build-id',
  apply: 'build',
  closeBundle() {
    const dist = new URL('./dist/', import.meta.url)
    const id = createHash('sha256').update(readFileSync(new URL('asset-manifest.json', dist))).digest('hex').slice(0, 12)
    const sw = new URL('sw.js', dist)
    writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', id))
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swBuildId()],
  // String form = file name inside dist/ (default lives in the .vite/ dot-directory).
  build: { manifest: 'asset-manifest.json' },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
})
```

- [ ] **Step 2: Replace the kill-switch with the real service worker**

Replace all of `web/public/sw.js` with:

```js
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
```

- [ ] **Step 3: Register it (production builds only)**

In `web/src/main.tsx`, after the `createRoot(...).render(...)` call, append:

```ts
// Service worker (public/sw.js): offline shell, saved reads, push. Production only —
// in dev it would cache Vite's unhashed modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {})
  })
}
```

- [ ] **Step 4: Build and check the stamp**

Run: `pnpm build:web && ls web/dist/asset-manifest.json && grep -c "__BUILD__" web/dist/sw.js; grep -o 'const BUILD = "[0-9a-f]*"' web/dist/sw.js`
Expected: manifest path printed; count `0`; a line like `const BUILD = "3f9a1c0b7d2e"`.
Also confirm `web/public/sw.js` itself still contains `__BUILD__` (the plugin only rewrites dist): `grep -c __BUILD__ web/public/sw.js` → `2`.

- [ ] **Step 5: Verify in the browser pane**

1. `preview_start` with name `worker-dev` (serves `web/dist` through the Worker on :8787; local D1 is seeded per `realufo-local-dev-data`).
2. Navigate to `http://localhost:8787/`, then run in `javascript_tool`:
   `await navigator.serviceWorker.ready; (await caches.keys()).sort()` → expect `["ru-assets","ru-shell"]` (plus `ru-api`/`ru-img` once data loads).
3. Open a doc page (`/doc/<any id from the feed>`), wait for it to render.
4. Simulate offline: `javascript_tool`: register nothing; instead stop the server with `preview_stop`, then `navigate` to the same doc URL. Expect the page to render from cache (shell + saved API data). Screenshot as proof.
5. `preview_start worker-dev` again for later tasks.

- [ ] **Step 6: Run web tests (nothing else broke)**

Run: `pnpm -C web test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add web/public/sw.js web/vite.config.ts web/src/main.tsx
git commit -m "feat(pwa): service worker — precached shell, cache-first bundles, network-first API, cached thumbs

Replaces the old-Astro kill-switch at the same URL; activate still deletes
every cache it does not own.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: "Offline — saved copy" banner

**Files:**
- Create: `web/src/lib/offline.ts`
- Modify: `web/src/api/client.ts` (inside `req()`, after the fetch)
- Modify: `web/src/components/AppShell.tsx` (banner above `<Outlet />`)
- Test: `web/src/tests/client.test.ts` (add cases)

**Interfaces:**
- Consumes: `X-SW-Cache: 1` response header (Task 3).
- Produces: `setStale(v: boolean): void`, `useStale(): boolean`, `isStale(): boolean` from `web/src/lib/offline.ts`.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe("api client", ...)` in `web/src/tests/client.test.ts`; add `import { isStale } from "../lib/offline";` at the top)

```ts
  it("flags reads served from the service-worker cache, clears on a live one", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "X-SW-Cache": "1" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await api.get("/api/feed");
    expect(isStale()).toBe(true);
    await api.get("/api/feed");
    expect(isStale()).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C web test src/tests/client.test.ts`
Expected: FAIL — cannot resolve `../lib/offline`.

- [ ] **Step 3: Implement the flag**

`web/src/lib/offline.ts`:

```ts
// "Showing a saved copy" flag: true while API reads come from the service worker's
// cache (public/sw.js marks those X-SW-Cache: 1), false after any live read.
import { useSyncExternalStore } from "react";

let stale = false;
const subs = new Set<() => void>();

export function setStale(v: boolean) {
  if (v === stale) return;
  stale = v;
  subs.forEach((f) => f());
}

export const isStale = () => stale;

export const useStale = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    isStale,
  );
```

In `web/src/api/client.ts`: add `import { setStale } from "../lib/offline";` and, in `req()`, right after the `const res = await fetch(...)` statement (before `if (!res.ok)`), add:

```ts
  if (method === "GET") setStale(res.headers.get("X-SW-Cache") === "1");
```

- [ ] **Step 4: Banner in AppShell**

In `web/src/components/AppShell.tsx` add imports `import { WifiOff } from "lucide-react";` and `import { useStale } from "../lib/offline";`; in `AppShell()` add `const stale = useStale();`; then inside the `data-screenpad` div, immediately before `<Outlet />`:

```tsx
                {stale && (
                  <div
                    role="status"
                    className="mb-3 flex items-center justify-center gap-2 rounded-[10px] border border-line bg-bg2 px-3 py-1.5 font-mono text-[11px] text-dim"
                  >
                    <WifiOff size={13} aria-hidden="true" />
                    Offline — showing saved copy
                  </div>
                )}
```

- [ ] **Step 5: Run tests**

Run: `pnpm -C web test src/tests/client.test.ts src/tests/shell.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/offline.ts web/src/api/client.ts web/src/components/AppShell.tsx web/src/tests/client.test.ts
git commit -m "feat(pwa): offline banner when reads come from the service-worker cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Offline outbox (library + client hook)

**Files:**
- Create: `web/src/lib/outbox.ts`
- Modify: `web/src/api/client.ts`
- Test: `web/src/tests/outbox.test.ts`

**Interfaces:**
- Produces from `web/src/lib/outbox.ts`:
  - `canQueue(path: string): boolean`
  - `enqueue(path: string, body: unknown): void` — dispatches `window` event `"outbox"` with `detail: { queued: true }`
  - `flush(send: Send): Promise<void>` where `type Send = (path: string, body: unknown) => Promise<Response>` — dispatches `"outbox"` with `detail: { sent: number; failed: string[] }` when anything was sent or dropped
  - `startOutbox(send: Send, onSent: () => void): void`
  - `outboxMessage(d: OutboxEvent): string`
  - `type OutboxEvent = { queued: true } | { sent: number; failed: string[] }`
- Produces from `web/src/api/client.ts`: `class QueuedError extends ApiError` (status `0`), `sendRaw(path: string, body: unknown): Promise<Response>`.

- [ ] **Step 1: Write the failing tests**

`web/src/tests/outbox.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { canQueue, enqueue, flush, outboxMessage, type OutboxEvent } from "../lib/outbox";
import { api, ApiError, QueuedError } from "../api/client";

const items = () => JSON.parse(localStorage.getItem("outbox") ?? "[]");
const events: OutboxEvent[] = [];
window.addEventListener("outbox", (e) => events.push((e as CustomEvent<OutboxEvent>).detail));
const ok = () => new Response("{}", { status: 201 });

beforeEach(() => {
  localStorage.clear();
  events.length = 0;
  vi.restoreAllMocks();
});

describe("outbox", () => {
  it("knows which writes can wait", () => {
    expect(canQueue("/api/records/DOW-UAP-D006/comments")).toBe(true);
    expect(canQueue("/api/threads")).toBe(true);
    expect(canQueue("/api/threads/ut_1/posts")).toBe(true);
    expect(canQueue("/api/votes")).toBe(true);
    expect(canQueue("/api/ask/3/public")).toBe(false);
    expect(canQueue("/api/push/subscribe")).toBe(false);
  });

  it("client queues a write that fails with a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.post("/api/votes", { target_type: "post", target_id: "P1" })).rejects.toBeInstanceOf(QueuedError);
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ path: "/api/votes", body: { target_type: "post", target_id: "P1" } });
    expect(events).toEqual([{ queued: true }]);
  });

  it("does not queue server errors, non-queueable paths, or image posts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(api.post("/api/votes", {})).rejects.not.toBeInstanceOf(QueuedError);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.post("/api/ask/3/public", {})).rejects.toBeInstanceOf(TypeError);
    const form = new FormData();
    form.set("body", "hi");
    const err = await api.post("/api/threads/ut_1/posts", form).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(QueuedError);
    expect(err.message).toBe("Image posts need a connection");
    expect(items()).toHaveLength(0);
  });

  it("keeps at most 50 items", () => {
    for (let i = 0; i < 55; i++) enqueue("/api/votes", { i });
    expect(items()).toHaveLength(50);
    expect(items()[0].body).toEqual({ i: 5 });
  });

  it("flushes oldest first and reports", async () => {
    enqueue("/api/votes", { n: 1 });
    enqueue("/api/threads/ut_1/posts", { body: "b" });
    const sent: unknown[] = [];
    await flush(async (_p, b) => (sent.push(b), ok()));
    expect(sent).toEqual([{ n: 1 }, { body: "b" }]);
    expect(items()).toHaveLength(0);
    expect(events.at(-1)).toEqual({ sent: 2, failed: [] });
  });

  it("stops on network error and on 429, keeping the rest", async () => {
    enqueue("/api/votes", { n: 1 });
    enqueue("/api/votes", { n: 2 });
    await flush(async () => {
      throw new TypeError("offline");
    });
    expect(items()).toHaveLength(2);
    await flush(async () => new Response("{}", { status: 429 }));
    expect(items()).toHaveLength(2);
  });

  it("drops a rejected item with its server error and carries on", async () => {
    enqueue("/api/votes", { n: 1 });
    enqueue("/api/votes", { n: 2 });
    let call = 0;
    await flush(async () => (call++ === 0 ? new Response(JSON.stringify({ error: "thread not found" }), { status: 404 }) : ok()));
    expect(items()).toHaveLength(0);
    expect(events.at(-1)).toEqual({ sent: 1, failed: ["thread not found"] });
  });

  it("drops items older than 7 days", async () => {
    localStorage.setItem("outbox", JSON.stringify([{ id: "old", path: "/api/votes", body: {}, at: Date.now() - 8 * 864e5 }]));
    const send = vi.fn(async () => ok());
    await flush(send);
    expect(send).not.toHaveBeenCalled();
    expect(items()).toHaveLength(0);
  });

  it("concurrent flushes in one tab send each item once", async () => {
    enqueue("/api/votes", { n: 1 });
    const send = vi.fn(async () => ok());
    await Promise.all([flush(send), flush(send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uses the Web Locks API when present so two tabs never flush together", async () => {
    const request = vi.fn((_name: string, fn: () => Promise<void>) => fn());
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });
    enqueue("/api/votes", { n: 1 });
    await flush(async () => ok());
    expect(request).toHaveBeenCalledWith("realufo-outbox", expect.any(Function));
    vi.unstubAllGlobals();
  });

  it("summary text", () => {
    expect(outboxMessage({ queued: true })).toBe("Saved offline — will post when back online");
    expect(outboxMessage({ sent: 2, failed: [] })).toBe("2 offline posts sent");
    expect(outboxMessage({ sent: 1, failed: ["thread not found"] })).toBe("1 offline post sent · 1 couldn't post: thread not found");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C web test src/tests/outbox.test.ts`
Expected: FAIL — cannot resolve `../lib/outbox`.

- [ ] **Step 3: Implement the outbox**

`web/src/lib/outbox.ts`:

```ts
// Offline outbox (spec Phase 1c). A write that fails with a network error is kept in
// localStorage and re-sent, oldest first, when the browser comes back online, the
// app starts, or the tab becomes visible. Page-side on purpose: Background Sync is
// Chrome-only and never fires on iOS.
const KEY = "outbox";
const MAX_ITEMS = 50;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const QUEUEABLE = [
  /^\/api\/records\/[^/]+\/comments$/,
  /^\/api\/cases\/[^/]+\/comments$/,
  /^\/api\/threads$/,
  /^\/api\/threads\/[^/]+\/posts$/,
  /^\/api\/votes$/,
  /^\/api\/records\/[^/]+\/verdict$/,
  /^\/api\/articles\/[^/]+\/poll$/,
  /^\/api\/shorts\/[^/]+\/like$/,
];

interface Item {
  id: string;
  path: string;
  body: unknown;
  at: number;
}
export type OutboxEvent = { queued: true } | { sent: number; failed: string[] };
type Send = (path: string, body: unknown) => Promise<Response>;

export const canQueue = (path: string) => QUEUEABLE.some((re) => re.test(path));

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: Item[]) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked/full: the write is lost, same as a failed post
  }
}

const emit = (detail: OutboxEvent) => window.dispatchEvent(new CustomEvent("outbox", { detail }));

export function enqueue(path: string, body: unknown) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  write([...read(), { id, path, body, at: Date.now() }].slice(-MAX_ITEMS));
  emit({ queued: true });
}

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j?.error === "string" && j.error) return j.error;
  } catch {
    // non-JSON body
  }
  return `error ${res.status}`;
}

async function drain(send: Send) {
  let sent = 0;
  const failed: string[] = [];
  write(read().filter((i) => Date.now() - i.at < MAX_AGE_MS));
  for (let item = read()[0]; item; item = read()[0]) {
    let res: Response;
    try {
      res = await send(item.path, item.body);
    } catch {
      break; // still offline: keep it for the next trigger
    }
    if (res.status === 429) break; // rate limited: next trigger
    if (res.ok) sent++;
    else failed.push(await errorText(res));
    const done = item.id;
    write(read().filter((i) => i.id !== done));
  }
  if (sent || failed.length) emit({ sent, failed });
}

// One flush at a time per tab (shared promise) and across tabs (Web Locks, where available).
// ponytail: a request that reached the server but lost its response is re-sent later
// (duplicate post); add an idempotency-key header if that shows up in practice.
let running: Promise<void> | null = null;
export function flush(send: Send): Promise<void> {
  running ??= (navigator.locks ? navigator.locks.request("realufo-outbox", () => drain(send)) : drain(send)).finally(() => {
    running = null;
  });
  return running;
}

export function startOutbox(send: Send, onSent: () => void) {
  const run = () => void flush(send);
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  window.addEventListener("outbox", (e) => {
    const d = (e as CustomEvent<OutboxEvent>).detail;
    if ("sent" in d && d.sent) onSent();
  });
  run();
}

export function outboxMessage(d: OutboxEvent): string {
  if ("queued" in d) return "Saved offline — will post when back online";
  const parts: string[] = [];
  if (d.sent) parts.push(`${d.sent} offline post${d.sent === 1 ? "" : "s"} sent`);
  if (d.failed.length) parts.push(`${d.failed.length} couldn't post: ${d.failed[0]}`);
  return parts.join(" · ");
}
```

- [ ] **Step 4: Hook the client**

In `web/src/api/client.ts`:
1. Add `import { canQueue, enqueue } from "../lib/outbox";`.
2. After the `ApiError` class add:

```ts
// The write was saved to the offline outbox (lib/outbox.ts) and will be sent later.
export class QueuedError extends ApiError {
  constructor() {
    super(0, "Saved offline — will post when back online");
    this.name = "QueuedError";
  }
}
```

3. Split the fetch out of `req()` and catch network errors. Replace the start of `req()` up to and including the `const res = await fetch(...)` statement with:

```ts
function send(method: string, path: string, body?: unknown): Promise<Response> {
  // FormData (image uploads) goes as-is so the browser sets the multipart boundary.
  const isForm = body instanceof FormData;
  return fetch(base(path), {
    method,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      "X-Anon-Id": getAnonId(),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
}

// Outbox replay (lib/outbox.ts startOutbox): raw response, no queueing.
export const sendRaw = (path: string, body: unknown) => send("POST", path, body);

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body);
  } catch (err) {
    // fetch only rejects on network failure: offline writes wait in the outbox.
    if (method === "POST" && canQueue(path)) {
      if (body instanceof FormData) throw new ApiError(0, "Image posts need a connection");
      enqueue(path, body);
      throw new QueuedError();
    }
    throw err;
  }
```

Keep the rest of `req()` (the `setStale` line from Task 4, the `!res.ok` handling and `return res.json()`) unchanged.

- [ ] **Step 5: Run tests**

Run: `pnpm -C web test src/tests/outbox.test.ts src/tests/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/outbox.ts web/src/api/client.ts web/src/tests/outbox.test.ts
git commit -m "feat(pwa): offline outbox — queue writes made offline, flush when back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Outbox wiring (startup, toasts, Composer)

**Files:**
- Modify: `web/src/main.tsx`
- Modify: `web/src/overlays/OverlayProvider.tsx` (`OverlayHost`)
- Modify: `web/src/overlays/Composer.tsx` (`handleMutationError`)
- Test: `web/src/tests/composer.test.tsx` (add a case)

**Interfaces:**
- Consumes: `startOutbox`, `outboxMessage`, `OutboxEvent` (Task 5); `QueuedError`, `sendRaw` (Task 5).

- [ ] **Step 1: Write the failing test**

In `web/src/tests/composer.test.tsx` (mutations there are mocked; `renderReopenable` and the draft tests are the pattern), change the client import to `import { ApiError, QueuedError } from "../api/client";`, add `act` to the `@testing-library/react` import, and add inside `describe("Composer", ...)`:

```ts
  it("a post queued offline closes the composer and drops the draft", () => {
    mockAddCommentMutate.mockImplementation((_v: unknown, o?: { onError?: (e: unknown) => void }) => o?.onError?.(new QueuedError()));
    renderReopenable({ mode: "comment", recordId: "draft-q" });
    fireEvent.click(screen.getByText("open composer"));
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "offline read" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(screen.queryByPlaceholderText(/Say your piece/i)).toBeNull();
    expect(screen.queryByText(/Could not post/i)).toBeNull();

    fireEvent.click(screen.getByText("open composer"));
    expect(screen.getByPlaceholderText(/Say your piece/i)).toHaveValue("");
  });

  it("OverlayHost toasts outbox events", () => {
    renderReopenable({ mode: "comment", recordId: "draft-t" });
    act(() => {
      window.dispatchEvent(new CustomEvent("outbox", { detail: { sent: 2, failed: [] } }));
    });
    expect(screen.getByText(/2 offline posts sent/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C web test src/tests/composer.test.tsx`
Expected: FAIL — `QueuedError` exists after Task 5, but the composer stays open with "Could not post — try again", and no outbox toast appears.

- [ ] **Step 3: Composer treats queued as done**

In `web/src/overlays/Composer.tsx`, change the import to `import { ApiError, QueuedError } from "../api/client";` and make `handleMutationError` start with:

```ts
  function handleMutationError(err: unknown) {
    if (err instanceof QueuedError) {
      // Saved to the offline outbox: it will be sent, so the draft goes (OverlayHost toasts).
      drafts.delete(draftKey);
      closeComposer();
      return;
    }
    drafts.set(draftKey, { body, title: threadTitle }); // not sent: keep it
```

(rest of the function unchanged).

- [ ] **Step 4: Toasts for outbox events**

In `web/src/overlays/OverlayProvider.tsx`, inside `OverlayHost()` (it already reads the overlay context), add:

```ts
  // Offline outbox (lib/outbox.ts): "saved offline" and "N sent / couldn't post" toasts.
  useEffect(() => {
    const on = (e: Event) => toast(outboxMessage((e as CustomEvent<OutboxEvent>).detail));
    window.addEventListener("outbox", on);
    return () => window.removeEventListener("outbox", on);
  }, [toast]);
```

with `import { outboxMessage, type OutboxEvent } from "../lib/outbox";`. Use whatever name `OverlayHost` already binds the context's `toast` to; if it destructures the context differently, read `toast` from `useOverlay()`.

- [ ] **Step 5: Start the outbox at boot**

In `web/src/main.tsx` add imports `import { startOutbox } from './lib/outbox'` and `import { sendRaw } from './api/client'`, and after `const queryClient = makeQueryClient()`:

```ts
// Offline writes (lib/outbox.ts): replay on start/online/visible; refetch everything once sent.
startOutbox(sendRaw, () => void queryClient.invalidateQueries())
```

- [ ] **Step 6: Run tests**

Run: `pnpm -C web test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/main.tsx web/src/overlays/OverlayProvider.tsx web/src/overlays/Composer.tsx web/src/tests/composer.test.tsx
git commit -m "feat(pwa): wire the offline outbox — boot flush, toasts, composer closes on queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: "Install app" in the More menu

**Files:**
- Create: `web/src/lib/install.ts`
- Modify: `web/src/components/MoreMenu.tsx`
- Test: `web/src/tests/install.test.ts`

**Interfaces:**
- Produces from `web/src/lib/install.ts`: `isStandalone(): boolean`, `isIos(): boolean`, `installMode(): "prompt" | "ios" | null`, `promptInstall(): Promise<void>`, `useInstallMode()`. Task 14 uses `isIos` and `isStandalone`.

- [ ] **Step 1: Write the failing test**

`web/src/tests/install.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
const load = () => import("../lib/install");
const ua = (s: string) => vi.stubGlobal("navigator", { ...navigator, userAgent: s, maxTouchPoints: 5, platform: "iPhone" });

describe("installMode", () => {
  it("null when nothing to offer (desktop, no prompt event)", async () => {
    const m = await load();
    expect(m.installMode()).toBeNull();
  });
  it("prompt once the browser fired beforeinstallprompt", async () => {
    const m = await load();
    const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn(async () => {}) });
    window.dispatchEvent(e);
    expect(m.installMode()).toBe("prompt");
    await m.promptInstall();
    expect(e.prompt).toHaveBeenCalled();
    expect(m.installMode()).toBeNull();
  });
  it("ios steps on iPhone Safari", async () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    const m = await load();
    expect(m.installMode()).toBe("ios");
  });
  it("null when already running standalone", async () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    vi.stubGlobal("navigator", { ...navigator, standalone: true });
    const m = await load();
    expect(m.installMode()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C web test src/tests/install.test.ts`
Expected: FAIL — cannot resolve `../lib/install`.

- [ ] **Step 3: Implement**

`web/src/lib/install.ts`:

```ts
// "Install app" (spec Phase 1a). Chrome/Edge/Android fire beforeinstallprompt, which we
// keep and replay on tap; iOS Safari has no prompt, so the menu shows Add-to-Home-Screen steps.
import { useSyncExternalStore } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };
let deferred: InstallPromptEvent | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // our menu item replaces Chrome's mini-infobar
  deferred = e as InstallPromptEvent;
  ping();
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  ping();
});

export const isStandalone = () =>
  (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS reports itself as a Mac; touch points give it away.
export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function installMode(): "prompt" | "ios" | null {
  if (isStandalone()) return null;
  if (deferred) return "prompt";
  return isIos() ? "ios" : null;
}

export async function promptInstall() {
  const d = deferred;
  deferred = null;
  ping();
  await d?.prompt();
}

export const useInstallMode = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    installMode,
  );
```

- [ ] **Step 4: Menu item**

In `web/src/components/MoreMenu.tsx`:
1. Imports: `import { Download, Share } from "lucide-react";` and `import { promptInstall, useInstallMode } from "../lib/install";`.
2. Hoist the link class into a helper above the component and use it for the existing `<Link className=...>`:

```ts
const itemCls = (sheet: boolean) =>
  `flex w-full items-center gap-3 rounded-lg px-3 font-mono font-medium hover:bg-surface ${sheet ? "min-h-[48px] text-[14px]" : "min-h-[40px] text-[13px]"}`;
```

3. Add this component at the bottom of the file:

```tsx
function InstallItem({ sheet, close }: { sheet: boolean; close: () => void }) {
  const mode = useInstallMode();
  const [help, setHelp] = useState(false);
  if (!mode) return null;
  const tap = () => {
    if (mode === "ios") return setHelp((h) => !h);
    close();
    void promptInstall();
  };
  return (
    <li>
      <button type="button" onClick={tap} aria-expanded={mode === "ios" ? help : undefined} className={itemCls(sheet)} style={{ color: "var(--ink)" }}>
        <Download size={sheet ? 20 : 17} aria-hidden="true" />
        Install app
      </button>
      {help && (
        <p className="px-3 pb-2 font-mono text-[12px] leading-relaxed text-dim">
          Tap <Share size={13} aria-label="Share" className="inline align-[-2px]" /> then “Add to Home Screen”.
        </p>
      )}
    </li>
  );
}
```

4. In the `<ul>`, after `{items.map(...)}`, add `<InstallItem sheet={sheet} close={() => setOpen(false)} />`.

- [ ] **Step 5: Run tests**

Run: `pnpm -C web test src/tests/install.test.ts src/tests/shell.test.tsx src/tests/components.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify Phase 1 end to end in the browser pane**

1. `pnpm build:web`, `preview_start worker-dev`, open `http://localhost:8787/`.
2. `javascript_tool`: `(await fetch('/manifest.webmanifest')).headers.get('content-type')` → contains `manifest+json` (or `json`).
3. Offline post: `javascript_tool` cannot cut the network, so: open a doc, `preview_stop` the server, post a comment via the composer → toast "Saved offline — will post when back online", composer closes; `localStorage.outbox` has 1 item. `preview_start worker-dev`, then `javascript_tool`: `window.dispatchEvent(new Event('online'))` → toast "1 offline post sent", comment visible after reload. Screenshot.
4. `resize_window` preset `mobile`, open More menu: "Install app" shows only when Chrome fired `beforeinstallprompt` (it may not on localhost without engagement — acceptable); reset with preset `desktop`.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/install.ts web/src/components/MoreMenu.tsx web/src/tests/install.test.ts
git commit -m "feat(pwa): Install app item in the More menu (prompt on Chrome, steps on iOS)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Phase 1 is shippable here.** Deploy per `realufo-deploy-concurrent-chats` memory (clean worktree of HEAD, check pending migrations — none in Phase 1) only if the user asks.

---

## Phase 2 — Push notifications (behind `FEATURE_PUSH`)

### Task 8: Push tables, config, VAPID key script

**Files:**
- Create: `db/migrations/0035_push.sql`
- Create: `scripts/vapid-keys.mjs`
- Modify: `worker/env.ts`
- Modify: `wrangler.jsonc` (`vars`)
- Test: `worker/tests/push-schema.spec.ts`

**Interfaces:**
- Produces tables `push_subs`, `follows`, `push_state` (exact DDL below); env fields `FEATURE_PUSH?: string`, `VAPID_PUBLIC_KEY?: string`, `VAPID_PRIVATE_KEY?: string`, `VAPID_SUBJECT?: string`.

- [ ] **Step 1: Write the failing test**

`worker/tests/push-schema.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("push schema", () => {
  it("push_subs defaults: replies on, new files off, daily on", async () => {
    await env.DB.prepare("INSERT INTO push_subs(endpoint,actor_id,p256dh,auth) VALUES('https://p/1','a','k','s')").run();
    const r = await env.DB.prepare("SELECT replies,new_files,daily,fail_count FROM push_subs WHERE endpoint='https://p/1'").first();
    expect(r).toEqual({ replies: 1, new_files: 0, daily: 1, fail_count: 0 });
  });
  it("follows: one row per actor+target, kind and src checked", async () => {
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','thread','t1','auto')").run();
    await expect(env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','thread','t1','bell')").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','user','x','bell')").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','record','x','manual')").run()).rejects.toThrow();
  });
  it("push_state is a plain key/value table", async () => {
    await env.DB.prepare("INSERT INTO push_state(k,v) VALUES('new_files','2026-10-03 00:00:00')").run();
    expect((await env.DB.prepare("SELECT v FROM push_state WHERE k='new_files'").first<{ v: string }>())?.v).toBe("2026-10-03 00:00:00");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:worker worker/tests/push-schema.spec.ts`
Expected: FAIL — `no such table: push_subs`.

- [ ] **Step 3: Migration**

`db/migrations/0035_push.sql`:

```sql
-- Web Push (spec 2026-10-03-realufo-pwa-push-design §2a).
-- One row per browser push subscription; actor_id = salted anon id (same hash as votes/posts).
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  replies INTEGER NOT NULL DEFAULT 1,
  new_files INTEGER NOT NULL DEFAULT 0,
  daily INTEGER NOT NULL DEFAULT 1,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_subs_actor ON push_subs(actor_id);

-- What an anon actor follows. 'auto' = they posted there (obeys the replies pref),
-- 'bell' = they tapped the bell. Keyed by actor, not subscription, so follows made
-- before notifications are enabled count once they are.
CREATE TABLE follows (
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('thread','record','case','hub')),
  key TEXT NOT NULL, -- thread id | record id | case slug | 'agency/<slug>' | 'topic/<slug>' | 'location/<slug>'
  src TEXT NOT NULL CHECK(src IN ('auto','bell')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, kind, key)
);
CREATE INDEX idx_follows_target ON follows(kind, key);

-- Watermarks and throttles: 'new_files' → newest records.created_at pushed,
-- 'act:<kind>:<key>' → last activity push, 'daily:<x_posts.id>' → pick pushed.
CREATE TABLE push_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);
```

- [ ] **Step 4: Env + vars + key script**

`worker/env.ts`, append inside `Env`:

```ts
  FEATURE_PUSH?: string; // off | on (spec 2026-10-03-realufo-pwa-push-design)
  VAPID_PUBLIC_KEY?: string; // base64url uncompressed P-256 point (scripts/vapid-keys.mjs)
  VAPID_PRIVATE_KEY?: string; // secret: base64url private scalar `d`
  VAPID_SUBJECT?: string; // mailto: contact push services may use
```

`wrangler.jsonc`: inside `"vars"`, after the `"SOCIAL_SINCE"…"TIKTOK_PRIVACY"` line, add:

```jsonc
    // Web push (spec 2026-10-03-realufo-pwa-push-design): off | on. VAPID_PRIVATE_KEY is a secret.
    "FEATURE_PUSH": "off", "VAPID_PUBLIC_KEY": "", "VAPID_SUBJECT": "mailto:hello@realufo.org",
```

`scripts/vapid-keys.mjs`:

```js
// One-off: print a VAPID key pair for Web Push (spec 2026-10-03-realufo-pwa-push-design §2d).
//   node scripts/vapid-keys.mjs
// Public → wrangler.jsonc vars.VAPID_PUBLIC_KEY (and .dev.vars for local);
// private → `wrangler secret put VAPID_PRIVATE_KEY` (and .dev.vars). Never commit the private key.
const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url");
const { d } = await crypto.subtle.exportKey("jwk", k.privateKey);
console.log(`VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${d}`);
```

- [ ] **Step 5: Run tests**

Run: `pnpm test:worker worker/tests/push-schema.spec.ts worker/tests/schema.spec.ts && node scripts/vapid-keys.mjs | sed 's/PRIVATE_KEY=.*/PRIVATE_KEY=<hidden>/'`
Expected: tests PASS (if `schema.spec.ts` asserts an exact table list, add the three new tables to it); script prints an 87-char public key.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0035_push.sql scripts/vapid-keys.mjs worker/env.ts wrangler.jsonc worker/tests/push-schema.spec.ts
git commit -m "feat(push): D1 tables for subscriptions, follows, push state; VAPID key script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add `worker/tests/schema.spec.ts` to the `git add` only if you changed it.)

---

### Task 9: Web Push crypto + send (`worker/lib/webpush.ts`)

**Files:**
- Create: `worker/lib/webpush.ts`
- Test: `worker/tests/webpush.spec.ts`

**Interfaces:**
- Produces:
  - `interface PushSub { endpoint: string; p256dh: string; auth: string }`
  - `b64u.enc(b: ArrayBuffer | Uint8Array): string`, `b64u.dec(s: string): Uint8Array`
  - `importP256(raw: Uint8Array, d: string | undefined, alg: "ECDH" | "ECDSA", usages: KeyUsage[]): Promise<CryptoKey>`
  - `encrypt(sub: PushSub, payload: Uint8Array, fixed?: { salt: Uint8Array; asPublic: Uint8Array; asPrivate: CryptoKey }): Promise<Uint8Array>`
  - `vapidHeader(env: Env, endpoint: string, now?: number): Promise<string>`
  - `type SendResult = "ok" | "gone" | "error"`; `send(env: Env, sub: PushSub, msg: unknown, opts?: { ttl?: number; urgency?: "low" | "normal" | "high" }): Promise<SendResult>`

- [ ] **Step 1: Write the failing tests**

`worker/tests/webpush.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import { b64u, encrypt, importP256, vapidHeader, send } from "../lib/webpush";

// RFC 8291 §5 worked example. Before trusting a failure, re-check every string
// against https://www.rfc-editor.org/rfc/rfc8291#section-5 (copy them verbatim from there).
const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

async function vapidEnv() {
  const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer);
  const { d } = (await crypto.subtle.exportKey("jwk", k.privateKey)) as JsonWebKey;
  return { e: { ...env, VAPID_PUBLIC_KEY: b64u.enc(pub), VAPID_PRIVATE_KEY: d, VAPID_SUBJECT: "mailto:t@example.com" } as any, pubKey: k.publicKey };
}

afterEach(() => vi.restoreAllMocks());

describe("webpush", () => {
  it("base64url round-trips every padding length", () => {
    for (const n of [0, 1, 2, 3, 16, 65]) {
      const b = crypto.getRandomValues(new Uint8Array(n));
      expect([...b64u.dec(b64u.enc(b))]).toEqual([...b]);
    }
  });

  it("encrypt matches the RFC 8291 §5 example", async () => {
    const asPublic = b64u.dec(V.asPublic);
    const asPrivate = await importP256(asPublic, V.asPrivate, "ECDH", ["deriveBits"]);
    const out = await encrypt(
      { endpoint: "https://push.example/x", p256dh: V.uaPublic, auth: V.auth },
      new TextEncoder().encode(V.plaintext),
      { salt: b64u.dec(V.salt), asPublic, asPrivate },
    );
    expect(b64u.enc(out)).toBe(V.body);
  });

  it("VAPID header: ES256 JWT for the push service origin, verifiable with the public key", async () => {
    const { e, pubKey } = await vapidEnv();
    const now = Date.UTC(2026, 9, 3);
    const h = await vapidHeader(e, "https://fcm.googleapis.com/fcm/send/abc", now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(e.VAPID_PUBLIC_KEY);
    const claims = JSON.parse(new TextDecoder().decode(b64u.dec(m[2])));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:t@example.com" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, b64u.dec(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it("send: encrypted POST with push headers; 404/410 = gone, other failures = error", async () => {
    const { e } = await vapidEnv();
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const sub = { endpoint: "https://push.example/s1", p256dh: b64u.enc((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer), auth: b64u.enc(crypto.getRandomValues(new Uint8Array(16))) };
    let status = 201;
    let throws = false;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (throws) throw new TypeError("down");
      return new Response(null, { status });
    });
    expect(await send(e, sub, { title: "t" })).toBe("ok");
    const init = spy.mock.calls[0][1] as RequestInit;
    const hdr = init.headers as Record<string, string>;
    expect(hdr["Content-Encoding"]).toBe("aes128gcm");
    expect(hdr.TTL).toBe("86400");
    expect(hdr.Authorization).toMatch(/^vapid t=/);
    expect((init.body as Uint8Array).length).toBeGreaterThan(86);
    status = 410;
    expect(await send(e, sub, {})).toBe("gone");
    status = 404;
    expect(await send(e, sub, {})).toBe("gone");
    status = 500;
    expect(await send(e, sub, {})).toBe("error");
    throws = true;
    expect(await send(e, sub, {})).toBe("error");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:worker worker/tests/webpush.spec.ts`
Expected: FAIL — cannot resolve `../lib/webpush`.

- [ ] **Step 3: Implement**

`worker/lib/webpush.ts`:

```ts
// Web Push sender on WebCrypto: RFC 8291 (aes128gcm payload encryption) + RFC 8292
// (VAPID). No library — `web-push` leans on Node's https/crypto.
// Spec 2026-10-03-realufo-pwa-push-design §2d.
import type { Env } from "../env";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export type SendResult = "ok" | "gone" | "error";

const te = new TextEncoder();

export const b64u = {
  enc: (b: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// P-256 key from its raw uncompressed point (0x04 || x || y), plus the private scalar d when signing/deriving.
export function importP256(raw: Uint8Array, d: string | undefined, alg: "ECDH" | "ECDSA", usages: KeyUsage[]) {
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: b64u.enc(raw.slice(1, 33)), y: b64u.enc(raw.slice(33, 65)), ...(d ? { d } : {}) };
  return crypto.subtle.importKey("jwk", jwk, { name: alg, namedCurve: "P-256" }, false, usages);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// One aes128gcm record (RFC 8291 §3-4, RFC 8188). `fixed` injects salt + sender keys for the RFC test vector.
export async function encrypt(sub: PushSub, payload: Uint8Array, fixed?: { salt: Uint8Array; asPublic: Uint8Array; asPrivate: CryptoKey }) {
  const uaPublic = b64u.dec(sub.p256dh);
  let asPublic: Uint8Array;
  let asPrivate: CryptoKey;
  if (fixed) ({ asPublic, asPrivate } = fixed);
  else {
    const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
    asPrivate = kp.privateKey;
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await importP256(uaPublic, undefined, "ECDH", []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));
  const ikm = await hkdf(b64u.dec(sub.auth), ecdh, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 = padding delimiter of the last (only) record.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21); // salt(16) | record size(4) | key id length(1)
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

// VAPID JWTs live 12 h; reuse one per push-service origin for 11 h within an isolate.
const vapidCache = new Map<string, { h: string; until: number }>();
export async function vapidHeader(env: Env, endpoint: string, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const hit = vapidCache.get(aud);
  if (hit && hit.until > now) return hit.h;
  const key = await importP256(b64u.dec(env.VAPID_PUBLIC_KEY!), env.VAPID_PRIVATE_KEY!, "ECDSA", ["sign"]);
  const head = b64u.enc(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = { aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:hello@realufo.org" };
  const body = b64u.enc(te.encode(JSON.stringify(claims)));
  // WebCrypto ECDSA signatures are raw r||s — exactly the JOSE ES256 format.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`));
  const h = `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
  vapidCache.set(aud, { h, until: now + 11 * 3600 * 1000 });
  return h;
}

export async function send(env: Env, sub: PushSub, msg: unknown, opts: { ttl?: number; urgency?: "low" | "normal" | "high" } = {}): Promise<SendResult> {
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(env, sub.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(opts.ttl ?? 86400),
        Urgency: opts.urgency ?? "normal",
      },
      body: await encrypt(sub, te.encode(JSON.stringify(msg))),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
```

Note: the VAPID test uses a fixed `now` and the cache is keyed only by origin — the test's origin (`fcm.googleapis.com`) differs from the `send` test's (`push.example`), so the cache cannot leak between them.

- [ ] **Step 4: Run tests**

Run: `pnpm test:worker worker/tests/webpush.spec.ts`
Expected: PASS (4 tests). If only the RFC vector fails: re-copy the vector from the RFC; if it still fails, the bug is in `encrypt` (check info strings end with `\0` and the header layout).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/webpush.ts worker/tests/webpush.spec.ts
git commit -m "feat(push): Web Push on WebCrypto — RFC 8291 encryption, VAPID, send

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Router `ctx`, follows helpers, auto-follow on posting

**Files:**
- Create: `worker/lib/follows.ts`
- Modify: `worker/router.ts`
- Modify: `worker/index.ts` (`dispatch` call)
- Modify: `worker/routes/posts.ts`, `worker/routes/threads.ts`, `worker/routes/comments.ts`
- Test: `worker/tests/follows.spec.ts`

**Interfaces:**
- Produces from `worker/lib/follows.ts`:
  - `type FollowKind = "thread" | "record" | "case" | "hub"`
  - `autoFollow(env: Env, actor: string | null, kind: FollowKind, key: string): Promise<unknown>`
  - `later(ctx: ExecutionContext | undefined, p: Promise<unknown>): Promise<unknown> | void`
  - `followUrl(kind: FollowKind, key: string): string`
  - `hubLabel(key: string): string | undefined`
- Router handler type becomes `(req, env, params, ctx?: ExecutionContext) => Response | Promise<Response>`; `dispatch(req, env, ctx?)`.

- [ ] **Step 1: Write the failing tests**

`worker/tests/follows.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { actorId } from "../lib/anon";
import { followUrl, hubLabel } from "../lib/follows";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const as = (anon: string | null, p: string, body: unknown) =>
  call(p, { method: "POST", headers: anon ? { "X-Anon-Id": anon } : {}, body: JSON.stringify(body) });
const actor = (anon: string) => actorId(new Request("https://x", { headers: { "X-Anon-Id": anon } }), env.ANON_SALT);
const follows = async (a: string) =>
  (await env.DB.prepare("SELECT kind,key,src FROM follows WHERE actor_id=? ORDER BY kind,key").bind(a).all()).results;

describe("auto-follow on posting", () => {
  it("new thread and reply follow the thread", async () => {
    const t: any = await (await as("fa", "/api/threads", { board: "uap", op_body: "op" })).json();
    expect(await follows(await actor("fa"))).toEqual([{ kind: "thread", key: t.thread.id, src: "auto" }]);
    await as("fb", `/api/threads/${t.thread.id}/posts`, { body: "reply" });
    expect(await follows(await actor("fb"))).toEqual([{ kind: "thread", key: t.thread.id, src: "auto" }]);
  });
  it("record and case comments follow their record/case", async () => {
    await as("fc", "/api/records/CIA-UAP-017/comments", { body: "c" });
    await as("fc", "/api/cases/kaikoura/comments", { body: "c" });
    expect(await follows(await actor("fc"))).toEqual([
      { kind: "case", key: "kaikoura", src: "auto" },
      { kind: "record", key: "CIA-UAP-017", src: "auto" },
    ]);
  });
  it("posting twice keeps one row", async () => {
    await as("fc", "/api/records/CIA-UAP-017/comments", { body: "again" });
    expect((await follows(await actor("fc"))).length).toBe(2);
  });
  it("no anon id → no follow row (and the post still works)", async () => {
    const before = (await env.DB.prepare("SELECT count(*) c FROM follows").first<{ c: number }>())!.c;
    expect((await as(null, "/api/records/CIA-UAP-017/comments", { body: "anon" })).status).toBe(201);
    expect((await env.DB.prepare("SELECT count(*) c FROM follows").first<{ c: number }>())!.c).toBe(before);
  });
});

describe("follow helpers", () => {
  it("followUrl encodes ids (record ids can contain spaces)", () => {
    expect(followUrl("record", "of _Western")).toBe("/doc/of%20_Western");
    expect(followUrl("thread", "ut_ABC")).toBe("/thread/ut_ABC");
    expect(followUrl("case", "kaikoura")).toBe("/case/kaikoura");
    expect(followUrl("hub", "agency/fbi")).toBe("/agency/fbi");
  });
  it("hubLabel knows agency, location and topic hubs, not releases", () => {
    expect(hubLabel("agency/fbi")).toBe("FBI");
    expect(hubLabel("topic/project-blue-book")).toBe("Project Blue Book");
    expect(hubLabel("release/6")).toBeUndefined();
  });
});
```

(Seed ids `CIA-UAP-017`, board `uap`, case `kaikoura` are used by the existing `threads.spec.ts`; if a comment POST 404s, pick ids from `realufo-handoff/data.js`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:worker worker/tests/follows.spec.ts`
Expected: FAIL — cannot resolve `../lib/follows`.

- [ ] **Step 3: follows helpers**

`worker/lib/follows.ts`:

```ts
// Follows (spec 2026-10-03-realufo-pwa-push-design §2a). Keyed by the salted anon actor,
// not by push subscription, so following before enabling notifications still counts.
import type { Env } from "../env";
import { docHref } from "./ssr";
import { AGENCY_HUBS, LOCATION_HUBS } from "./hubs";
import { TOPIC_RULES } from "./topics";

export type FollowKind = "thread" | "record" | "case" | "hub";

// Posting somewhere follows it ('auto'); obeys the subscriber's "replies" pref.
export const autoFollow = (env: Env, actor: string | null, kind: FollowKind, key: string) =>
  actor
    ? env.DB.prepare("INSERT OR IGNORE INTO follows(actor_id,kind,key,src) VALUES(?,?,?,'auto')").bind(actor, kind, key).run()
    : Promise.resolve();

// After the response: ctx.waitUntil in production. Tests pass a ctx without waitUntil,
// so the work is awaited inline there (no D1 calls dangling past the test).
export function later(ctx: ExecutionContext | undefined, p: Promise<unknown>) {
  const safe = p.catch((e) => console.error("later", e));
  return ctx?.waitUntil ? ctx.waitUntil(safe) : safe;
}

export const followUrl = (kind: FollowKind, key: string) =>
  kind === "thread" ? `/thread/${encodeURIComponent(key)}` : kind === "record" ? docHref(key) : kind === "case" ? `/case/${encodeURIComponent(key)}` : `/${key}`;

// Followable hubs. Releases are not: new files always land under a new release slug.
const HUBS: Record<string, string> = Object.fromEntries([
  ...AGENCY_HUBS.map((h) => [`agency/${h.slug}`, h.label]),
  ...LOCATION_HUBS.map((h) => [`location/${h.slug}`, h.label]),
  ...TOPIC_RULES.map((t) => [`topic/${t.slug}`, t.label]),
]);
export const hubLabel = (key: string): string | undefined => HUBS[key];
```

- [ ] **Step 4: Thread `ctx` through the router**

`worker/router.ts`:
- Change the handler type to:
  `type H = (req: Request, env: import("./env").Env, params: Record<string, string>, ctx?: ExecutionContext) => Response | Promise<Response>;`
- Change `dispatch` signature to `export async function dispatch(req: Request, env: import("./env").Env, ctx?: ExecutionContext)` and the call to `await r.handler(req, env, params, ctx)`.

`worker/index.ts`: rename the fetch handler's `_ctx` parameter to `ctx` and change `const res = await dispatch(req, env);` to `const res = await dispatch(req, env, ctx);`.

- [ ] **Step 5: Auto-follow in the write routes**

`worker/routes/posts.ts`: `import { autoFollow } from "../lib/follows";` and directly after the `await env.DB.batch([...])` in `createPost`, add:

```ts
  await autoFollow(env, actor, "thread", p.id);
```

`worker/routes/threads.ts`: `import { autoFollow } from "../lib/follows";` and directly after the `await env.DB.batch([...])` in `createThread`, add:

```ts
  await autoFollow(env, actor, "thread", id);
```

`worker/routes/comments.ts`:
- Imports: change `import { newId, newNo } from "../lib/anon";` to `import { newId, newNo, postActor } from "../lib/anon";` and add `import { autoFollow } from "../lib/follows";`.
- Give `Target` a follow kind: `type Target = { col: "record_id" | "case_slug"; kind: "record" | "case"; id: string; exists: string; missing: string };`, and add `kind: "record"` to `recordT`, `kind: "case"` to `caseT`.
- In `create`, after the `INSERT INTO comments … .run();` statement, add:

```ts
  const actor = await postActor(req, env);
  await autoFollow(env, actor, t.kind, t.id);
```

- [ ] **Step 6: Run tests**

Run: `pnpm test:worker worker/tests/follows.spec.ts worker/tests/threads.spec.ts worker/tests/comments.spec.ts worker/tests/cases.spec.ts worker/tests/router.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/follows.ts worker/router.ts worker/index.ts worker/routes/posts.ts worker/routes/threads.ts worker/routes/comments.ts worker/tests/follows.spec.ts
git commit -m "feat(push): follows — auto-follow what you post in; router passes ctx

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Push + follow API, bootstrap flag

**Files:**
- Create: `worker/routes/push.ts`
- Modify: `worker/index.ts` (route registrations)
- Modify: `worker/routes/bootstrap.ts` (`features`)
- Modify: `web/src/api/types.ts` (`features` type)
- Test: `worker/tests/push-api.spec.ts`

**Interfaces:**
- Consumes: `FollowKind`, `followUrl`, `hubLabel` (Task 10); `actorId` (`worker/lib/anon.ts`); `allowWrite` (`worker/lib/ratelimit.ts`).
- Produces HTTP API (all JSON, all read `X-Anon-Id`):
  - `GET /api/push/config` → `{ publicKey: string }` | 404 when push off
  - `POST /api/push/subscribe` body `{ subscription: { endpoint, keys: { p256dh, auth } }, prefs?: { replies?: boolean; new_files?: boolean; daily?: boolean } }` → `{ ok: true }`
  - `POST /api/push/prefs` body `{ endpoint, replies?, new_files?, daily? }` → `{ ok: true }`
  - `POST /api/push/unsubscribe` body `{ endpoint }` → `{ ok: true }`
  - `GET /api/push/me?endpoint=` → `{ prefs: { replies: boolean; new_files: boolean; daily: boolean } | null; follows: { kind, key, src, title, url }[] }`
  - `GET /api/follows?kind=&key=` → `{ following: boolean }` (true only for a bell follow)
  - `POST /api/follows` body `{ kind, key, on: boolean }` → `{ following: boolean }`
  - `/api/bootstrap` → `features.push: boolean`

- [ ] **Step 1: Write the failing tests**

`worker/tests/push-api.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const ON = { ...env, FEATURE_PUSH: "on", VAPID_PUBLIC_KEY: "BPUBKEY" } as any;
const call = (p: string, init: RequestInit = {}, e: any = ON) => worker.fetch(new Request("https://x" + p, init), e, {} as any);
const post = (anon: string | null, p: string, body: unknown, e: any = ON) =>
  call(p, { method: "POST", headers: anon ? { "X-Anon-Id": anon } : {}, body: JSON.stringify(body) }, e);
const get = (anon: string, p: string) => call(p, { headers: { "X-Anon-Id": anon } });
const P256DH = "B" + "A".repeat(86); // 87 chars like a real 65-byte key
const AUTH = "A".repeat(22);
const sub = (endpoint: string) => ({ subscription: { endpoint, keys: { p256dh: P256DH, auth: AUTH } } });

describe("push config + bootstrap flag", () => {
  it("config 404 while off, key while on", async () => {
    expect((await call("/api/push/config", {}, { ...env, FEATURE_PUSH: "off" })).status).toBe(404);
    expect(await (await call("/api/push/config")).json()).toEqual({ publicKey: "BPUBKEY" });
  });
  it("bootstrap exposes features.push", async () => {
    const j: any = await (await call("/api/bootstrap")).json();
    expect(j.features.push).toBe(true);
    const off: any = await (await call("/api/bootstrap", {}, { ...env, FEATURE_PUSH: "off" })).json();
    expect(off.features.push).toBe(false);
  });
});

describe("subscriptions", () => {
  it("rejects bad endpoints/keys and missing anon id", async () => {
    expect((await post("s1", "/api/push/subscribe", sub("http://insecure/x"))).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", { subscription: { endpoint: "https://p/x", keys: { p256dh: "x", auth: AUTH } } })).status).toBe(400);
    expect((await post(null, "/api/push/subscribe", sub("https://p/x"))).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", sub("https://p/x"), { ...env, FEATURE_PUSH: "off" })).status).toBe(404);
  });
  it("subscribe → prefs defaults; prefs + unsubscribe only by the owner", async () => {
    expect((await post("s1", "/api/push/subscribe", sub("https://p/s1"))).status).toBe(200);
    let me: any = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s1"))).json();
    expect(me.prefs).toEqual({ replies: true, new_files: false, daily: true });
    expect((await post("other", "/api/push/prefs", { endpoint: "https://p/s1", daily: false })).status).toBe(404);
    expect((await post("s1", "/api/push/prefs", { endpoint: "https://p/s1", daily: false, new_files: true })).status).toBe(200);
    me = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s1"))).json();
    expect(me.prefs).toEqual({ replies: true, new_files: true, daily: false });
    expect((await post("other", "/api/push/unsubscribe", { endpoint: "https://p/s1" })).status).toBe(404);
    expect((await post("s1", "/api/push/unsubscribe", { endpoint: "https://p/s1" })).status).toBe(200);
    me = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s1"))).json();
    expect(me.prefs).toBeNull();
  });
  it("re-subscribing keeps prefs, moves the endpoint to the caller", async () => {
    await post("s2", "/api/push/subscribe", sub("https://p/s2"));
    await post("s2", "/api/push/prefs", { endpoint: "https://p/s2", daily: false });
    await post("s2b", "/api/push/subscribe", sub("https://p/s2"));
    const me: any = await (await get("s2b", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s2"))).json();
    expect(me.prefs.daily).toBe(false);
  });
});

describe("follows API", () => {
  it("unknown targets 404; release hubs not followable", async () => {
    expect((await post("f1", "/api/follows", { kind: "thread", key: "nope", on: true })).status).toBe(404);
    expect((await post("f1", "/api/follows", { kind: "hub", key: "release/6", on: true })).status).toBe(404);
    expect((await post("f1", "/api/follows", { kind: "user", key: "x", on: true })).status).toBe(404);
  });
  it("bell follow, listed in me with title + url, unfollow removes", async () => {
    expect(await (await post("f1", "/api/follows", { kind: "thread", key: "t1", on: true })).json()).toEqual({ following: true });
    expect(await (await post("f1", "/api/follows", { kind: "hub", key: "agency/fbi", on: true })).json()).toEqual({ following: true });
    expect(await (await get("f1", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: true });
    const me: any = await (await get("f1", "/api/push/me")).json();
    expect(me.follows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "thread", key: "t1", src: "bell", url: "/thread/t1" }),
        { kind: "hub", key: "agency/fbi", src: "bell", title: "FBI", url: "/agency/fbi" },
      ]),
    );
    expect(me.follows.find((f: any) => f.key === "t1").title).toBeTruthy();
    await post("f1", "/api/follows", { kind: "thread", key: "t1", on: false });
    expect(await (await get("f1", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: false });
  });
  it("bell upgrades an auto follow; bell state ignores auto rows", async () => {
    await post("f2", "/api/threads/t1/posts", { body: "hi" }); // auto
    expect(await (await get("f2", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: false });
    await post("f2", "/api/follows", { kind: "thread", key: "t1", on: true });
    expect(await (await get("f2", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:worker worker/tests/push-api.spec.ts`
Expected: FAIL — 404s for `/api/push/*` and `features.push` undefined.

- [ ] **Step 3: Implement the routes**

`worker/routes/push.ts`:

```ts
// Push subscription + follow API (spec 2026-10-03-realufo-pwa-push-design §2b).
// Every call is scoped to the caller's salted anon id (X-Anon-Id).
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";
import { followUrl, hubLabel, type FollowKind } from "../lib/follows";

const pushOn = (env: Env) => env.FEATURE_PUSH === "on";
const PREFS = ["replies", "new_files", "daily"] as const;
const b64 = (s: unknown, min: number, max: number): s is string =>
  typeof s === "string" && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s);

async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// Caller's actor id, or null when the request has no anon id (they'd all share "anon:none").
const caller = (req: Request, env: Env) => (req.headers.get("X-Anon-Id") ? actorId(req, env.ANON_SALT) : Promise.resolve(null));

async function owns(env: Env, actor: string | null, endpoint: unknown) {
  if (!actor || typeof endpoint !== "string") return false;
  return !!(await env.DB.prepare("SELECT 1 FROM push_subs WHERE endpoint=? AND actor_id=?").bind(endpoint, actor).first());
}

export function pushConfig(_req: Request, env: Env) {
  return pushOn(env) && env.VAPID_PUBLIC_KEY ? json({ publicKey: env.VAPID_PUBLIC_KEY }) : error(404, "push off");
}

// The endpoint is an unguessable capability URL only the subscribing browser knows,
// so whoever presents it owns it (upsert moves it to the caller; prefs are kept).
export async function subscribe(req: Request, env: Env) {
  if (!pushOn(env)) return error(404, "push off");
  const actor = await caller(req, env);
  if (!actor) return error(400, "missing anon id");
  const b = await body(req);
  const s = b.subscription ?? {};
  let url: URL | null = null;
  try {
    url = new URL(s.endpoint);
  } catch {
    // invalid
  }
  if (!url || url.protocol !== "https:" || String(s.endpoint).length > 1000) return error(400, "bad endpoint");
  if (!b64(s.keys?.p256dh, 80, 100) || !b64(s.keys?.auth, 16, 32)) return error(400, "bad keys");
  if (!(await allowWrite(env, req, "push"))) return error(429, "slow down");
  const p = b.prefs ?? {};
  const v = (k: string, d: number) => (typeof p[k] === "boolean" ? Number(p[k]) : d);
  await env.DB.prepare(
    `INSERT INTO push_subs(endpoint,actor_id,p256dh,auth,replies,new_files,daily) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET actor_id=excluded.actor_id, p256dh=excluded.p256dh, auth=excluded.auth, fail_count=0`,
  )
    .bind(s.endpoint, actor, s.keys.p256dh, s.keys.auth, v("replies", 1), v("new_files", 0), v("daily", 1))
    .run();
  return json({ ok: true });
}

export async function setPrefs(req: Request, env: Env) {
  if (!pushOn(env)) return error(404, "push off");
  const b = await body(req);
  if (!(await owns(env, await caller(req, env), b.endpoint))) return error(404, "not subscribed");
  const sets = PREFS.filter((k) => typeof b[k] === "boolean");
  if (!sets.length) return error(400, "nothing to set");
  await env.DB.prepare(`UPDATE push_subs SET ${sets.map((k) => `${k}=?`).join(",")} WHERE endpoint=?`)
    .bind(...sets.map((k) => Number(b[k])), b.endpoint)
    .run();
  return json({ ok: true });
}

// Works with push off too, so a browser can always clean up. Follows stay (cost nothing).
export async function unsubscribe(req: Request, env: Env) {
  const b = await body(req);
  if (!(await owns(env, await caller(req, env), b.endpoint))) return error(404, "not subscribed");
  await env.DB.prepare("DELETE FROM push_subs WHERE endpoint=?").bind(b.endpoint).run();
  return json({ ok: true });
}

export async function pushMe(req: Request, env: Env) {
  const actor = await caller(req, env);
  if (!actor) return json({ prefs: null, follows: [] });
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const sub = endpoint
    ? await env.DB.prepare("SELECT replies,new_files,daily FROM push_subs WHERE endpoint=? AND actor_id=?").bind(endpoint, actor).first<Record<string, number>>()
    : null;
  const { results } = await env.DB.prepare(
    `SELECT f.kind, f.key, f.src,
            CASE f.kind WHEN 'thread' THEN (SELECT title FROM threads WHERE id=f.key)
                        WHEN 'record' THEN (SELECT title FROM records WHERE id=f.key)
                        WHEN 'case' THEN (SELECT name FROM cases WHERE slug=f.key) END AS title
     FROM follows f WHERE f.actor_id=? ORDER BY f.created_at DESC LIMIT 200`,
  )
    .bind(actor)
    .all<{ kind: FollowKind; key: string; src: string; title: string | null }>();
  return json({
    prefs: sub && { replies: !!sub.replies, new_files: !!sub.new_files, daily: !!sub.daily },
    follows: results.map((r) => ({ kind: r.kind, key: r.key, src: r.src, title: r.title ?? hubLabel(r.key) ?? r.key, url: followUrl(r.kind, r.key) })),
  });
}

const EXISTS: Record<string, string> = {
  thread: "SELECT 1 FROM threads WHERE id=?",
  record: "SELECT 1 FROM records WHERE id=?",
  case: "SELECT 1 FROM cases WHERE slug=?",
};
async function targetExists(env: Env, kind: unknown, key: unknown) {
  if (typeof key !== "string" || typeof kind !== "string") return false;
  if (kind === "hub") return !!hubLabel(key);
  return !!EXISTS[kind] && !!(await env.DB.prepare(EXISTS[kind]).bind(key).first());
}

export async function getFollow(req: Request, env: Env) {
  const actor = await caller(req, env);
  const q = new URL(req.url).searchParams;
  const row = actor
    ? await env.DB.prepare("SELECT src FROM follows WHERE actor_id=? AND kind=? AND key=?").bind(actor, q.get("kind"), q.get("key")).first<{ src: string }>()
    : null;
  return json({ following: row?.src === "bell" });
}

export async function toggleFollow(req: Request, env: Env) {
  const actor = await caller(req, env);
  if (!actor) return error(400, "missing anon id");
  const b = await body(req);
  if (!(await targetExists(env, b.kind, b.key))) return error(404, "unknown target");
  if (!(await allowWrite(env, req, "follow"))) return error(429, "slow down");
  if (b.on)
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES(?,?,?,'bell') ON CONFLICT(actor_id,kind,key) DO UPDATE SET src='bell'")
      .bind(actor, b.kind, b.key)
      .run();
  else await env.DB.prepare("DELETE FROM follows WHERE actor_id=? AND kind=? AND key=?").bind(actor, b.kind, b.key).run();
  return json({ following: !!b.on });
}
```

- [ ] **Step 4: Register routes + flag**

`worker/index.ts`: `import { pushConfig, subscribe, setPrefs, unsubscribe, pushMe, getFollow, toggleFollow } from "./routes/push";` and after the last `on(...)` line:

```ts
on("GET", "/api/push/config", pushConfig);
on("POST", "/api/push/subscribe", subscribe);
on("POST", "/api/push/prefs", setPrefs);
on("POST", "/api/push/unsubscribe", unsubscribe);
on("GET", "/api/push/me", pushMe);
on("GET", "/api/follows", getFollow);
on("POST", "/api/follows", toggleFollow);
```

`worker/routes/bootstrap.ts`: change `features: { ask: env.FEATURE_ASK === "on" },` to `features: { ask: env.FEATURE_ASK === "on", push: env.FEATURE_PUSH === "on" },`.

`web/src/api/types.ts`: change `features?: { ask: boolean };` to `features?: { ask: boolean; push?: boolean };`.

- [ ] **Step 5: Run tests**

Run: `pnpm test:worker worker/tests/push-api.spec.ts worker/tests/bootstrap.spec.ts`
Expected: PASS. (If `bootstrap.spec.ts` asserts `features` with `toEqual({ ask: … })`, add `push: false` there.)

- [ ] **Step 6: Commit**

```bash
git add worker/routes/push.ts worker/index.ts worker/routes/bootstrap.ts web/src/api/types.ts worker/tests/push-api.spec.ts
git commit -m "feat(push): subscribe/prefs/unsubscribe/me + follow API, bootstrap push flag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Fan-out + activity pushes

**Files:**
- Create: `worker/lib/push.ts`
- Modify: `worker/routes/posts.ts`, `worker/routes/comments.ts` (fire `pushActivity`)
- Test: `worker/tests/push-activity.spec.ts`

**Interfaces:**
- Consumes: `send`, `PushSub`, `b64u` (Task 9); `followUrl`, `later`, `FollowKind` (Task 10).
- Produces from `worker/lib/push.ts`:
  - `interface PushMsg { title: string; body: string; url: string; tag: string }`
  - `pushOn(env: Env): boolean`
  - `clip(s: string, n: number): string`
  - `notify(env: Env, subs: PushSub[], msg: PushMsg): Promise<number>` (count delivered)
  - `pushActivity(env: Env, kind: "thread" | "record" | "case", key: string, author: string | null, snippet: string): Promise<void>`
  - `getState(env, k): Promise<string | null>`, `setState(env, k, v): Promise<void>` (used by Task 13)

- [ ] **Step 1: Write the failing tests**

`worker/tests/push-activity.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { actorId } from "../lib/anon";
import { b64u } from "../lib/webpush";
import { clip, pushActivity } from "../lib/push";

let E: any;
let ua: { p256dh: string; auth: string };
beforeAll(async () => {
  await seedTestDB(env.DB);
  const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  E = {
    ...env,
    FEATURE_PUSH: "on",
    VAPID_PUBLIC_KEY: b64u.enc((await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer),
    VAPID_PRIVATE_KEY: ((await crypto.subtle.exportKey("jwk", k.privateKey)) as JsonWebKey).d,
  };
  const u = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  ua = { p256dh: b64u.enc((await crypto.subtle.exportKey("raw", u.publicKey)) as ArrayBuffer), auth: b64u.enc(crypto.getRandomValues(new Uint8Array(16))) };
});

const actor = (anon: string) => actorId(new Request("https://x", { headers: { "X-Anon-Id": anon } }), env.ANON_SALT);
let hits: string[] = [];
let status = 201;
beforeEach(async () => {
  for (const t of ["push_subs", "follows", "push_state"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  hits = [];
  status = 201;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    hits.push(String(input));
    return new Response(null, { status });
  });
});
afterEach(() => vi.restoreAllMocks());

async function subscriber(anon: string, opts: { replies?: number } = {}) {
  const a = await actor(anon);
  await env.DB.prepare("INSERT INTO push_subs(endpoint,actor_id,p256dh,auth,replies) VALUES(?,?,?,?,?)")
    .bind(`https://push.test/${anon}`, a, ua.p256dh, ua.auth, opts.replies ?? 1)
    .run();
  return a;
}
const follow = (a: string, kind: string, key: string, src: "auto" | "bell") =>
  env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES(?,?,?,?)").bind(a, kind, key, src).run();

describe("pushActivity", () => {
  it("notifies bell followers and auto followers with replies on; never the author", async () => {
    const author = await subscriber("author");
    const bell = await subscriber("bell", { replies: 0 });
    const auto = await subscriber("auto");
    const muted = await subscriber("muted", { replies: 0 });
    for (const [a, src] of [[author, "auto"], [bell, "bell"], [auto, "auto"], [muted, "auto"]] as const) await follow(a, "thread", "t1", src);
    await pushActivity(E, "thread", "t1", author, "hello");
    expect(hits.sort()).toEqual(["https://push.test/auto", "https://push.test/bell"]);
  });

  it("author without an anon id: every follower is notified", async () => {
    const a = await subscriber("a1");
    await follow(a, "record", "CIA-UAP-017", "bell");
    await pushActivity(E, "record", "CIA-UAP-017", null, "x");
    expect(hits).toEqual(["https://push.test/a1"]);
  });

  it("throttles to one push per target per 10 minutes", async () => {
    const a = await subscriber("a2");
    await follow(a, "case", "kaikoura", "bell");
    await pushActivity(E, "case", "kaikoura", null, "1");
    await pushActivity(E, "case", "kaikoura", null, "2");
    expect(hits).toHaveLength(1);
    await env.DB.prepare("UPDATE push_state SET v=datetime('now','-11 minutes') WHERE k='act:case:kaikoura'").run();
    await pushActivity(E, "case", "kaikoura", null, "3");
    expect(hits).toHaveLength(2);
  });

  it("410 deletes the subscription; 5 failures in a row delete it too", async () => {
    const a = await subscriber("gone");
    await follow(a, "thread", "t2", "bell");
    status = 410;
    await pushActivity(E, "thread", "t2", null, "x");
    expect(await env.DB.prepare("SELECT 1 FROM push_subs WHERE actor_id=?").bind(a).first()).toBeNull();
    const b = await subscriber("flaky");
    await follow(b, "thread", "t3", "bell");
    status = 500;
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare("DELETE FROM push_state").run();
      await pushActivity(E, "thread", "t3", null, "x");
    }
    expect(await env.DB.prepare("SELECT 1 FROM push_subs WHERE actor_id=?").bind(b).first()).toBeNull();
  });

  it("does nothing while FEATURE_PUSH is off", async () => {
    const a = await subscriber("off");
    await follow(a, "thread", "t1", "bell");
    await pushActivity({ ...E, FEATURE_PUSH: "off" }, "thread", "t1", null, "x");
    expect(hits).toEqual([]);
  });

  it("a reply through the API pushes the thread's other followers", async () => {
    const a = await subscriber("watcher");
    await follow(a, "thread", "t1", "bell");
    const res = await worker.fetch(
      new Request("https://x/api/threads/t1/posts", { method: "POST", headers: { "X-Anon-Id": "replier" }, body: JSON.stringify({ body: "new reply" }) }),
      E,
      {} as any,
    );
    expect(res.status).toBe(201);
    expect(hits).toContain("https://push.test/watcher");
  });
});

describe("clip", () => {
  it("keeps payload text short", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("a".repeat(150), 100)).toHaveLength(100);
    expect(clip("a".repeat(150), 100).endsWith("…")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:worker worker/tests/push-activity.spec.ts`
Expected: FAIL — cannot resolve `../lib/push`.

- [ ] **Step 3: Implement fan-out + activity**

`worker/lib/push.ts`:

```ts
// Push fan-out (spec 2026-10-03-realufo-pwa-push-design §2d). Every sender no-ops
// unless FEATURE_PUSH=on and the VAPID keys are set.
import type { Env } from "../env";
import { send, type PushSub } from "./webpush";
import { followUrl } from "./follows";

export interface PushMsg {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const BATCH = 20;
// ponytail: Workers allow ~1000 subrequests per invocation, so one send reaches at most
// ~900 subscribers; move fan-out to Cloudflare Queues before the audience gets there.
const MAX_RECIPIENTS = 900;
const THROTTLE_MIN = 10;

export const pushOn = (env: Env) => env.FEATURE_PUSH === "on" && !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export const getState = async (env: Env, k: string) =>
  (await env.DB.prepare("SELECT v FROM push_state WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null;
export const setState = async (env: Env, k: string, v: string) => {
  await env.DB.prepare("INSERT INTO push_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
};

export async function notify(env: Env, subs: PushSub[], msg: PushMsg): Promise<number> {
  const uniq = [...new Map(subs.map((s) => [s.endpoint, s])).values()].slice(0, MAX_RECIPIENTS);
  const m = { ...msg, title: clip(msg.title, 80), body: clip(msg.body, 100) };
  let ok = 0;
  for (let i = 0; i < uniq.length; i += BATCH) {
    const res = await Promise.all(uniq.slice(i, i + BATCH).map(async (s) => [s, await send(env, s, m)] as const));
    const stmts = res.map(([s, r]) =>
      r === "ok"
        ? env.DB.prepare("UPDATE push_subs SET fail_count=0 WHERE endpoint=? AND fail_count>0").bind(s.endpoint)
        : r === "gone"
          ? env.DB.prepare("DELETE FROM push_subs WHERE endpoint=?").bind(s.endpoint)
          : env.DB.prepare("UPDATE push_subs SET fail_count=fail_count+1 WHERE endpoint=?").bind(s.endpoint),
    );
    stmts.push(env.DB.prepare("DELETE FROM push_subs WHERE fail_count>=5"));
    await env.DB.batch(stmts);
    ok += res.filter(([, r]) => r === "ok").length;
  }
  return ok;
}

const TITLE_SQL = {
  thread: "SELECT title t FROM threads WHERE id=?",
  record: "SELECT id t FROM records WHERE id=?",
  case: "SELECT name t FROM cases WHERE slug=?",
};

// Someone posted on a followed thread/record/case.
export async function pushActivity(env: Env, kind: "thread" | "record" | "case", key: string, author: string | null, snippet: string) {
  if (!pushOn(env)) return;
  // ≤1 push per target per 10 min (a hot thread shouldn't buzz phones): claim the slot atomically.
  const claimed = await env.DB.prepare(
    `INSERT INTO push_state(k,v) VALUES(?, datetime('now'))
     ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE push_state.v <= datetime('now', '-${THROTTLE_MIN} minutes')
     RETURNING k`,
  )
    .bind(`act:${kind}:${key}`)
    .first();
  if (!claimed) return;
  const { results: subs } = await env.DB.prepare(
    `SELECT s.endpoint, s.p256dh, s.auth FROM follows f JOIN push_subs s ON s.actor_id=f.actor_id
     WHERE f.kind=? AND f.key=? AND f.actor_id IS NOT ? AND (f.src='bell' OR s.replies=1)`,
  )
    .bind(kind, key, author)
    .all<PushSub>();
  if (!subs.length) return;
  const name = (await env.DB.prepare(TITLE_SQL[kind]).bind(key).first<{ t: string }>())?.t ?? key;
  await notify(env, subs, {
    title: kind === "thread" ? `New reply in ${name}` : `New comment on ${name}`,
    body: snippet,
    url: followUrl(kind, key),
    tag: `${kind}:${key}`,
  });
}
```

- [ ] **Step 4: Fire it from the write routes**

`worker/routes/posts.ts`:
- Signature: `export async function createPost(req: Request, env: Env, p: Record<string, string>, ctx?: ExecutionContext)`.
- Imports: `import { autoFollow, later } from "../lib/follows";` and `import { pushActivity } from "../lib/push";`.
- After the `await autoFollow(...)` line from Task 10, add:

```ts
  await later(ctx, pushActivity(env, "thread", p.id, actor, body));
```

`worker/routes/comments.ts`:
- Imports: `import { autoFollow, later } from "../lib/follows";` and `import { pushActivity } from "../lib/push";`.
- `async function create(req: Request, env: Env, t: Target, ctx?: ExecutionContext)`; after the `await autoFollow(...)` line add:

```ts
  await later(ctx, pushActivity(env, t.kind, t.id, actor, body));
```

- Exports pass `ctx` through:

```ts
export const addComment = (req: Request, env: Env, p: Record<string, string>, ctx?: ExecutionContext) => create(req, env, recordT(p.id), ctx);
export const addCaseComment = (req: Request, env: Env, p: Record<string, string>, ctx?: ExecutionContext) => create(req, env, caseT(p.slug), ctx);
```

- [ ] **Step 5: Run tests**

Run: `pnpm test:worker worker/tests/push-activity.spec.ts worker/tests/threads.spec.ts worker/tests/comments.spec.ts worker/tests/cases.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/push.ts worker/routes/posts.ts worker/routes/comments.ts worker/tests/push-activity.spec.ts
git commit -m "feat(push): fan-out with dead-sub cleanup; push followers on new replies/comments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: New-files digest + daily pick (cron)

**Files:**
- Modify: `worker/lib/push.ts` (add `pushNewFiles`, `pushDaily`)
- Modify: `worker/index.ts` (`runTick`)
- Test: `worker/tests/push-cron.spec.ts`

**Interfaces:**
- Consumes: `notify`, `pushOn`, `getState`, `setState` (Task 12); `docHref` (`worker/lib/ssr.ts`); `AGENCY_HUBS`, `LOCATION_HUBS` (`worker/lib/hubs.ts`); `TOPIC_RULES`, `topicWhere` (`worker/lib/topics.ts`, returns `{ sql, binds }` over alias `r`); `THREAD_SEP` (`worker/lib/x.ts`); `stripLinks` (`worker/lib/xcopy.ts`).
- Produces: `pushNewFiles(env: Env): Promise<void>`, `pushDaily(env: Env): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`worker/tests/push-cron.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { b64u } from "../lib/webpush";
import { pushNewFiles, pushDaily } from "../lib/push";

let E: any;
let ua: { p256dh: string; auth: string };
beforeAll(async () => {
  await seedTestDB(env.DB);
  const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  E = {
    ...env,
    FEATURE_PUSH: "on",
    VAPID_PUBLIC_KEY: b64u.enc((await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer),
    VAPID_PRIVATE_KEY: ((await crypto.subtle.exportKey("jwk", k.privateKey)) as JsonWebKey).d,
  };
  const u = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  ua = { p256dh: b64u.enc((await crypto.subtle.exportKey("raw", u.publicKey)) as ArrayBuffer), auth: b64u.enc(crypto.getRandomValues(new Uint8Array(16))) };
});

let hits: string[] = [];
beforeEach(async () => {
  for (const t of ["push_subs", "follows", "push_state", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'PC-%'").run();
  hits = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    hits.push(String(input));
    return new Response(null, { status: 201 });
  });
});
afterEach(() => vi.restoreAllMocks());

const sub = (name: string, cols: Record<string, number> = {}) =>
  env.DB.prepare("INSERT INTO push_subs(endpoint,actor_id,p256dh,auth,new_files,daily) VALUES(?,?,?,?,?,?)")
    .bind(`https://push.test/${name}`, name, ua.p256dh, ua.auth, cols.new_files ?? 0, cols.daily ?? 0)
    .run();
const record = (id: string, agency: string) =>
  env.DB.prepare("INSERT INTO records(id,archive,agency,title,status,created_at) VALUES(?,?,?,?, 'live', datetime('now','+1 minute'))")
    .bind(id, "wargov", agency, `Title ${id}`)
    .run();

describe("pushNewFiles", () => {
  it("first run only sets the watermark (no backlog flood)", async () => {
    await sub("all", { new_files: 1 });
    await pushNewFiles(E);
    expect(hits).toEqual([]);
    expect(await env.DB.prepare("SELECT v FROM push_state WHERE k='new_files'").first()).not.toBeNull();
  });

  it("digest to new_files subs and to followers of a matching hub, once", async () => {
    await sub("all", { new_files: 1 });
    await sub("fbi-fan");
    await sub("cia-fan");
    await sub("nobody");
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('fbi-fan','hub','agency/fbi','bell'),('cia-fan','hub','agency/cia','bell')").run();
    await pushNewFiles(E); // watermark
    await record("PC-1", "FBI");
    await pushNewFiles(E);
    expect(hits.sort()).toEqual(["https://push.test/all", "https://push.test/fbi-fan"]);
    hits = [];
    await pushNewFiles(E);
    expect(hits).toEqual([]);
  });

  it("topic hub followers match by the topic rule", async () => {
    await sub("bb-fan");
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('bb-fan','hub','topic/project-blue-book','bell')").run();
    await pushNewFiles(E);
    await env.DB.prepare("INSERT INTO records(id,archive,title,status,created_at) VALUES('PC-2','wargov','Project Blue Book case 1','live', datetime('now','+1 minute'))").run();
    await pushNewFiles(E);
    expect(hits).toEqual(["https://push.test/bb-fan"]);
  });
});

describe("pushDaily", () => {
  const xpost = (stream: string, ref: string, status: string) =>
    env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES(?,?,?,0,0,?, datetime('now'))")
      .bind(stream, ref, `Look at ${ref} https://realufo.org/doc/${ref}`, status)
      .run();

  it("pushes the posted pick to daily subs, at most once a day", async () => {
    await sub("daily", { daily: 1 });
    await sub("nodaily");
    await xpost("pick", "CIA-UAP-017", "posted");
    await pushDaily(E);
    expect(hits).toEqual(["https://push.test/daily"]);
    await xpost("showcase", "CIA-UAP-018", "posted");
    await pushDaily(E);
    expect(hits).toHaveLength(1); // 20 h guard
  });

  it("ignores drafts, failed posts and release announcements", async () => {
    await sub("daily", { daily: 1 });
    await xpost("pick", "A", "draft");
    await xpost("pick", "B", "failed");
    await xpost("release", "6", "posted");
    await pushDaily(E);
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:worker worker/tests/push-cron.spec.ts`
Expected: FAIL — `pushNewFiles` is not exported.

- [ ] **Step 3: Implement**

Append to `worker/lib/push.ts` (and add the imports at the top):

```ts
import { docHref } from "./ssr";
import { AGENCY_HUBS, LOCATION_HUBS } from "./hubs";
import { TOPIC_RULES, topicWhere } from "./topics";
import { THREAD_SEP } from "./x";
import { stripLinks } from "./xcopy";
```

```ts
// SQL selecting a followed hub's records (alias r) — same membership rules as routes/hubs.ts
// (topics by rule only: hand-picked `include` ids are older records, never "new").
function hubWhere(key: string): { sql: string; binds: string[] } | null {
  const [kind, slug] = key.split("/");
  if (kind === "topic") {
    const t = TOPIC_RULES.find((x) => x.slug === slug);
    return t ? topicWhere(t.rule) : null;
  }
  const h = (kind === "agency" ? AGENCY_HUBS : kind === "location" ? LOCATION_HUBS : []).find((x) => x.slug === slug);
  return h ? { sql: `r.${kind} IN (SELECT value FROM json_each(?))`, binds: [JSON.stringify(h.values)] } : null;
}

// Cron: one digest per subscriber for records that went live since the last run.
// ponytail: hub followers get the same all-files digest; per-hub digests if people ask.
export async function pushNewFiles(env: Env) {
  if (!pushOn(env)) return;
  const newest = (await env.DB.prepare("SELECT max(created_at) m FROM records WHERE status='live'").first<{ m: string | null }>())?.m;
  if (!newest) return;
  const wm = await getState(env, "new_files");
  await setState(env, "new_files", newest); // first: a crash mid-send never repeats the digest
  if (!wm || newest <= wm) return; // first run starts from now: no backlog flood
  const range = [wm, newest];
  const { results: recs } = await env.DB.prepare(
    `SELECT r.id, coalesce(a.label, r.archive) src FROM records r LEFT JOIN archives a ON a.id=r.archive
     WHERE r.status='live' AND r.created_at>? AND r.created_at<=? ORDER BY r.created_at DESC`,
  )
    .bind(...range)
    .all<{ id: string; src: string }>();
  if (!recs.length) return;
  const { results: keys } = await env.DB.prepare("SELECT DISTINCT key FROM follows WHERE kind='hub'").all<{ key: string }>();
  const hit: string[] = [];
  for (const { key } of keys) {
    const w = hubWhere(key);
    if (!w) continue;
    const any = await env.DB.prepare(`SELECT 1 FROM records r WHERE r.status='live' AND r.created_at>? AND r.created_at<=? AND ${w.sql} LIMIT 1`)
      .bind(...range, ...w.binds)
      .first();
    if (any) hit.push(key);
  }
  const { results: subs } = await env.DB.prepare(
    `SELECT endpoint, p256dh, auth FROM push_subs
     WHERE new_files=1 OR actor_id IN (SELECT actor_id FROM follows WHERE kind='hub' AND key IN (SELECT value FROM json_each(?)))`,
  )
    .bind(JSON.stringify(hit))
    .all<PushSub>();
  if (!subs.length) return;
  const one = recs.length === 1;
  await notify(env, subs, {
    title: one ? "New file in the archive" : `${recs.length} new files`,
    body: one ? recs[0].id : [...new Set(recs.map((r) => r.src))].slice(0, 3).join(", "),
    url: one ? docHref(recs[0].id) : "/archive",
    tag: "new-files",
  });
}

// Cron: the X bot's newest posted pick/showcase/highlight, to "daily" subscribers, ≤ once per 20 h.
export async function pushDaily(env: Env) {
  if (!pushOn(env)) return;
  const row = await env.DB.prepare(
    `SELECT x.id, x.stream, x.ref, x.text FROM x_posts x
     WHERE x.status='posted' AND x.stream IN ('pick','showcase','highlight') AND x.created_at > datetime('now','-1 day')
       AND NOT EXISTS (SELECT 1 FROM push_state WHERE k='daily:' || x.id)
       AND NOT EXISTS (SELECT 1 FROM push_state WHERE k LIKE 'daily:%' AND v > datetime('now','-20 hours'))
     ORDER BY x.id DESC LIMIT 1`,
  ).first<{ id: number; stream: string; ref: string; text: string }>();
  if (!row) return;
  await setState(env, `daily:${row.id}`, new Date().toISOString().slice(0, 19).replace("T", " "));
  const { results: subs } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subs WHERE daily=1").all<PushSub>();
  if (!subs.length) return;
  await notify(env, subs, {
    title: "RealUFO pick",
    body: stripLinks(row.text.split(THREAD_SEP)[0]).split("\n")[0],
    url: row.stream === "highlight" ? `/thread/${encodeURIComponent(row.ref)}` : docHref(row.ref),
    tag: "daily",
  });
}
```

Note: `setState` stores `YYYY-MM-DD HH:MM:SS` so the `v > datetime('now','-20 hours')` comparison is a correct string compare.

- [ ] **Step 4: Run them from the cron**

`worker/index.ts`: `import { pushNewFiles, pushDaily } from "./lib/push";` and at the end of `runTick`, after the `pollTick` line:

```ts
  await pushNewFiles(env).catch(logErr("pushFiles"));
  await pushDaily(env).catch(logErr("pushDaily"));
```

- [ ] **Step 5: Run tests**

Run: `pnpm test:worker worker/tests/push-cron.spec.ts worker/tests/manual-tick.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full worker suite**

Run: `pnpm test:worker`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/push.ts worker/index.ts worker/tests/push-cron.spec.ts
git commit -m "feat(push): cron digests — new archive files and the daily pick

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Web push client, SW notification handlers, follow bell

**Files:**
- Create: `web/src/lib/push.ts`
- Create: `web/src/components/FollowBell.tsx`
- Modify: `web/public/sw.js` (append push handlers)
- Modify: `web/src/main.tsx` (daily subscription resync)
- Modify: `web/src/screens/Doc.tsx`, `web/src/screens/Thread.tsx`, `web/src/screens/Case.tsx`, `web/src/screens/Hub.tsx`
- Test: `web/src/tests/followBell.test.tsx`

**Interfaces:**
- Consumes: `isIos`, `isStandalone` (Task 7); API from Task 11; `useBootstrap` (`web/src/api/queries.ts`); `useOverlay` (`web/src/overlays/OverlayProvider.tsx`).
- Produces:
  - `web/src/lib/push.ts`: `type EnableResult = "ok" | "denied" | "ios-install" | "unsupported"`, `pushSupported(): boolean`, `currentSub(): Promise<PushSubscription | null>`, `enablePush(): Promise<EnableResult>`, `disablePush(): Promise<void>`, `resyncPush(): Promise<void>`, `ENABLE_MSG: Record<Exclude<EnableResult, "ok">, string>`
  - `<FollowBell kind="thread" | "record" | "case" | "hub" id={string} />` (renders nothing while `features.push` is off)

Deviation from spec (deliberate): no `pushsubscriptionchange` handler — the SW cannot read the anon id (localStorage). Instead the app re-posts its current subscription once a day on start (`resyncPush`), which also restores rows the server deleted after failures.

- [ ] **Step 1: Write the failing test**

`web/src/tests/followBell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayProvider } from "../overlays/OverlayProvider";
import { FollowBell } from "../components/FollowBell";

vi.mock("../lib/push", () => ({
  enablePush: vi.fn(async () => "ok"),
  ENABLE_MSG: { denied: "Notifications blocked in browser settings", "ios-install": "Add to Home Screen first (Share → Add)", unsupported: "Notifications not supported here" },
}));
import { enablePush } from "../lib/push";

function setup(push: boolean, following = false) {
  const posts: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: RequestInit) => {
    const u = String(input);
    if (u.startsWith("/api/bootstrap")) return new Response(JSON.stringify({ features: { ask: false, push } }));
    if (u.startsWith("/api/follows") && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ following: !following }));
    }
    if (u.startsWith("/api/follows")) return new Response(JSON.stringify({ following }));
    return new Response("{}");
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OverlayProvider>
        <FollowBell kind="record" id="of _Western" />
      </OverlayProvider>
    </QueryClientProvider>,
  );
  return posts;
}

beforeEach(() => vi.restoreAllMocks());

describe("FollowBell", () => {
  it("hidden while push is off", async () => {
    setup(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: /follow/i })).toBeNull();
  });

  it("first tap enables push, then follows (id sent as-is)", async () => {
    const posts = setup(true);
    fireEvent.click(await screen.findByRole("button", { name: "Follow for notifications" }));
    await waitFor(() => expect(posts).toEqual([{ kind: "record", key: "of _Western", on: true }]));
    expect(enablePush).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Unfollow" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not follow when permission is refused", async () => {
    vi.mocked(enablePush).mockResolvedValueOnce("denied");
    const posts = setup(true);
    fireEvent.click(await screen.findByRole("button", { name: "Follow for notifications" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toEqual([]);
  });

  it("unfollow needs no permission", async () => {
    vi.mocked(enablePush).mockClear();
    const posts = setup(true, true);
    fireEvent.click(await screen.findByRole("button", { name: "Unfollow" }));
    await waitFor(() => expect(posts).toEqual([{ kind: "record", key: "of _Western", on: false }]));
    expect(enablePush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C web test src/tests/followBell.test.tsx`
Expected: FAIL — cannot resolve `../components/FollowBell`.

- [ ] **Step 3: Push client lib**

`web/src/lib/push.ts`:

```ts
// Web Push on the client (spec Phase 2c). Permission is only ever requested from a tap.
import { api } from "../api/client";
import { isIos, isStandalone } from "./install";

export type EnableResult = "ok" | "denied" | "ios-install" | "unsupported";

// Toast copy for the non-ok results (short: toasts are one line).
export const ENABLE_MSG: Record<Exclude<EnableResult, "ok">, string> = {
  denied: "Notifications blocked in browser settings",
  "ios-install": "Add to Home Screen first (Share → Add)",
  unsupported: "Notifications not supported here",
};

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const keyBytes = (b64: string) =>
  Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const save = (sub: PushSubscription) => api.post("/api/push/subscribe", { subscription: sub.toJSON() });

export async function enablePush(): Promise<EnableResult> {
  if (isIos() && !isStandalone()) return "ios-install"; // iOS: push only inside the installed app
  if (!pushSupported()) return "unsupported";
  const existing = await currentSub();
  if (existing) {
    await save(existing); // server may have dropped it after failures
    return "ok";
  }
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const { publicKey } = await api.get<{ publicKey: string }>("/api/push/config");
  const reg = await navigator.serviceWorker.ready;
  await save(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  return "ok";
}

export async function disablePush() {
  const sub = await currentSub();
  if (!sub) return;
  await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

// Once a day on app start: re-post the browser's subscription (it may have rotated,
// or the server dropped it). Stands in for pushsubscriptionchange, since the SW
// can't read the anon id from localStorage.
export async function resyncPush() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem("pushSync") === day) return;
    const sub = await currentSub();
    if (!sub) return;
    await save(sub);
    localStorage.setItem("pushSync", day);
  } catch {
    // offline / push off: try again next start
  }
}
```

- [ ] **Step 4: FollowBell**

`web/src/components/FollowBell.tsx`:

```tsx
// Bell on doc/thread/case/hub pages (spec Phase 2c). First tap turns notifications on
// (the permission prompt comes from this tap only), then follows the page.
import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useBootstrap } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";
import { enablePush, ENABLE_MSG } from "../lib/push";

export type FollowKind = "thread" | "record" | "case" | "hub";

export function FollowBell(props: { kind: FollowKind; id: string }) {
  // Outer gate: screens render this under test harnesses without push (or an overlay provider).
  return useBootstrap().data?.features?.push ? <Bell_ {...props} /> : null;
}

function Bell_({ kind, id }: { kind: FollowKind; id: string }) {
  const qc = useQueryClient();
  const { toast } = useOverlay();
  const [busy, setBusy] = useState(false);
  const key = ["follow", kind, id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ following: boolean }>(`/api/follows?${new URLSearchParams({ kind, key: id })}`),
  });
  const following = !!data?.following;

  async function tap() {
    setBusy(true);
    try {
      if (!following) {
        const r = await enablePush();
        if (r !== "ok") return toast(ENABLE_MSG[r]);
      }
      const res = await api.post<{ following: boolean }>("/api/follows", { kind, key: id, on: !following });
      qc.setQueryData(key, res);
      toast(res.following ? "Following — you'll be notified" : "Unfollowed");
    } catch {
      toast("Could not update — try again");
    } finally {
      setBusy(false);
    }
  }

  const Icon = following ? BellRing : Bell;
  const label = following ? "Unfollow" : "Follow for notifications";
  return (
    <button
      type="button"
      onClick={tap}
      disabled={busy}
      aria-label={label}
      title={label}
      aria-pressed={following}
      className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] border border-line text-dim hover:text-signal disabled:opacity-50"
      style={following ? { color: "var(--signal)" } : undefined}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 5: Place the bell on the four screens**

Each edit wraps the page heading in a flex row; the heading gains `min-w-0 flex-1`. Add `import { FollowBell } from "../components/FollowBell";` to each file.

`web/src/screens/Doc.tsx` (inside `titleBlock`, the `<h1 className="mb-3.5 text-[19px] …">…</h1>`):

```tsx
      <div className="flex items-start gap-2">
        <h1 className="mb-3.5 min-w-0 flex-1 text-[19px] font-bold leading-[1.3] text-ink" style={{ overflowWrap: "anywhere" }}>
          {/* existing h1 children unchanged */}
        </h1>
        <FollowBell kind="record" id={id} />
      </div>
```

(`id` is the route param already read at `Doc.tsx:157`.)

`web/src/screens/Thread.tsx` (the `<h2 className="mb-4 text-[18px] …">{thread.title}</h2>` at ~line 335):

```tsx
      <div className="flex items-start gap-2">
        <h2 className="mb-4 min-w-0 flex-1 text-[18px] font-bold leading-[1.28] text-ink">{thread.title}</h2>
        <FollowBell kind="thread" id={id} />
      </div>
```

`web/src/screens/Case.tsx` (the name `<h1 className="mb-[6px] text-[27px] …">`):

```tsx
      <div className="flex items-start gap-2">
        <h1 className="mb-[6px] min-w-0 flex-1 text-[27px] font-bold leading-[1.12] text-ink" style={{ letterSpacing: "-.01em" }}>
          {story?.title ?? caseDetail.name}
        </h1>
        <FollowBell kind="case" id={slug} />
      </div>
```

`web/src/screens/Hub.tsx` (the `<h1 className="mb-2 text-[19px] …">{data.title}</h1>`) — releases and decades are not followable:

```tsx
      <div className="flex items-start gap-2">
        <h1 className="mb-2 min-w-0 flex-1 text-[19px] font-bold leading-[1.3] text-ink">{data.title}</h1>
        {(kind === "agency" || kind === "topic" || kind === "location") && <FollowBell kind="hub" id={`${kind}/${slug}`} />}
      </div>
```

- [ ] **Step 6: SW notification handlers + daily resync**

Append to `web/public/sw.js` (before the trailing `void BUILD;`):

```js
// Push (spec Phase 2c): payload {title, body, url, tag} from worker/lib/push.ts.
self.addEventListener("push", (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    // non-JSON payload: show the generic notification
  }
  event.waitUntil(
    self.registration.showNotification(m.title || "RealUFO", {
      body: m.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: m.tag,
      data: { url: m.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        try {
          return await win.navigate(url);
        } catch {
          // uncontrolled window can't be navigated: open a new one
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
```

In `web/src/main.tsx`, inside the `window.addEventListener('load', …)` callback from Task 3, after the `register(...)` call, add:

```ts
    void import('./lib/push').then((m) => m.resyncPush())
```

- [ ] **Step 7: Run tests**

Run: `pnpm -C web test`
Expected: all PASS (screens' tests don't enable push, so the bell renders nothing there).

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/push.ts web/src/components/FollowBell.tsx web/public/sw.js web/src/main.tsx web/src/screens/Doc.tsx web/src/screens/Thread.tsx web/src/screens/Case.tsx web/src/screens/Hub.tsx web/src/tests/followBell.test.tsx
git commit -m "feat(push): follow bell on doc/thread/case/hub, push client, SW notifications

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Notifications screen, nav entry, crawler route, privacy note

**Files:**
- Create: `web/src/screens/Notifications.tsx`
- Modify: `web/src/router.tsx`
- Modify: `web/src/components/navItems.ts`
- Modify: `worker/lib/pages.ts` (ROUTES)
- Modify: `worker/lib/privacy.ts`
- Test: `web/src/tests/notifications.test.tsx`

**Interfaces:**
- Consumes: `currentSub`, `enablePush`, `disablePush`, `ENABLE_MSG` (Task 14); `/api/push/me`, `/api/push/prefs`, `/api/follows` (Task 11).

- [ ] **Step 1: Write the failing test**

`web/src/tests/notifications.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAppAt } from "./util";

vi.mock("../lib/push", () => ({
  currentSub: vi.fn(async () => ({ endpoint: "https://push.test/me" })),
  enablePush: vi.fn(async () => "ok"),
  disablePush: vi.fn(async () => {}),
  resyncPush: vi.fn(async () => {}),
  ENABLE_MSG: { denied: "d", "ios-install": "i", unsupported: "u" },
}));

let posts: Array<[string, unknown]>;
beforeEach(() => {
  posts = [];
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: RequestInit) => {
    const u = String(input);
    if (init?.method === "POST") {
      posts.push([u, JSON.parse(String(init.body))]);
      return new Response(JSON.stringify({ ok: true, following: false }));
    }
    if (u.startsWith("/api/bootstrap")) return new Response(JSON.stringify({ features: { ask: false, push: true }, archives: [], boards: [], stats: {}, ticker: [], sightings: [], places: [], cases: [] }));
    if (u.startsWith("/api/push/me"))
      return new Response(JSON.stringify({
        prefs: { replies: true, new_files: false, daily: true },
        follows: [{ kind: "hub", key: "agency/fbi", src: "bell", title: "FBI", url: "/agency/fbi" }],
      }));
    return new Response("{}");
  });
});

describe("Notifications screen", () => {
  it("shows prefs and follows; toggling a pref posts it", async () => {
    renderAppAt("/notifications");
    const files = await screen.findByRole("switch", { name: "All new files" });
    expect(files).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Replies to my posts" })).toBeChecked();
    expect(screen.getByRole("link", { name: "FBI" })).toHaveAttribute("href", "/agency/fbi");
    fireEvent.click(files);
    await waitFor(() => expect(posts).toContainEqual(["/api/push/prefs", { endpoint: "https://push.test/me", new_files: true }]));
  });

  it("removing a follow posts on:false", async () => {
    renderAppAt("/notifications");
    fireEvent.click(await screen.findByRole("button", { name: "Stop following FBI" }));
    await waitFor(() => expect(posts).toContainEqual(["/api/follows", { kind: "hub", key: "agency/fbi", on: false }]));
  });
});
```

(If `/api/bootstrap` needs more fields for the shell to render, copy the bootstrap fixture used in `shell.test.tsx`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C web test src/tests/notifications.test.tsx`
Expected: FAIL — no `/notifications` route.

- [ ] **Step 3: The screen**

`web/src/screens/Notifications.tsx`:

```tsx
// Notification settings (spec Phase 2c): on/off, what to hear about, what you follow.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useBootstrap } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { useOverlay } from "../overlays/OverlayProvider";
import { currentSub, disablePush, enablePush, ENABLE_MSG } from "../lib/push";

type Prefs = { replies: boolean; new_files: boolean; daily: boolean };
type Follow = { kind: string; key: string; src: string; title: string; url: string };
const PREF_LABELS: [keyof Prefs, string][] = [
  ["replies", "Replies to my posts"],
  ["new_files", "All new files"],
  ["daily", "Daily pick"],
];
const row = "flex min-h-[48px] items-center justify-between gap-3 border-b border-line py-2 font-mono text-[13px] text-ink";

export default function Notifications() {
  useSetPageTitle("NOTIFICATIONS", "What you hear about");
  const pushOn = !!useBootstrap().data?.features?.push;
  const { toast } = useOverlay();
  const qc = useQueryClient();
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined); // undefined = still checking
  useEffect(() => {
    void currentSub().then((s) => setEndpoint(s?.endpoint ?? null));
  }, []);
  const meKey = ["pushMe", endpoint];
  const { data: me } = useQuery({
    queryKey: meKey,
    queryFn: () => api.get<{ prefs: Prefs | null; follows: Follow[] }>(`/api/push/me${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`),
    enabled: pushOn && endpoint !== undefined,
  });

  if (!pushOn) return <p className="py-10 text-center font-mono text-[12px] text-faint">Notifications aren't available yet.</p>;

  const enabled = !!endpoint && !!me?.prefs;
  async function toggleEnabled() {
    if (enabled) {
      await disablePush();
      setEndpoint(null);
      return;
    }
    const r = await enablePush();
    if (r !== "ok") return toast(ENABLE_MSG[r]);
    setEndpoint((await currentSub())?.endpoint ?? null);
  }
  async function setPref(k: keyof Prefs, v: boolean) {
    await api.post("/api/push/prefs", { endpoint, [k]: v });
    void qc.invalidateQueries({ queryKey: meKey });
  }
  async function unfollow(f: Follow) {
    await api.post("/api/follows", { kind: f.kind, key: f.key, on: false });
    void qc.invalidateQueries({ queryKey: meKey });
  }

  return (
    <div data-screen="notifications" className="mx-auto max-w-[560px]">
      <label className={row}>
        Notifications on this device
        <input type="checkbox" role="switch" checked={enabled} onChange={toggleEnabled} />
      </label>
      {enabled &&
        PREF_LABELS.map(([k, label]) => (
          <label key={k} className={row}>
            {label}
            <input type="checkbox" role="switch" aria-label={label} checked={!!me?.prefs?.[k]} onChange={(e) => void setPref(k, e.target.checked)} />
          </label>
        ))}
      <h2 className="mb-1 mt-6 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">FOLLOWING</h2>
      {!me?.follows.length && <p className="py-3 font-mono text-[12px] text-faint">Tap the bell on a file, thread, case or hub to follow it.</p>}
      <ul>
        {me?.follows.map((f) => (
          <li key={`${f.kind}:${f.key}`} className={row}>
            <Link to={f.url} className="min-w-0 flex-1 truncate hover:text-signal">
              {f.title}
            </Link>
            <button
              type="button"
              onClick={() => void unfollow(f)}
              aria-label={`Stop following ${f.title}`}
              title="Stop following"
              className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] text-dim hover:text-signal"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Route, nav entry, crawler route, privacy**

`web/src/router.tsx`: next to the `/privacy` entry add

```tsx
          { path: "/notifications", lazy: screen(() => import("./screens/Notifications")) },
```

`web/src/components/navItems.ts`:
- Add `Bell` to the lucide import.
- `NavTab` gains `"notifications"`.
- Append to `MORE_ITEMS`: `{ tab: "notifications", icon: Bell, label: "Notifications", path: "/notifications" },`
- `useNavItems()` filters it like Ask:

```ts
export function useNavItems(): { tabs: NavItem[]; more: NavItem[] } {
  const f = useBootstrap().data?.features;
  return { tabs: NAV_ITEMS, more: MORE_ITEMS.filter((i) => (i.tab !== "ask" || f?.ask) && (i.tab !== "notifications" || f?.push)) };
}
```

- `activeTabForPath`: before the final `return "feed";` add `if (pathname === "/notifications") return "notifications";`.

`worker/lib/pages.ts`: add a loader next to `termsPage`

```ts
const notificationsPage: Loader = async () => ({
  meta: { title: "Notifications", description: "Choose which RealUFO updates reach this device.", type: "website", robots: "noindex" },
  body: "<h1>Notifications</h1>",
});
```

and in `ROUTES`, after the `/terms` line: `{ pattern: new URLPattern({ pathname: "/notifications" }), load: notificationsPage },`. (Check that `Page["meta"]` accepts `robots` — `pages.ts:73` already sets `robots: "noindex"` on another page; mirror its shape.)

`worker/lib/privacy.ts`: add a list item after the "Anonymous browser id" item:

```html
<li><b>Notifications (optional).</b> If you turn them on, we store your browser's push address, your notification choices and what you follow, linked to the hashed anonymous id. Turning notifications off deletes the push address.</li>
```

- [ ] **Step 5: Run tests**

Run: `pnpm -C web test && pnpm test:worker worker/tests/ssr.spec.ts worker/tests/meta.spec.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/Notifications.tsx web/src/router.tsx web/src/components/navItems.ts worker/lib/pages.ts worker/lib/privacy.ts web/src/tests/notifications.test.tsx
git commit -m "feat(push): Notifications screen (prefs + follows), More-menu entry, privacy note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End-to-end verification (local), rollout notes

**Files:** none changed unless a bug is found (fix it in the owning task's files, with a test, and commit).

- [ ] **Step 1: Local keys**

Run `node scripts/vapid-keys.mjs` and put both lines plus `FEATURE_PUSH=on` into `.dev.vars` (gitignored — confirm with `git check-ignore .dev.vars`). Apply the migration locally: `pnpm db:migrate:local`.

- [ ] **Step 2: Build + serve**

`pnpm build:web`, then `preview_start` name `worker-dev`, open `http://localhost:8787/`.

- [ ] **Step 3: Subscribe and receive a reply notification**

1. Open a thread page, tap the bell. The browser pane may show a permission prompt — ask the user to allow it if it appears (a notification permission is a browser setting the user grants, not one Claude clicks through on their behalf).
2. `javascript_tool`: `(await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint` → an `https://` endpoint.
3. Post a reply from a different anon id: `javascript_tool`:
   `await fetch('/api/threads/<id>/posts',{method:'POST',headers:{'X-Anon-Id':'e2e-other','content-type':'application/json'},body:JSON.stringify({body:'e2e reply'})}).then(r=>r.status)` → `201`.
4. A "New reply in …" notification should appear. The browser pane may not surface OS notifications; if none shows, confirm delivery instead: `preview_logs` has no `later` / push error lines, and `npx wrangler d1 execute realufo-db --local --command "SELECT fail_count FROM push_subs"` returns `0` (a rejected push would have raised it or deleted the row).

- [ ] **Step 4: Cron paths**

`curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8787/__tick` (ADMIN_TOKEN from `.dev.vars`) twice: first sets the new-files watermark; insert a record locally with `created_at = datetime('now','+1 minute')`, tick again → digest sent to a `new_files=1` subscriber (toggle it on in /notifications first).

- [ ] **Step 5: Lighthouse-style installability check**

`javascript_tool`: `(await fetch('/manifest.webmanifest')).ok && !!navigator.serviceWorker.controller` → `true`. Screenshot the More menu (mobile preset) showing Install app / Notifications. Reset viewport to `desktop`.

- [ ] **Step 6: Report + rollout plan to the user (do not deploy unasked)**

Rollout, in order, when the user says go:
1. Deploy with `FEATURE_PUSH: "off"` (migration 0035 applies via `pnpm deploy`; follow `realufo-deploy-concurrent-chats`: clean worktree of HEAD, check pending migrations, push the deployed commit).
2. `node scripts/vapid-keys.mjs` → set `VAPID_PUBLIC_KEY` in `wrangler.jsonc`, `wrangler secret put VAPID_PRIVATE_KEY`.
3. Flip `FEATURE_PUSH` to `"on"`, deploy, subscribe on a real Android/desktop Chrome, and have the user test iOS from the installed app (needs a real device).
4. Run `crawler/indexnow.py` only if public pages changed (the privacy page did).

---

## Self-review notes

- Spec coverage: install (T1, T7), SW + offline reading (T2, T3, T4), offline queue (T5, T6), data model (T8), crypto (T9), auto-follow + ctx (T10), API + flag (T11), activity pushes (T12), new files + daily (T13), bell + SW notifications (T14), settings screen + privacy (T15), manual verification + rollout (T16).
- Deliberate deviation: `pushsubscriptionchange` replaced by daily `resyncPush` (T14) — the SW can't read the anon id.
- Daily pick uses a per-post marker + 20 h guard instead of an id watermark, so a pick that sits in `pending` and posts late is still pushed exactly once.
