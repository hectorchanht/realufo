# RealUFO — App Foundation (Spec 1)

**Date:** 2026-07-22
**Status:** approved-pending-review
**Scope:** Phase-1 deliverables 1–4 (scaffold, schema+seed, screens+overlays, anonymous posting e2e, auth stub). Deliverable 5 (Queues ingest pipeline) + Vectorize semantic search + full CSV backfill are **Spec 2**.

---

## 1. Goal

Ship a live, mobile-first web app that matches the `RealUFO.dc.html` prototype exactly (CRT declassified-terminal aesthetic), backed by a real Cloudflare Worker + D1 + R2, with anonymous-by-default discussion wired end-to-end including the comment → board promotion flow.

Reuse: the existing `realufo` R2 bucket (live at `assets.realufo.org`), the `data.js` seed dataset, and (later, Spec 2) the crawler + `uap-data.csv`.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Build sequence | App first (this spec); ingest pipeline + semantic search second (Spec 2) |
| Framework | React + Vite + TypeScript + Tailwind + lucide-react. **Not Next.js** (client-heavy app, direct prototype port, cleaner CF fit) |
| Topology | Single Cloudflare Worker serving Static Assets (built SPA) + `/api/*` routes |
| Provisioning | Local-first (`wrangler dev`, local D1/R2); provision live + deploy once working |
| CF account | Flow Account `280bedba354e1a13c921727f30686447` (hosts existing `realufo` bucket) |
| Seed depth | `data.js` only — 28 records + all cases/boards/threads/comments/ticker/map/stats |
| GitHub | New public repo `hectorchanht/realufo` |
| Navigation | Real URL routing (react-router), deep links |
| Automation | Standing authorization: auto push + auto `wrangler deploy` at passing milestones (heads-up before first push and first deploy) |
| SEO/social | Worker per-route `<meta>`/OG injection (no SSR framework) |

## 3. Architecture

```
Browser ──▶ Cloudflare Worker (single deploy, one domain)
             ├─ /api/*   → JSON handlers → D1 (read/write), R2 (reads)
             ├─ /doc/:id, /case/:slug, /thread/:id, ...
             │            → Static Assets, with per-route <meta>/OG injected into index.html
             └─ /*        → Static Assets (SPA fallback)
Bindings: DB (D1: realufo-db) · MEDIA (R2: realufo)
Deferred (Spec 2): QUEUE (Queues) · VECTORIZE
```

The app reads **only** D1 records + `cdn_url` (assets.realufo.org). Never hits an origin URL at runtime.

### 3.1 Meta-injection (SEO / social previews)

The Worker owns every route, so it injects real metadata without SSR:

- For document/case/thread deep-link paths (`/doc/:id`, `/case/:slug`, `/thread/:id`), the Worker fetches the built `index.html` from Static Assets, looks up the entity in D1, and replaces a `<!--META-->` placeholder with `<title>`, `<meta name="description">`, and OpenGraph/Twitter tags (title, summary, thumb `cdn_url`, canonical URL).
- All other routes serve `index.html` with default RealUFO meta.
- Humans still get the full SPA (React hydrates over the injected head); bots/crawlers/social scrapers get correct per-record previews and indexable content.
- Optional (nice-to-have, not blocking): prerender the ~12 cold-case pages at build time.

Implementation note: injection is a cheap string replace on cached `index.html`; entity lookups are single indexed D1 reads. No per-request React render.

## 4. Repo layout

```
realufo/
  wrangler.jsonc              # main=worker/index.ts; assets → web/dist; DB + MEDIA bindings
  package.json                # root scripts orchestrate web + worker (pnpm)
  worker/
    index.ts                  # router: /api/* → handlers; else assets + meta-injection
    routes/                   # records.ts, threads.ts, boards.ts, comments.ts, votes.ts, cases.ts, bootstrap.ts, auth.ts
    lib/                      # db.ts, anon.ts, meta.ts, json.ts
  web/
    index.html                # contains <!--META--> placeholder
    src/
      main.tsx, App.tsx, router.tsx
      theme/                  # theme.css (CSS vars 1:1 from prototype), ThemeProvider, useTheme
      api/                    # client.ts (typed fetch), queries.ts (TanStack Query hooks), types.ts
      components/             # AppShell, TopNav, BottomTab, AppBar, Ticker, DocCard, ThreadRow,
                              # BoardRow, StanceTag, VoteButton, Saucer, Composer, MediaViewer,
                              # LoginSheet, Toast
      screens/                # Feed, Archive, Doc, Boards, Board, Thread, Case, Map
      overlays/               # OverlayProvider (composer/viewer/login/toast state)
    vite.config.ts, tailwind.config.ts
  db/
    schema.sql                # DDL
    migrations/               # 0001_init.sql ...
    seed.ts                   # reads realufo-handoff/data.js → INSERTs
  docs/superpowers/specs/     # this file
  realufo-handoff/            # source-of-truth prototype + data (kept for reference/seed)
```

## 5. Data model (D1)

KICKOFF tables verbatim, plus `archives` and `cases` (dataset needs them) and a `stats` singleton.

