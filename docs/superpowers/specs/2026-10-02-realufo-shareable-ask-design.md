# Shareable Ask answers — design

Date: 2026-10-02 · Builds on Spec 3 (`2026-10-02-realufo-ask-archive-design.md`) and the Ask history spec
(`2026-10-02-realufo-ask-history-share-design.md`).

## Goal

A shared Ask answer becomes a permanent, indexable page with a rich link preview, so good answers can be passed
around on social and pull visitors in from search.

1. **Frozen answers** — `ask_log` stores the answer text, so a shared answer never changes and opening it costs no
   AI call (today `ask_cache` expires after 7 days and old `/ask?q=` links re-run the model).
2. **Permalink page** — `/ask/123-what-did-the-1949-los-alamos-conference-conclude`, pre-rendered with its own
   title, description and `og:image`, **indexed** by search engines.
3. **One share button** — sharing makes the answer public (listed + indexed) and opens the share sheet.
4. **Seed content** — ~25 real, reviewed answers published on prod and copied to the local dev DB.

Agreed with the user:

| Decision | Choice |
|---|---|
| Indexing | Shared answer pages are indexed (sitemap + IndexNow). The `/ask` tab and `/ask?q=` stay `noindex`. |
| Share model | One button: share = public + link. Undo unpublishes. No private/unlisted links. |
| Preview image | First source thumbnail, else the site `og.png`. No generated card. |
| Storage | `ask_log` gets an `answer` column, written on every ask. |

## Non-goals

- Generated share-card images (possible follow-up spec).
- Unlisted/private links, link expiry, view counts.
- Admin moderation UI or takedown endpoint (takedown is a manual SQL update, §1.6).
- "Questions about this file" links on doc pages (add once enough shared answers exist).
- Backfilling answers for rows logged before this change.
- `QAPage` structured data (§2.3).

## 1. Worker — data and API

### 1.1 Migration `0022_ask_answer.sql`

```sql
-- Frozen answer for shared pages (JSON {answer, sources}); NULL on rows logged before this column.
ALTER TABLE ask_log ADD COLUMN answer TEXT;
```

### 1.2 `logAsk` stores the answer

`logAsk(env, req, q, data, cached)` takes the answer body instead of a source count and inserts
`JSON.stringify({ answer: data.answer, sources: data.sources })` into `answer`, and `data.sources.length` into
`sources`.

- Fresh path: the body from `answer()`, before `withHubs` (hub links stay live-computed, never stored).
- Cache-hit path: the parsed `ask_cache` JSON (it holds no hub links either).
- Not-covered answers (`sources: []`) are stored too; one code path, and they can never be shared (§1.3).

### 1.3 Share — `POST /api/ask/:id/public`

Same checks as today (boolean body, own row via `actor_id`, `allowWrite(... "ask_share")`, anything else 404), plus
`answer IS NOT NULL`:

```sql
UPDATE ask_log SET public=? WHERE id=? AND actor_id=? AND sources>0 AND answer IS NOT NULL RETURNING question
```

Response: `{ public: boolean, url: string }` where `url = askHref(id, question)` (§1.4) — the sharer's own row,
so each sharer's link stays theirs and undo only removes their own page.

### 1.4 `askHref` — `worker/lib/ask.ts`

```ts
export const askSlug = (q: string) =>
  q.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 60).replace(/-+$/, "");
export const askHref = (id: number, q: string) => `/ask/${id}${askSlug(q) ? "-" + askSlug(q) : ""}`;
export const askIdOf = (param: string) => Number(/^(\d+)(?:-|$)/.exec(param)?.[1]) || null;
```

The worker is the only place that builds the URL; the web uses `url` from API responses.

### 1.5 Read — `GET /api/asks/:id`

New handler `getSharedAsk` in `worker/routes/ask.ts`, registered as `on("GET", "/api/asks/:id", …)` (separate
prefix so it can never collide with `/api/ask/recent`).

