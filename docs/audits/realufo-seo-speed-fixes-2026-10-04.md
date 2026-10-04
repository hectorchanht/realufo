# RealUFO.org SEO + Speed Fixes — 2026-10-04

Follow-up to the UI/UX audit (`realufo-uiux-audit-2026-10-03.md`). Based on live-site checks on 2026-10-03/04 (Search Console, public pages, telemetry). Ordered by impact.

---

## SEO

### 1. Unique title / meta description / OG tags per document page (high impact)
- **Problem:** 600+ `/doc/*` pages may share generic meta tags, making them look near-duplicate to Google.
- **Fix:**
  - Verify what each doc page currently renders for `<title>`, `meta[name="description"]`, `link[rel="canonical"]`, and Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`).
  - Make them unique per page. Suggested pattern:
    - `<title>`: `{DOC_ID} — {short title} · RealUFO`
    - `meta description`: first ~155 chars of the AI summary / TL;DR.
    - `og:image`: the document's thumbnail (absolute URL).
    - `canonical`: the canonical `/doc/{id}` URL.

### 2. Fix the dead RSS feed (high impact)
- **Problem:** `/rss.xml` is broken (footer link dead, `/rss` 404s) — flagged as a major bug in the UI/UX audit.
- **Fix:** Implement a valid RSS 2.0 feed of latest releases/files and point the footer link at it. RSS aids discovery and syndication.

### 3. Refresh `llms.txt` (medium impact)
- **Problem:** Agency counts are stale (sum = 547, doesn't match live site totals).
- **Fix:** Regenerate `llms.txt` / `llms-full.txt` from live data, and regenerate automatically on every release deploy.

### 4. Keep `sitemap.xml` fresh (already good — maintain)
- Status: already submitted to Search Console (700 pages + 165 videos discovered).
- **Fix:** Ensure new releases auto-update the sitemap and re-ping Search Console / IndexNow on deploy.

### 5. Indexing requests (in progress, no code change)
- 9 pages submitted 2026-10-03; `/doc/DOW-UAP-PR117` + `/browse` queued for quota reset. `/ask` noindex already removed — verify it's indexed in Search Console after resubmission.

---

## SPEED

### 1. Add favicon / fix `/favicon.ico` 404 (quick win)
- **Problem:** 404s on every page — one wasted request per pageview.
- **Fix:** Add `favicon.ico` plus `apple-touch-icon.png`; reference them in `<head>`.

### 2. Fix broken thumbnails (quick win)
- **Problem:** Telemetry showed thumbnail 404s on home / archive / boards / doc pages.
- **Fix:** Audit media/thumbnail URLs; fix or remove broken ones. Every broken image is a failed request plus a layout hole.

### 3. Thumbnail optimization + lazy loading (medium impact)
- **Fix:**
  - Serve thumbnails as WebP/AVIF with fallback.
  - Add `loading="lazy"` and explicit `width`/`height` (avoids layout shift / CLS).

### 4. Slim down document pages (medium impact)
- **Problem:** The PDF viewer doc page is the heaviest on the site; a previous check saw the renderer hang on a doc page.
- **Fix:** Code-split the viewer bundle, defer non-critical JS, and paginate or virtualize long lists on doc pages.

### 5. Cloudflare caching (verify)
- Status: site is already behind Cloudflare.
- **Fix:** Confirm cache rules cover static assets (images, JS, CSS) with long TTLs; consider edge caching for semi-static pages (archive listings).

---

## VERIFICATION (after deploy)

- Run Lighthouse (mobile + desktop) on `/`, `/archive`, and one doc page (e.g. `/doc/DOW-UAP-PR067`). Targets: LCP < 2.5s, CLS < 0.1, no 404s in network tab.
- Search Console: confirm `/ask` shows as indexed; check the Pages/Coverage report for newly excluded URLs.
- Spot-check: `/rss.xml` returns valid XML; `llms.txt` counts match the homepage totals; favicon loads (200).

---

## RESOLUTION (2026-10-04)

Each item was checked against live before any change.

| Item | Status |
|---|---|
| SEO 1 doc meta | **Already done.** Every `/doc/*` page has its own `<title>` (`{ID} — {title} · RealUFO`), meta description (official/AI summary, de-duplicated: 8 dupes of 594 left), canonical `/doc/{id}`, `og:title`/`og:url`, and `og:image` = that file's own share card (`assets.realufo.org/cards/<id>-…png`). Checked on PR067, FBI-UAP-D012, AARO-956955. |
| SEO 2 RSS | **Fixed 2026-10-03** (UI/UX audit #1). The feed was live but served as `rss+xml`, which Chrome downloads. Now `application/xml`, with `/rss` `/feed` `/feed.xml` aliases. |
| SEO 3 llms.txt | **Not stale.** It's generated live from D1 on every request (hub list cached ≤1h). Counts don't sum to the total because agency/location pages exist only for 5+ files. llms.txt now says so under Agencies and Locations. |
| SEO 4 sitemap | **Already automatic.** Generated live from D1; the daily ingest pings IndexNow; `/ask` added 2026-10-03. |
| SEO 5 indexing | `/ask` indexable since 733a1da8 (`/ask?q=` and `/notifications` stay noindex on purpose). |
| SPEED 1 favicon | **Fixed 2026-10-03.** `/favicon.ico` 200; `apple-touch-icon.png` was already linked. |
| SPEED 2 broken thumbs | **None found.** GET-checked all 1,122 thumbnail URLs (564 JPEG/PNG + 558 `-400.webp`): every one 200/206, and every live record has a thumb. Lighthouse saw zero 4xx/5xx on `/`, `/archive`, `/doc/DOW-UAP-PR067`. |
| SPEED 3 WebP + lazy | **Already done** on cards: `-400.webp` srcset + JPEG fallback, `loading="lazy"` (first row eager + `fetchpriority=high`), fixed aspect boxes (CLS 0–0.057). Thread post images were the only stragglers: now `loading="lazy"`. |
| SPEED 4 doc page weight | Doc is in the main bundle **on purpose** (aacdaa8: `/doc/*` is where search traffic lands). PDFs use the browser's native viewer (iframe), no pdf.js. The main JS is 94 KB brotli. Router comment corrected. |
| SPEED 5 caching | **Already done.** `/assets/*` `max-age=31536000, immutable` (cf HIT), thumbs 31 days (cf HIT), doc pre-render memo 1h per colo. |

Lighthouse 12, mobile, simulated slow 4G (2026-10-04):

| Page | Score | LCP (sim) | LCP (observed) | CLS | TBT |
|---|---|---|---|---|---|
| `/` | 76 | 5.3 s | ~1.4 s | 0.017 | 60 ms |
| `/archive` | 69 | 5.0 s | ~2.5 s | 0 | 50 ms |
| `/doc/DOW-UAP-PR067` | 73 | 5.2 s | ~2.4 s | 0.057 | 70 ms |

Open (separate perf project, not a quick fix): LCP is text, held back by **element render delay**. The SPA renders client-side, so the crawler pre-render in `#root` is swapped out after JS loads. A cold `/doc/*` also has **~1.3 s TTFB** (pre-render memo miss → D1). Options:
- serve the pre-rendered body as the first paint and hydrate onto it;
- warm the doc memo for top pages;
- preload the 2–3 critical woff2 files.