```sql
-- source catalog (drives archive filter chips + labels/accents)
CREATE TABLE archives (
  id TEXT PRIMARY KEY, label TEXT, flag TEXT, accent TEXT,
  count INTEGER, coord TEXT
);

CREATE TABLE records (
  id TEXT PRIMARY KEY,
  archive TEXT REFERENCES archives(id),
  agency TEXT, agency_full TEXT,
  title TEXT, summary TEXT,               -- summary = data.js `desc`
  incident_date TEXT, location TEXT,
  doc_date TEXT,                          -- release date
  kind TEXT CHECK(kind IN ('pdf','image','video')),
  redacted INTEGER DEFAULT 0,
  featured INTEGER DEFAULT 0,
  virin TEXT,
  source_url TEXT, source_site TEXT, retrieved_at TEXT, license TEXT,
  status TEXT CHECK(status IN ('pending','fetched','processed','live','failed')) DEFAULT 'live',
  checksum TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_records_archive ON records(archive);
CREATE INDEX idx_records_kind ON records(kind);

CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT REFERENCES records(id),
  role TEXT CHECK(role IN ('thumb','full','original')),
  r2_key TEXT, cdn_url TEXT, mime TEXT, width INTEGER, height INTEGER, bytes INTEGER
);
CREATE INDEX idx_assets_record ON assets(record_id);

CREATE TABLE boards (
  id TEXT PRIMARY KEY, slug TEXT, name TEXT, desc TEXT,
  accent TEXT, icon TEXT, online INTEGER DEFAULT 0
);

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  no INTEGER,                             -- display post number
  board_id TEXT REFERENCES boards(id),
  title TEXT, stance TEXT, op_body TEXT, op_handle TEXT, op_id TEXT,
  votes INTEGER DEFAULT 0,
  source_record_id TEXT REFERENCES records(id),   -- ⇄ bidirectional link
  case_slug TEXT REFERENCES cases(slug),
  hot INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_threads_board ON threads(board_id);
CREATE INDEX idx_threads_source ON threads(source_record_id);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  no INTEGER,
  thread_id TEXT REFERENCES threads(id),
  body TEXT, handle TEXT, stance TEXT, votes INTEGER DEFAULT 0,
  source_record_id TEXT REFERENCES records(id),
  image_r2_key TEXT,
  reply_to TEXT,                          -- JSON array of refs (prototype has replyTo)
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_thread ON posts(thread_id);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  no INTEGER,
  record_id TEXT REFERENCES records(id),
  body TEXT, handle TEXT, stance TEXT, votes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_record ON comments(record_id);

CREATE TABLE cases (
  slug TEXT PRIMARY KEY, name TEXT, archive TEXT, archive_label TEXT,
  accent TEXT, coord TEXT, lede TEXT, pull TEXT, pull_cite TEXT, status TEXT
);

CREATE TABLE sightings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, lat REAL, lng REAL, count INTEGER, accent TEXT,
  case_slug TEXT REFERENCES cases(slug)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY, handle TEXT, email TEXT, google_sub TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,                          -- user id or hashed anon id
  target_type TEXT CHECK(target_type IN ('thread','post','comment')),
  target_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(actor_id, target_type, target_id)
);

CREATE TABLE stats (
  id INTEGER PRIMARY KEY CHECK(id=1),
  json TEXT                               -- curated totals: records, videos, byDecade, topLocations, ...
);

CREATE TABLE ticker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, board TEXT, text TEXT, ago TEXT, sort INTEGER
);
```

Map `x/y` are **computed client-side** from lat/lng (equirectangular: `x=(lng+180)/360`, `y=(90-lat)/180`) — verified against prototype values (Roswell → 0.2097/0.3145). Not stored.

Votes: `no`-based display counts in the prototype are seed values; live increments come from the `votes` table (`votes.count + seed`).

## 6. API surface (Worker, JSON)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/bootstrap` | archives, boards, stats, ticker, sightings, cases-lite (app shell) |
| GET | `/api/feed` | featured records + hot threads (Feed screen) |
| GET | `/api/records?archive=&type=&redacted=&q=&limit=&offset=` | filtered list (q = LIKE for phase 1; FTS in Spec 2) |
| GET | `/api/records/:id` | record + assets + threads promoted from it |
| GET | `/api/records/:id/comments` | comment strip |
| POST | `/api/records/:id/comments` | add comment (anon) |
| GET | `/api/boards/:id/threads` | threads for a board |
| GET | `/api/threads/:id` | thread + posts (+ source-record chip) |
| POST | `/api/threads` | new thread (accepts `source_record_id`, promote body, board) |
| POST | `/api/threads/:id/posts` | reply |
| POST | `/api/votes` | toggle vote `{target_type, target_id}` (dedup on actor) |
| GET | `/api/cases/:slug` | cold-case detail + related thread |
| * | `/api/auth/*` | behind `FEATURE_AUTH=false` → stub (returns fake session, mirrors prototype) |

Writes are anonymous by default. Server generates `id`/`no`, timestamps, and sanitizes body. Rate-limit posts per anon-id (basic, in-Worker) to deter spam.