- `askIdOf(params.id)`; `null` → 404.
- `SELECT id, question, answer, created_at FROM ask_log WHERE id=? AND public=1 AND answer IS NOT NULL`; no row → 404.
- Response: `{ id, question, answer, sources, asked_at, url }` with `sources` passed through `withHubs`.
- **Not gated by `FEATURE_ASK`**: no AI cost, and indexed pages must not vanish when new asks are paused.
- No rate row, no AI call. `cache-control: public, max-age=300`.

A shared loader `loadSharedAsk(env, id)` returns the row (parsed) or `null`; the route and the pre-render (§2) both
use it.

### 1.6 `GET /api/ask/recent`

Still one entry per distinct question (`lower(question)`), ordered by the newest share. Each entry now points at
the question's **canonical row** — the earliest public row with an answer — falling back to the newest public row
when none has an answer:

```sql
SELECT a.id, a.question, a.sources, a.created_at asked_at, a.answer IS NOT NULL has_answer
FROM (SELECT max(id) last,
             COALESCE(min(CASE WHEN answer IS NOT NULL THEN id END), max(id)) pick
      FROM ask_log WHERE public=1 GROUP BY lower(question)) g
JOIN ask_log a ON a.id = g.pick
ORDER BY g.last DESC LIMIT 20
```

Response items: `{ id, question, sources, asked_at, url }`, `url = has_answer ? askHref(id, question) : null`.

### 1.7 Undo and takedown

- Undo: `public=0` → `/api/asks/:id` 404s, the SPA shows Not Found. The pre-render data cache (`PAGE_TTL`, 1 h)
  may serve the old HTML to crawlers until it expires — accepted.
- Takedown: `wrangler d1 execute realufo-db --remote --command "UPDATE ask_log SET public=0 WHERE id=<id>"`.
- Questions render as plain text everywhere (never linkified), so a question carries no spam-link value.

## 2. Worker — answer page pre-render

### 2.1 Route

`worker/lib/pages.ts` ROUTES gains `{ pattern: new URLPattern({ pathname: "/ask/:id" }), load: sharedAskPage }`.
The `/ask` tab route keeps its `noindex` meta.

### 2.2 Canonical override

`Page` gains an optional `canonicalPath?: string`. `serveWithMeta` uses
`url.origin + (page.canonicalPath ?? url.pathname)` as the canonical URL (today it always uses the request path).

`sharedAskPage` sets `canonicalPath` to `askHref` of the earliest public row with an answer and the same
`lower(question)`:

```sql
SELECT min(id) id, question FROM ask_log WHERE public=1 AND answer IS NOT NULL AND lower(question)=lower(?)
```

(SQLite returns the bare `question` from the `min(id)` row.) So: a wrong or missing slug, and a later duplicate
share of the same question, both canonicalise to one URL per question. No redirects.

ponytail: `lower(question)` is an unindexed scan of `ask_log`; add an expression index
`ON ask_log(lower(question)) WHERE public=1` if the table grows large.

### 2.3 Meta

| Field | Value |
|---|---|
| `title` | the question |
| `description` | `AI answer from N declassified UAP files: ` + answer with `[n]` markers stripped (`snippet` trims to 160) |
| `image` | `thumb` of the first source that has one; else unset → `serveWithMeta` uses `og.png` |
| `type` | `article` |
| `robots` | unset (indexed) |
| `jsonLd` | `{ "@type": "WebPage", name: question, datePublished: iso(asked_at), citation: sources → { "@type": "CreativeWork", name: title, url: origin + "/doc/" + id } }` |
| `breadcrumbs` | Home `/` › Ask the Archive `/ask` › question (canonical path) |

Not `QAPage`: Google reserves it for pages where users submit answers; an AI answer marked up as one risks a manual
action.

`N` counts distinct source record ids.

### 2.4 Body — `askBody` in `worker/lib/ssr.ts`

Plain HTML, all text escaped:

- `<h1>` question
- `<p>` "AI answer drawn from the declassified files — it can be wrong. Check the sources."
- `<p>` answer, each `[n]` replaced by `<a href="/doc/<record_id>">[n]</a>` for source `n` (unknown `n` left as text)
- `<h2>Sources</h2>` + `<ol>` of `<a href="/doc/<id>">title</a>` (plus "p. X" for PDF pages)
- `<a href="/ask">Ask the archive your own question →</a>`

### 2.5 Discovery

- `sitemap.xml` adds one URL per distinct shared question (the canonical row), `lastmod` = its date:

  ```sql
  SELECT min(id) id, question, date(min(created_at)) d FROM ask_log
  WHERE public=1 AND answer IS NOT NULL GROUP BY lower(question)
  ```

  Not gated by `FEATURE_ASK` (same reason as §1.5).
- `crawler/indexnow.py --since-hours N` also submits shared answers from the window: it reads
  `SELECT DISTINCT id FROM ask_log WHERE public=1 AND answer IS NOT NULL AND created_at >= datetime('now','-N hours')`
  and keeps sitemap URLs whose path matches `/ask/<id>(-…)` for those ids — the slug is never rebuilt in Python.
  Ask URLs submitted this way count as "changed" even when no records changed.
- `llms.txt` unchanged.

## 3. Web

### 3.1 Types and queries

- `AskRecent` gains `id: number; url: string | null`.
- New `SharedAsk { id: number; question: string; answer: string; sources: AskSource[]; asked_at: string; url: string }`.
- `useSharedAsk(id)` → `GET /api/asks/:id`, key `["sharedAsk", id]`, `staleTime` 5 min, no retry on 404.
- `useShareAsk` mutation result becomes `{ public: boolean; url: string }`.

### 3.2 `AskCard` — split out of `AskAnswer.tsx`

`AskCard({ question, data, footer })` renders the existing card (answer with clickable `[n]`, sources, hub chips,
disclaimer) from data it is given. `AskAnswer` keeps fetching via `useAsk` and renders `AskCard`. One look for both
routes; no duplicated markup.

### 3.3 Share button

`web/src/lib/shareLink.ts`:

```ts
// "shared" | "copied" | "cancelled" | "failed"
export async function shareLink(title: string, url: string): Promise<ShareResult>
```

`navigator.share({ title, url })` when available (an `AbortError` → `"cancelled"`); otherwise
`navigator.clipboard.writeText(url)` → `"copied"`; anything else → `"failed"`. `url` is made absolute with
`location.origin`.

In `AskAnswer` (live answer, `data.log_id != null` and sources present) the "share publicly" toggle becomes **share**:

1. `POST /api/ask/:id/public {public:true}` → `url`.
2. `shareLink(question, url)`.
3. The footer then shows the link state: `✓ shared` + `copy link` + `post on X`
   (`https://x.com/intent/post?text=<question>&url=<abs url>`) + `undo` (`{public:false}`).
   `"failed"` shows the URL as selectable text instead.

"⤴ post to a board" stays as is.

### 3.4 `/ask/:id` — `web/src/screens/AskShared.tsx`

- Route `{ path: "/ask/:id", lazy: screen(() => import("./screens/AskShared")) }`.
- Parses the leading number (same rule as `askIdOf`); `useSharedAsk(id)`.
- Loading → the existing "consulting the archive…" card style; 404 → `NotFound`; other error → `LoadError`.
- Renders `AskCard` with a footer: **share** (`shareLink(question, data.url)`, already public, no POST) +
  `post on X`, then the Ask input form (submitting navigates to `/ask?q=…`).
- Page title: the question.
- Works regardless of `features.ask` (same reason as §1.5); only the input form hides when Ask is resting.

### 3.5 Shared questions list

In `AskHistory`, an item with `url` is a `<Link to={url}>` (free, frozen answer); an item without one keeps
re-asking through `onPick(question)`.

