# RealUFO early fetch — design

Date: 2026-10-04 · Status: approved in chat, awaiting spec review
Origin: SEO + speed audit (`docs/audits/realufo-seo-speed-fixes-2026-10-04.md`, "Open" section)

## Goal

Make first visits **feel faster for real visitors**, with Lighthouse as a side check. The user picked this over chasing a Lighthouse score or crawler speed.

## Problem (measured 2026-10-04)

- The Lighthouse filmstrip for `/doc/DOW-UAP-PR067` (mobile, simulated) shows a dark blank screen to ~1.7 s, skeleton boxes to ~2.8 s, then content.
- Live doc landing over wifi: every `/api/*` call starts at ~1,118 ms, only after the JS bundle has downloaded and run. `/api/records/:id` then takes ~450 ms more, so content shows at ~1.57 s.
- `/api/records/:id` costs 0.35–0.6 s every time (`no-store`, D1).
- The homepage already avoids this wait: `index.html` starts `/api/feed` before the bundle loads (`window.__feed`, adopted by `useFeed`). No other route does this.

## Approach (chosen: A, "early fetch per route")

Start each page's first-render API calls from an inline script in `index.html` while the JS downloads. `api.get` adopts the in-flight result once. The data then arrives in parallel with the JS instead of after it.

Rejected:
- **(B) Inline the doc JSON into the HTML.** The HTML would wait on D1, grow by 40–50 KB, and tie the page memo's caching to the API's freshness.
- **(C) Edge cache or D1 read replicas for the API.** Revisit only if the API is still the bottleneck after A.

## Design

### 1. Inline early-fetch script (`web/index.html`)

It replaces today's `__feed` line. Plain ES5-safe JS, no imports:

- Read `ufo_anon` from `localStorage` inside a try. If there is an id, send it as `X-Anon-Id`. `/api/records/:id` uses it for "my verdict" and `/api/bootstrap` for presence. A first-time visitor has no id and no personal state, so no header is correct.
- Build the path list from `location.pathname` and `location.search` (section 2).
- For each path: `window.__early[path] = { at: performance.now(), p: fetch(path, { headers }).then(r => r.ok ? r.json().then(d => ({ d: d, stale: r.headers.get("X-SW-Cache") === "1" })) : null).catch(() => null) }`.

### 2. Routes and paths

| Landing URL | Early paths |
|---|---|
| every route | `/api/bootstrap`, `/api/hubs` |
| `/` | `/api/feed` |
| `/doc/:id` | `/api/records/<id>`, `/api/records/<id>/comments`; plus `/api/records?limit=40&offset=0` only when `location.search` is empty |
| `/archive` with empty `location.search` | `/api/records/facets`, `/api/records?limit=40&offset=0` |

- `<id>` is `decodeURIComponent` of the path segment, the same value `useParams` gives `useRecord`/`useComments`, so the key matches the hook's path string.
- When there is a query string, list paths are not guessed: filters and paging go through `recordsFilter`/`recordsPage`, which are too complex to mirror safely.
- Other routes are unchanged. Add them only when a measurement shows them slow.

### 3. Adoption (`web/src/api/client.ts`)

- `api.get(path)` first looks up `window.__early?.[path]`. On a hit it deletes the entry. If the entry started less than 10 s ago (`performance.now() - at < 10000`), it awaits `p`:
  - `{ d, stale }` → `setStale(stale)` and return `d` (same stale-banner behaviour as a normal GET);
  - `null` (network error or non-2xx) → fall through to the normal request.
- Older entries are dropped and a normal request is made, so a leftover entry never serves stale data later in the session.
- `useFeed`'s `__feed` special case is deleted; `/api/feed` goes through the generic path.
- `recordsPath` in `api/queries.ts` is exported for the drift test.

### 4. Safety

- Behaviour is never worse than today. Every failure (no `fetch`, an exception in the inline script, a non-OK response, expiry) ends in the hook's own request.
- The inline script is wrapped in try/catch, so it can never break page load.
- Service worker: early fetches are ordinary same-origin GETs in page context, so its network-first API rule and `X-SW-Cache` flag apply unchanged.
- The Worker's per-route `<head>` and `#root` injection (`worker/lib/meta.ts`) doesn't touch `<head>` scripts outside the META markers, so the inline script survives.

## Testing

1. **Drift test (web).** Read the real inline script out of `web/index.html` and run it in jsdom with a fake `location`, a `fetch` stub and `localStorage`. Assert, per route row in section 2, that the requested paths equal what the hooks request: `"/api/records/" + id`, `recordsPath({ limit: RECORDS_PAGE_SIZE, offset: 0 })`, `"/api/records/facets"`, `"/api/bootstrap"`, `"/api/hubs"`, `"/api/feed"`. Also assert `X-Anon-Id` is sent only when stored.
2. **Client tests.** Adopt-once (a second GET of the same path hits the network), `null` fallback, the 10 s expiry, and the stale flag restored.
3. **Existing `useFeed` / feed tests** pass with `__feed` folded in.
4. The full web and worker suites, plus `tsc -b`.

## Verification after deploy

- Live: `performance.getEntriesByType("resource")` on a doc landing, the archive and home shows the `/api/*` calls starting before the main JS finishes (target: start < 300 ms on wifi, against ~1,100 ms today).
- Lighthouse 12 mobile on `/`, `/archive`, `/doc/DOW-UAP-PR067`, before vs after (score, LCP, filmstrip). Results are appended to the audit doc.

## Out of scope

Font preloads (fonts already use `font-display` swap and don't block), edge caching or D1 replicas (approach C), SSR hydration, early fetches for other routes.
