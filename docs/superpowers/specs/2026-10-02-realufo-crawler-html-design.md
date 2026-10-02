# RealUFO — Crawler-visible HTML (SEO sub-project 1)

Date: 2026-10-02 · Status: approved design, pending spec review

## Why

Goal (user): make realufo.org rank better and get more popular across all
channels, SEO foundation first. Today every page is served as an empty SPA
shell (`<div id="root"></div>`) with per-route `<head>` meta injected by the
Worker (`worker/lib/meta.ts`). Consequences:

- Non-JS crawlers (AI crawlers, most social scrapers, Bing partially) see no
  page content at all. Google renders JS, but later and less reliably.
- Meta injection only runs when the request's `Accept` contains `text/html`.
  Scrapers sending `Accept: */*` (e.g. `facebookexternalhit`) get the generic
  site title and image, so shared links preview generically.
- The homepage has no canonical and no `WebSite` JSON-LD; it links to nothing
  in raw HTML, so no link equity reaches the 594 doc pages except via sitemap.

This is sub-project 1 of 5. Out of scope here: PDF full text on doc pages (2),
hub landing pages for agency/release/location (3), Cloudflare AI-bot blocking
toggle (4, dashboard only — GPTBot/ClaudeBot currently get 403), distribution
via Reddit/X (5).

## Approach

Worker string-renders plain semantic HTML into `#root` for routes it already
handles in `serveWithMeta`. `web/src/main.tsx` uses `createRoot(...).render`,
which replaces `#root`'s children on mount, so users get the SPA as today and
bots get real content. The rendered content is the same information the SPA
shows on that URL (no cloaking).

Rejected: full React SSR + hydrate (router/data refactor, hydration mismatch
risk, bigger Worker); build-time prerender (data is in D1 and changes daily).

## Behaviour

### Accept gate
For paths matched by `STATIC_META` or `META_ROUTES` (plus `/`, see below),
inject on every `GET` regardless of `Accept`. Those paths only ever serve
HTML. All other paths keep passing straight to `env.ASSETS.fetch(req)`.

### Homepage `/`
`/` is added to `run_worker_first` in `wrangler.jsonc` (exact `"/"` entry only,
not a wildcard — assets must keep skipping the Worker).
- `<head>`: default title/description as now, plus `<link rel="canonical">`
  and `WebSite` JSON-LD (`name`, `url`, `potentialAction` SearchAction →
  `/archive?q={search_term_string}` — Archive initialises its search box
  from `?q=`).
- Body: h1 "RealUFO — Declassified UAP Archive", one intro paragraph (the
  default description), nav links (Archive, Boards, Map), and a "Latest files"
  list: the 30 most recent records (`ORDER BY created_at DESC`) as links
  `/doc/<id>` with their titles.

### Tab pages `/archive`, `/boards`, `/map`
Body: h1 = page title, the existing static description, nav links.
`/archive` additionally lists every agency with its count as text (no links
yet — hub pages are sub-project 3) and the 30 latest records like `/`.
`/boards` lists boards (`/board/<slug>` links with desc).

### Doc `/doc/:id`
Data: the same as `GET /api/records/:id`. `getRecord` is split into
`loadRecord(env, id)` returning the plain object (or `null`) and the route
wrapper that `json()`s it; `meta.ts` calls `loadRecord`. One load serves both
`<head>` meta and body, replacing the current separate doc query in
`lookupMeta`.

Body:
- Breadcrumb nav: Home › Archive › `<agency>` (agency as text) and
  `BreadcrumbList` JSON-LD (Home, Archive, the doc).
- h1: full official title including id (per uapbrowser reference — do not
  use `shortTitle` for the h1).
- Facts `<dl>`: file id, agency (full name), incident date, location,
  released in (Release NN, date) when present, file type, video length (m:ss)
  when present.
- Summary as paragraphs (split on blank lines / newlines).
- Link to the file: `/api/file/<id>` ("Open original file").
- Series: prev/next links when present.
- Related: one `<section>` per group, h2 = group label (e.g. "Same location:
  Nevada"), list of `/doc/<id>` links with titles.
- Discussion: promoted threads as `/thread/<id>` links.

### Case `/case/:slug`
h1 name, lede, pull quote (`<blockquote>` with cite), link to its thread
when present (same query as `worker/routes/cases.ts`).

### Thread `/thread/:id`
h1 title, board link, OP body and up to 50 replies as `<article>`s (handle +
body), reusing the posts already loaded for JSON-LD. Linked source record →
`/doc/<id>` link.

### Board `/board/:slug`
h1 name, desc, latest 50 threads as `/thread/<id>` links.

### Not found
Entity missing → unchanged index.html as today (no body content). Response
status stays 200 (SPA renders its own 404; changing status is out of scope).

## Rendering

- New module `worker/lib/ssr.ts`: small pure functions
  `(data) → string` per page kind, plus a shared `layout(body)` wrapper.
  `meta.ts` decides the route, loads data, calls `injectMeta` for `<head>`
  and a new `injectBody(html, bodyHtml)` that replaces the inner of
  `<div id="root"></div>` (exact-match; if not found, html is returned
  unchanged).
- **Every interpolated value goes through `esc()`** (move it to a shared
  export). Thread/reply bodies and handles are anonymous user input — this
  is the XSS boundary. URLs built only from ids via `encodeURIComponent`.
- Inline `<style>` scoped to `#root > .ssr` in the injected body: dark
  background matching `theme-color #07080c`, light text, max-width column,
  system font. Keeps the pre-JS moment readable instead of unstyled. No
  external CSS, no images (avoid layout jank and extra fetches).
- No client changes needed: `createRoot` already clears `#root`.

## Performance

A doc page's full load (record, assets, promoted threads, series, releases,
4 related groups) is ~9 D1 queries. To keep D1 reads per HTML request near
zero (user requirement):

- The loaded **page data** (`{ meta, body }` JSON, not the final HTML) is
  stored in the Workers Cache API (`caches.default`) under the key
  `<origin>/__page<pathname>` with `cache-control: max-age=3600`. A hit costs
  0 D1 queries; D1 runs at most once per path per colo per hour.
- Caching the data rather than the HTML means a deploy (new JS bundle hash in
  index.html) never serves stale HTML; index.html is still fetched from
  ASSETS each request (no D1).
- Key uses pathname only, so query strings can't bust the cache.
- `null` (entity not found) is not cached.
- 1h staleness only affects what crawlers see: humans get fresh data from the
  SPA's API calls after mount.
- The doc thumbnail is picked from the already-loaded `assets` in JS instead
  of a separate `thumbSql` query.

## Testing

Extend `worker/tests/meta.spec.ts` (seeded D1 via `seedTestDB`):
1. `/doc/<seed id>` with `Accept: */*` → per-record `<title>` and an `<h1>`
   containing the full title, and a related or series `/doc/` link.
2. `/thread/<seed id>` where a post body contains `<script>alert(1)</script>`
   → output contains `&lt;script&gt;` and no raw `<script>alert`.
3. `/` → canonical link, `WebSite` JSON-LD, at least one `/doc/` link.
4. Unknown `/doc/nope` → body has empty `<div id="root"></div>`.
5. Non-matched path (e.g. `/favicon.svg`) still served by ASSETS untouched.
6. Page cache: render a board, delete its row, render again → still served
   (from cache, no D1).

Manual after deploy: `curl -A facebookexternalhit/1.1 https://realufo.org/doc/CIA-UAP-017`
shows the record title; Google Rich Results test on one doc URL; load page in
browser and confirm no visible flash beyond the dark pre-render.
