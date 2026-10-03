# RealUFO Shorts player + searchable Shorts — design

Date: 2026-10-03 · Status: approved in chat (approach A)

## Goal

The 9:16 Shorts we post to social (operator showcase Shorts and the auto-cut
vertical twins) are watchable *as Shorts* inside realufo.org and findable via
search. Today tapping a clip in the home "Short clips" row opens `/doc/:id`,
which plays the original landscape, unwatermarked video — the Short itself is
only visible as a muted loop in the row.

## What the user said / decided

- Tap a Short → a Shorts player (full-screen vertical, swipe to next), with a
  way to reach the file page.
- Searchable through the existing `/archive` search: a "Shorts" strip above
  file results.
- Source of truth = approach A: derive the Short list at request time from R2
  + D1, no new table.

## What counts as a Short

A live record (`records.status='live'`) with an R2 object at either:

- `showcase/<archive>/<ID>.mp4` — operator Short (scripts/publish.sh
  --showcase, incl. article shorts). Wins over the twin when both exist.
- `clips-v/<archive>/<ID>.mp4` — auto-cut 9:16 twin (crawler clips.py).

One Short per record. Object existence is the flag (as today in `feedClips`).

## 1. API — `GET /api/shorts?q=&limit=`

`worker/routes/feed.ts` `feedClips(env)` becomes
`listShorts(env, { q?, limit? })` (moved to `worker/routes/shorts.ts`); the
feed calls `listShorts(env, { limit: 20 })` and keeps the `clips` key.

Response: `[{ id, title, thumb, clip, showcase: boolean }]`.

Order (unchanged from the current row):
1. showcase Shorts, newest showcase `x_posts.created_at` first;
2. remaining showcase Shorts (no post row);
3. twins: portrait source (`assets.crop` w < h) first, then
   `records.created_at DESC, id DESC`.

`limit`: default and max 200 (all Shorts; ~160 today). Bad/missing → default.

`q` (trimmed, non-empty): a Short matches when its record matches the archive
search — `metaMatch(q)` OR `record_fts MATCH ftsQuery(q)` — **or** every word
of `q` is a substring of its showcase post text (`x_posts.text`,
stream='showcase'). `metaMatch`/`ftsQuery` are exported from
`worker/routes/records.ts` (already module-level helpers) and reused; no copy.
Order with `q` is the same as without.

Errors: any R2/D1 failure → `[]` (feed must never fail; the strip just hides).

Route registered in `worker/index.ts` next to `/api/feed`. No extra caching
(`/api/feed` has none either).

## 2. Player — `/shorts/:id`

New lazy screen `web/src/screens/Shorts.tsx`, route `/shorts/:id`.

- Data: `useShorts(q)` → `/api/shorts?q=` (react-query, same pattern as
  `useFeed`). Queue = that list; `q` comes from `?q=` (search), else all
  Shorts. If `:id` is not in the `q` list (e.g. it stopped matching), the
  queue falls back to all Shorts; if still absent → "Short not found" with a
  link to `/doc/:id`.
- Layout: full-viewport column, CSS `scroll-snap-type: y mandatory`, one
  `100dvh` slide per Short, 9:16 `<video>` centered (`object-contain`, black
  bars on wide screens). Opens scrolled to `:id`.
- Playback: IntersectionObserver (threshold 0.6, as in `ClipCarousel`) —
  visible slide plays, others pause. Starts muted (autoplay policy); tapping
  the video toggles sound, and the choice sticks for later slides in the
  session. `loop`, `playsInline`, `preload="metadata"` for the current and
  next slide only, `none` for the rest.
- Overlay (bottom): ID + title, **View file ›** → `/doc/:id`, Share (Web Share
  API, fallback copy link). Top-left back button (history back, else `/`).
- URL: as the visible slide changes, `navigate(/shorts/<id>?q=…, { replace:
  true })`, so the address bar is always the shareable Short.
- Keyboard: ↑/↓ (and j/k) scroll one slide. Reduced motion: still plays (same
  reasoning as the home row: Android "animation scale 0").
- App chrome: rendered inside the normal layout but the page takes the full
  height; no other sections.

## 3. Entry points

- Home "Short clips" row (`ClipCarousel` in `web/src/screens/Feed.tsx`):
  links go to `/shorts/:id` instead of `/doc/:id`. The row's "all videos ›"
  link stays.
- `/archive` with a non-empty `q`: a **◆ Shorts (n)** strip above the file
  results, same 132px 9:16 cards as the home row (extract the card into a
  shared `ShortCard` component used by both). Tap →
  `/shorts/:id?q=<q>`. Hidden when loading fails or n = 0. Not shown without
  `q` (browsing filters only). No separate "Shorts" type filter (YAGNI).

## 4. SEO / crawler HTML

`worker/lib/pages.ts` gets a `/shorts/:id` entry that reuses `docPage` and
sets `canonicalPath: /doc/:id` — crawlers see the doc page; no duplicate
indexable URL. Not added to the sitemap or IndexNow.

## 5. Testing

Worker (`worker/tests/shorts.spec.ts`, moving the current `feedClips` cases):
- live + has object → listed; not live / no object → not;
- showcase served from `showcase/`, wins over its twin, appears once;
- ordering (showcase by post time, then portrait, then date);
- `q` matches title, FTS text, and showcase post text; non-matching excluded;
- R2 list failure → `[]`; `/api/feed` still returns `clips`.

Web (vitest + testing-library):
- Feed row links to `/shorts/:id`;
- Archive with `?q=` renders the Shorts strip with `?q=` in links; no strip
  without `q` or with zero results;
- Shorts screen: renders a slide per Short starting at `:id`, View file link,
  tap toggles muted, unknown id → not-found state.

## Out of scope

- A `/shorts` index/grid page, a Shorts type filter, comments/votes on the
  player, view counts, a D1 `shorts` table (approach B).