## 7. Anonymous identity

- First load: web generates a UUID, stores in `localStorage['ufo_anon']`, sends as `X-Anon-Id` header on every request.
- Server hashes anon id (`SHA-256(anon + salt)`) → `actor_id` for vote dedup and post attribution. Raw anon id never stored.
- Optional handle: free-text `handle` on any post/comment (prototype `!handle`), independent of accounts.
- Accounts (Spec 2) upgrade the actor to a `users.id` but anonymous stays first-class.

## 8. Frontend

- **Theme exact:** `theme.css` ports the prototype `:root`, `[data-theme="light"]`, `[data-accent="cyan|amber|violet"]` variable sets verbatim; scanlines, film grain, radial glows, keyframes copied 1:1. Tailwind `theme.colors` alias the CSS vars (`bg: 'var(--bg)'`, `signal: 'var(--signal)'`, …) so utilities and CRT tokens coexist. Fonts: Press Start 2P / JetBrains Mono / Space Grotesk (self-host via `@fontsource` to avoid runtime Google fetch).
- **Theme state:** `ThemeProvider` holds `theme` (dark/light), `accent` (phosphor/cyan/amber/violet), `scanlines` (bool) — persisted to localStorage, defaults dark/phosphor/on. Exposed via a small switcher in the login/settings sheet. Respects `prefers-reduced-motion` and `prefers-color-scheme` on first visit.
- **Responsive (no manual device toggle):** desktop top-nav bar at ≥900px, mobile bottom-tab + status bar below. Both layouts from the prototype, driven by CSS/media + a `useMediaQuery` hook.
- **Routing:** react-router — `/`, `/archive`, `/doc/:id`, `/boards`, `/board/:slug`, `/thread/:id`, `/case/:slug`, `/map`. Doc detail keeps swipe-through (prev/next over the current filtered list, passed via router state or refetched).
- **Overlays** (composer, media viewer, login sheet, toast) = `OverlayProvider` state, not routes; sheet drag-to-dismiss ported from prototype.
- **Reused components:** `DocCard` (Feed + Archive + doc-nav), `ThreadRow` (Feed + Board), `StanceTag`, `VoteButton` (optimistic), `Composer` (comment / reply / new-thread / promote — one component, mode prop), `MediaViewer` (pdf iframe / video / placeholder).
- **Data:** TanStack Query hooks over a typed fetch client; optimistic mutations for votes, comments, posts, new threads; toast on success (matches prototype).
- **Icons:** lucide-react, sized to match prototype glyphs; keep the pixel saucer as inline SVG (from prototype). No emoji-as-icons.

## 9. Flows wired end-to-end (against real D1)

1. **Add comment** on a record → `POST /records/:id/comments` → appears in strip (optimistic).
2. **Promote comment → board** → composer opens `newThread` mode, body pre-filled with the quoted comment, `source_record_id` set → `POST /threads` → navigate to `/thread/:id`; thread shows "◂ from record" chip; the source record's detail lists the promoted thread.
3. **Start thread about this file** → composer `newThread` with file-reference chip (`source_record_id`), empty body.
4. **Vote** (thread/post/comment) → `POST /votes` toggle, optimistic count.
5. **New thread / reply** on a board.
6. **Swipeable doc detail** — pointer/touch swipe prev/next through filtered list.

## 10. Auth stub

`FEATURE_AUTH=false`. Login sheet renders (Google + magic-link buttons) but calls the stub endpoint that returns a fake session `{handle}`, exactly like the prototype's `doLogin`. No real OAuth/email in this spec. Anonymous path is fully functional regardless.

## 11. Testing (TDD)

- **Worker:** vitest + `@cloudflare/vitest-pool-workers` against local D1. Cover each route; assert the promote-to-board link integrity (`posts/threads.source_record_id ⇄ records.id` both directions), vote dedup, anon attribution.
- **Web:** vitest + React Testing Library on the reused components and the three discussion flows (comment, promote, vote optimistic).
- **Smoke:** one Playwright pass over feed → archive → doc → comment → promote → thread (Playwright already available in the sibling repo's toolchain).

## 12. Deploy

1. Build web (`vite build` → `web/dist`).
2. Create D1 `realufo-db`, apply migrations, run seed.
3. `wrangler deploy` (Worker + assets + bindings) to the Flow Account.
4. Point domain (reuse existing `realufo` Cloudflare zone; confirm subdomain, e.g. `app.realufo.org` or root).

## 13. Out of scope → Spec 2

- Queues ingest pipeline (SEED/FETCH/PROCESS/INDEX + dead-letter queue), runnable against the seed list.
- Vectorize embeddings + semantic/RAG search; D1 FTS index for keyword.
- Full 1,555-row `uap-data.csv` backfill; thumb generation (assets.realufo.org thumbs currently 404).
- Real Google OAuth + email magic-link; "you were quoted" notifications.
- Realtime comment/post sync (Durable Objects or polling).

## 14. Open confirmations (non-blocking)

- Production domain/subdomain for the Worker (default assumption: `app.realufo.org`; the archive PDFs stay on `assets.realufo.org`).
