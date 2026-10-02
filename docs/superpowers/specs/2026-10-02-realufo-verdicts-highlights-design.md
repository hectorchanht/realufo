# RealUFO — File verdicts + hub highlights (Spec 6)

Date: 2026-10-02 · Branch: build/app-foundation · Status: approved design, pending spec review

## Why

Pre-Reddit-launch interactivity. The fake `▲ credible` score on feed cards was removed (03abc91);
files had no real per-file action. Hub pages (42: 6 release, 9 agency, 19 location, 8 decade) list
files with a data-written intro but say nothing about which files matter.

- **Part A — verdicts:** one-tap "explained / unexplained / need more data" on every file.
- **Part B — highlights:** "What stands out" on every hub page, AI-written from file summaries.

Two independent parts; ship A then B. Each is deployable alone.

## Success criteria

- A visitor can cast, change, and clear a verdict on any doc page; tally appears only after they vote.
- Feed cards show the real verdict count; a fresh verdict bumps the file in "Hot right now".
- Every hub page with enough summarised files shows a 2-sentence lede + 3–5 linked standout files,
  in both the SPA and the crawler HTML. A new release gets highlights on the next daily ingest run.
- No synthetic numbers anywhere.

---

## Part A — File verdicts

### Data — migration `0018_record_verdicts.sql`

```sql
CREATE TABLE record_verdicts (
  actor_id   TEXT NOT NULL,
  record_id  TEXT NOT NULL REFERENCES records(id),
  verdict    TEXT NOT NULL CHECK (verdict IN ('explained','unexplained','more_data')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, record_id)
);
CREATE INDEX idx_verdicts_record ON record_verdicts(record_id, updated_at);
```

New table rather than reusing `votes`: `votes.target_type` has a CHECK limited to
thread/post/comment and models a toggle, not a 3-way choice. Tallies are computed with
`GROUP BY verdict` on read — no denormalised counters (594 files; revisit past ~50k verdict rows).

Deleting a record now also needs its `record_verdicts` rows deleted first (FK), same as
`record_text` / `text_index`.

### API

**`POST /api/records/:id/verdict`** — body `{ verdict: "explained" | "unexplained" | "more_data" }`.

1. Validate `verdict` against a fixed whitelist → 400 `bad verdict`.
2. `actorId(req, ANON_SALT)`; `"anon:none"` (no `X-Anon-Id`) → 400 `missing anon id`.
3. `allowWrite(env, req, "vote")` → 429 `slow down — too many votes` (shares the thread-vote bucket).
4. Record must exist and be `status='live'` → 404.
5. If the actor's current verdict equals the posted one → DELETE (clear). Otherwise
   `INSERT … ON CONFLICT(actor_id, record_id) DO UPDATE SET verdict=excluded.verdict, updated_at=datetime('now')`.
6. Respond `{ mine: Verdict | null, total, tally: { explained, unexplained, more_data } }`.
   The tally is returned even when the actor just cleared (they have already seen it).

**`GET /api/records/:id`** — `getRecord` (not `loadRecord`, which also feeds the cached crawler
pre-render) adds per-actor data:

```ts
verdicts: { mine: Verdict | null; total: number; tally?: { explained: number; unexplained: number; more_data: number } }
```

`tally` is present **only when `mine` is non-null** — hidden-until-you-vote is enforced
server-side. The response is already `cache-control: no-store`. Verdict query failure must not
break the doc: `.catch` → `{ mine: null, total: 0 }`.