## 4. Seeding — prod and dev

`crawler/seed_asks.py` (stdlib only, like `indexnow.py`).

- `QUESTIONS`: ~25 hand-written questions grounded in the archive — e.g. the 1949 Los Alamos conference, the 2004
  Nimitz "Tic Tac" encounter, the GIMBAL / GOFAST videos, AARO's historical record report, Project Blue Book, FBI
  "flying disc" memos, Roswell, the NASA UAP study, the war.gov releases. Final list is checked against archive
  titles before running.
- `--ask`: for each question, `GET https://realufo.org/api/ask?q=` with a fixed `X-Anon-Id: realufo-seed`, 4 s apart
  (rate limit is 20/min); writes `{log_id, question, sources, answer}` per question to `--out`
  (default `seed_asks.json`, not committed).
- Review: every answer is read by hand; weak, wrong or source-less answers are dropped (re-worded and re-asked if
  worth keeping).
- `--share ID …`: `POST /api/ask/<id>/public {"public": true}` with the same `X-Anon-Id`; prints each `url`.
- `--to-local`: reads prod rows `WHERE public=1 AND answer IS NOT NULL` through the existing `ingest.d1` helper and
  writes them into the local D1 with `INSERT OR REPLACE` (same ids) via `wrangler d1 execute realufo-db --local
  --file`. Needed because `wrangler dev --local` has no Vectorize, so local Ask can't produce answers.
- After sharing on prod: `python3 crawler/indexnow.py <urls>`.

Cost: ~25–35 AI calls against a 2000/day cap.

## 5. Errors

- `/api/asks/:id` D1 error → 500; the SPA shows `LoadError` with retry. Pre-render D1 error → plain shell (existing).
- Share POST fails (429/404/network) → button returns to **share** with a short "couldn't share — try again".
- `navigator.share` and clipboard both unavailable → URL shown as selectable text.
- Stored answer JSON fails to parse → treated as not found (404).

## 6. Testing

Worker (`worker/tests/ask.spec.ts`, `meta.spec.ts`, `sitemap.spec.ts`, `ask-lib.spec.ts`):
- Fresh and cache-hit asks store `{answer, sources}` in `ask_log.answer` (no hub links).
- Share: 404 when `answer` is NULL or `sources=0`; success returns `url` with the row's slug; undo works.
- `/api/asks/:id`: 404 for private, NULL-answer, unknown and non-numeric ids; returns the stored answer with hub
  links; makes no AI calls; works with `FEATURE_ASK=off`.
- `/api/ask/recent`: items carry `id` + `url`; `url` null for rows without an answer; one entry per question
  pointing at the earliest answered public row; ordered by newest share.
- `askSlug` / `askHref` / `askIdOf`: punctuation, accents, 60-char cut without trailing hyphen, empty slug,
  `123`, `123-x`, `x-123`.
- Pre-render `/ask/:id`: title, description (no `[n]`), `og:image` from the first thumbed source, no robots tag,
  canonical = earliest duplicate's `askHref`, body contains question, source links; private id → 404 + noindex.
- Sitemap: one URL per distinct shared question; private and NULL-answer rows absent.

Web:
- `shareLink`: share path, `AbortError` → cancelled, clipboard fallback, failure.
- `AskAnswer`: share → POST then `shareLink`, shows copy/X/undo; undo POSTs `public:false`.
- `AskShared`: renders a stored answer from the mocked hook; 404 → NotFound; share does not POST.
- `AskHistory`: item with `url` links to it; item without re-asks.

## 7. Rollout

1. Check pending D1 migrations; apply `0022` to prod.
2. Deploy from a clean worktree of HEAD (other chats share this checkout).
3. `seed_asks.py --ask` → review → `--share` keepers → `--to-local`.
4. `indexnow.py` for the shared URLs.

Rows shared before this change have no stored answer: they stay in the list (re-asking on tap) and get no page
until someone asks and shares them again.