**`GET /api/feed`** — `featured[]` gains `verdictN` (count of rows for the record). "Hot right now"
ordering uses the latest activity of either kind:
`ORDER BY max(lastComment, lastVerdict) DESC NULLS LAST, featured DESC, created_at DESC`
(written with `COALESCE` so a NULL side doesn't null the max).

### UI

- **Doc page** (`web/src/screens/Doc.tsx`): new `VerdictBar` component after the
  summary, above OPEN ORIGINAL (read first, then judge). Label `YOUR VERDICT`, three buttons `EXPLAINED · UNEXPLAINED · NEED MORE DATA`; selected
  one highlighted; tapping it again clears. Before voting: `N verdicts so far — vote to see the split`
  (or `Be the first to weigh in` when 0). After voting: a 3-segment horizontal bar with % labels
  and `N verdicts`. Optimistic update; on error revert and show the server message (429 text).
- **Feed cards** (`DocCard`, feed variant): `💬 {commentN}` plus `⚖ {verdictN}`.
- New React Query mutation in `web/src/api/queries.ts`, updating the cached record on success.

### Out of scope

- Verdicts in crawler HTML / JSON-LD (anonymous counts, forgeable — no SEO value, spam risk).
- Anti-forgery beyond the per-IP write limit (anon ids are client-chosen; same as thread votes).
- Verdicts on archive/hub grid cards, sorting by verdict, X bot use of verdicts.

### Tests

- `worker/tests/verdicts.spec.ts`: cast → change → same-again clears; bad verdict 400; no anon id
  400; unknown record 404; GET hides `tally` until `mine` set and shows it after; feed `verdictN` and
  ordering bump.
- `web/src/tests/`: VerdictBar renders the pre-vote prompt, highlights the chosen button, shows the
  bar after voting; DocCard shows `⚖ N`.

---

## Part B — Hub highlights

### Data — migration `0019_hub_highlights.sql`

```sql
CREATE TABLE hub_highlights (
  kind          TEXT NOT NULL CHECK (kind IN ('release','agency','location','decade')),
  slug          TEXT NOT NULL,
  lede          TEXT NOT NULL,
  picks         TEXT NOT NULL,          -- JSON [{ "id": "<record id>", "why": "<≤25 words>" }]
  members_hash  TEXT NOT NULL,          -- sha256 of sorted hub record ids at generation time
  generated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);
```

No FK on pick ids (records are validated at write time and re-filtered at read time).

### Generator — `crawler/ingest/highlights.py`

```
python3 -m ingest.highlights [--dry-run] [--only release/6 ...] [--force]
```

1. `GET https://realufo.org/api/hubs` → hub list; for each, `GET /api/hubs/:kind/:slug` → records.
   Hub membership comes from the Worker's own logic (no duplication in Python).
2. `members_hash = sha256("\n".join(sorted(ids)))`. Skip when it equals the stored hash (unless
   `--force`).
3. Pull `title, incident_date, location, kind, summary, record_text.ai_summary` for the members from
   D1 (`d1.py` helpers). Per file use `ai_summary` else `summary`; files with neither are listed by
   title only. Prompt budget: if the joined material exceeds ~12k chars, keep files with the longest
   summaries first (they carry the most signal) and truncate each summary to 400 chars.
4. `cfapi.chat(system, user, max_tokens=600)` (qwen3-30b, same as `ingest.summaries`). System
   prompt: neutral archivist voice, no alien framing, no claims beyond the summaries, return JSON
   only: `{"lede": "<2 sentences on what this set contains and what is notable>", "picks":
   [{"id": "...", "why": "<≤25 words, concrete: what is in the file>"}]}` with 3–5 picks.
5. Parse JSON (tolerate a fenced block). Drop picks whose `id` is not a hub member, dedupe, cap 5,
   trim `why` to 25 words. If < 2 valid picks or empty lede → write nothing (retried next run) and
   log it.
6. Upsert the row (`INSERT … ON CONFLICT(kind,slug) DO UPDATE`). `--dry-run` prints instead.

Pure helpers (`members_hash`, `validate(raw_json, member_ids)`, `build_prompt(files)`) are unit
tested without network.

**CI:** `.github/workflows/ingest.yml` step `highlights` after `summaries` (and after `visuals`, so
image descriptions feed it), mirroring the existing step's dry-run/live split.

### Rendering

- **Worker:** `loadHub` reads `hub_highlights` for `(kind, slug)` (`.catch` → null), re-filters
  picks to current members, and returns
  `highlights: { lede, picks: [{ id, why, title, thumb, kind }] } | null` (title/thumb/kind joined
  from the already-loaded `records` rows; picks no longer in the hub are dropped; < 2 left → null).
- **SPA** (`web/src/screens/Hub.tsx`): section `WHAT STANDS OUT` between intro and the prev/next
  nav: lede paragraph, then 3–5 rows (small thumb, title, `why`) linking to `/doc/:id`, footnote
  `AI-written from the file summaries`.
- **Crawler HTML** (`worker/lib/ssr.ts` `hubBody`): `<h2>What stands out</h2><p>lede</p><ol>` of
  `<li><a href="/doc/:id">title</a> — why</li>`, plus the same AI footnote. `llms-full` unchanged.
- Hub API keeps `cache-control: public, max-age=300` and the 1 h hub-list cache — a new highlight
  appears within minutes.

### Rollout

1. `pnpm db:migrate` (0018 + 0019) **before** deploy (missing tables → caught, but verify).
2. `python3 -m ingest.highlights --dry-run --only release/6` → review tone; adjust prompt.
3. Full run (42 hubs, ~42 model calls).
4. Deploy from the clean `../realufo-deploy` worktree (user runs it; auto-mode blocks Claude's
   prod deploys).
5. `crawler/indexnow.py` for the 42 hub URLs.

### Out of scope

- Human approval gate per hub (chosen: fully automatic).
- Using verdicts to rank picks (no verdict data yet; revisit after launch).
- Highlights on boards, cases, or the home page.

### Tests

- `crawler/ingest/tests/test_highlights.py`: hash stable under order; validate drops foreign ids,
  dedupes, caps 5, rejects < 2 picks / empty lede; tolerant JSON parse; skip when hash unchanged.
- `worker/tests/hubs.spec.ts`: highlights joined + stale picks dropped;
  null when table row missing; `hubBody` renders the section and footnote.
- Web: Hub renders the section when present, nothing when null.
