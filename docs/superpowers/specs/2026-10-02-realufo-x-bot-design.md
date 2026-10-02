# RealUFO — X (Twitter) Bot (Spec 4)

**Date:** 2026-10-02
**Status:** approved-pending-review
**Builds on:** Spec 2 (scheduled ingest — clips are cut there), Spec 3 (Workers AI binding + qwen3 quirks).

---

## 1. Goal

An automated X account that posts RealUFO content without manual work, built to
keep people watching: **video clips first**, release announcements, and the best
community threads.

Success looks like:

- Each new war.gov/AARO release gets one summary post with a link, within a few
  hours of the daily ingest.
- One archive pick per day, video clip whenever a clip exists.
- One community highlight per day when a thread clears the vote bar.
- Never double-posts, never posts a URL by accident, never exceeds the monthly
  spend cap, never reposts user-uploaded images.
- AI copy never states something the record's metadata doesn't support.

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Runtime | **Cron trigger on the existing Worker** (`scheduled()` next to `fetch()`) | D1, Workers AI and R2 are already bound in-process; one deploy; Workers Paid makes cron free. GHA was rejected: it already got auto-disabled once for inactivity. |
| Clip cutting | **Python step in the existing ingest GHA** (`ingest.clips`), after `ingest.thumbs` | Worker can't run ffmpeg. ffmpeg is already installed in that job. |
| Streams | **Release summary** · **Daily pick** · **Community highlight** | User choice. Per-file posts rejected: one summary per release, so a 50-file release is one post, not 50. |
| Links | **Release + daily pick carry one URL** (archive filter / `/doc/<id>`, appended by code); highlights carry none | X pay-per-use: $0.015/post, **$0.20 if it contains a URL**. User chose links on picks (2026-10-02) for traffic. |
| Media | **Video clip if the record has one, else thumb image** | User: "people need videos to keep watching". |
| Copy | **AI-written** (qwen3 via `env.AI`), validated, template fallback | User choice; validator is what makes it safe to run unattended. |
| Autonomy | **Fully automatic**; `FEATURE_X` = `off` \| `dry` \| `on` | `dry` writes drafts to D1 without calling X, for copy review before launch. |
| Auth | **OAuth 1.0a user context**, 4 Worker secrets, HMAC-SHA1 via WebCrypto (no lib) | Tokens don't expire → no refresh-token storage. *Must verify v2 media endpoints accept it (plan task 1); fallback: OAuth 2.0 PKCE with refresh token in D1.* |
| Spend | `X_DAILY_MAX=3`, `X_MONTHLY_USD_CAP=10`, prepaid X credits as hard backstop | Bounded by code and by the prepaid balance. |
| Deferred | Replies/mentions (reads cost money), threads, scheduling UI, analytics, per-file posts | Additive later. |

## 3. Architecture

```
GitHub Actions ingest (daily 06:00 UTC)
  ingest → thumbs → clips (NEW) ──► R2 clips/<archive>/<record_id>.mp4

Worker cron "0 */3 * * *"  ─► scheduled() ─► bot.tick(env)
  0. FEATURE_X == off → return
  1. resume: any x_posts row status='processing' (video still encoding at X) → poll STATUS → post
  2. budget gate: posts today < X_DAILY_MAX AND month spend + next cost ≤ X_MONTHLY_USD_CAP
  3. pick ONE candidate (priority order):
       release    : unposted release group, newest record ≥ 2h old, created_at ≥ X_SINCE
       pick       : none posted today AND hour ≥ 14 UTC
       highlight  : none posted today AND hour ≥ 20 UTC AND a qualifying thread exists
  4. draft = AI(candidate) → validate → else template(candidate)
  5. insert x_posts row status='pending'          (dedupe guard, BEFORE calling X)
  6. media: clip (R2 head) → chunked upload; else thumb → upload; failure → no media
  7. POST /2/tweets → status='posted', tweet_id    (dry: status='draft', skip 6–7)
```

One post per tick at most. Ticks every 3h = 8/day, so the daily cap, not the
cron, sets the volume.

## 4. Components

### 4.1 Data model — migration `0009_x_posts.sql`

```sql
CREATE TABLE x_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream TEXT NOT NULL CHECK(stream IN ('release','pick','highlight')),
  ref TEXT NOT NULL,            -- release key | record id | thread id
  text TEXT NOT NULL,
  ai INTEGER NOT NULL,          -- 1 = AI copy passed validation, 0 = template
  media TEXT,                   -- 'clip:<r2 key>' | 'thumb:<r2 key>' | NULL
  media_id TEXT,                -- X media id while processing
  cost_usd REAL NOT NULL,       -- 0.20 with URL, 0.015 without (computed, not from X)
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  tweet_id TEXT, error TEXT, attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(stream, ref)
);
```

`UNIQUE(stream, ref)` is the dedupe guarantee. `draft` rows from dry mode are
deleted by the operator before flipping to `on` (else they block those refs).

No column for clips: clip existence = `MEDIA.head('clips/<archive>/<id>.mp4')`.

### 4.2 Release grouping

- **wargov:** key `wargov:<ISO release date>` (not the rank: a late file with an earlier date would renumber every release); release number + its raw `doc_date` strings
  come from the existing `wargovReleases(env)` in `worker/routes/records.ts`
  (export it; one release can have several raw date spellings).
  Link: `https://realufo.org/archive?release=<no>`.
- **other archives:** key `<archive>:<date(created_at)>`. Link:
  `https://realufo.org/archive?archive=<archive>`.
- `X_SINCE` (var, launch date) stops the bot announcing the ~590-record backlog.
- Media: first new video in the group with a clip, else first thumb.
- AI input: archive, release no, count by kind, up to 5 titles.

### 4.3 Daily pick

Random live record not in `x_posts` (stream `pick`), **videos with a clip
first**, then image/pdf with a thumb. 165 videos ≈ 5 months of video picks
before images. AI input: id, title, agency, incident date, location, kind,
duration, summary (≤500 chars). Code appends `https://realufo.org/doc/<id>` as the
last line (AI-written URLs/domains are stripped first, so exactly one link). Records
titled "…original title not published" (no metadata) are skipped.

### 4.4 Community highlight

**Off by default** (`X_HIGHLIGHT_MIN_VOTES=""`): anon ids are client-chosen, so one
person can forge votes. When enabled: thread with `votes ≥ X_HIGHLIGHT_MIN_VOTES`,
created in last 7 days, not posted. **No AI** (user text is a prompt-injection
surface): fixed template with the banned-claims check; a title that fails it gets a
`failed` row (`unsafe title`) and is never posted. Media: clip or
thumb of the thread's `source_record_id` (official footage) — **never user
uploads**. No media if no source record.

### 4.5 Copy — `worker/lib/xcopy.ts`

- System prompt: describe what the file is and where/when; never claim it proves
  anything; no hashtags beyond `#UAP`; no @mentions; no URLs.
- Strip qwen3 `<think>` / use `reasoning_content` fallback (reuse Ask's
  `answerText`).
- **Validate** (all must pass, else template):
  - all URLs stripped from AI text; code appends the link only for `release`
  - must contain the record id / release number verbatim
  - weighted length ≤ 280 (URL = 23, CJK/emoji = 2)
  - banned-phrase list (`confirmed alien`, `proof of`, `cover-up exposed`, …)
- Templates, one per stream, e.g.
  `NEW: war.gov Release 07 — 31 files (24 PDF, 5 video, 2 image). <link>`

### 4.6 X client — `worker/lib/x.ts`

- `oauth1Header(method, url, params, secrets)`: HMAC-SHA1 via `crypto.subtle`.
- `createPost(text, mediaIds?)` → `POST https://api.x.com/2/tweets`.
- `uploadImage(bytes, mime)` → single-shot `POST /2/media/upload`
  (`media_category=tweet_image`).
- `uploadVideo(r2Object)` → `POST /2/media/upload/initialize`
  (`video/mp4`, exact `total_bytes`, `media_category=tweet_video`) →
  `POST /2/media/upload/{id}/append` in **4 MB** chunks read via R2 range gets →
  `POST /2/media/upload/{id}/finalize` → poll `GET /2/media/upload?command=STATUS`
  honoring `check_after_secs` (clamped 2–20 s). Still processing after ~2 min →
  save `media_id`, `status='processing'`, resume next tick (X media ids live 24h).

### 4.7 Clip cutter — `crawler/ingest/clips.py`

For every live video record with no `clips/<archive>/<id>.mp4` on the CDN:

- duration ≤ 140 s → whole video; else **60 s window starting at 35%** (same
  offset as thumbs, skips DoD "Unclassified" slates).
- ffmpeg: H.264 Main, `yuv420p`, ≤ 1280 px wide, ≤ 30 fps, `-maxrate 1.5M`,
  AAC 128k (or no audio track if source has none), `+faststart`.
  ≤ 140 s × 1.5 Mb/s ≈ 26 MB worst case → ≤ 7 append calls.
- Reuse `thumbs.py` helpers (`probe_duration`, crop detection, R2 put).
- `--dry-run`, `--limit N`, idempotent. One-time backfill of all 165 videos,
  then runs after `ingest.thumbs` in `.github/workflows/ingest.yml`.

### 4.8 Config

`wrangler.jsonc`: `"triggers": { "crons": ["0 */3 * * *"] }`; vars
`FEATURE_X="off"`, `X_DAILY_MAX`, `X_MONTHLY_USD_CAP`, `X_HIGHLIGHT_MIN_VOTES`,
`X_SINCE`. Secrets (`wrangler secret put`): `X_API_KEY`, `X_API_SECRET`,
`X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.

## 5. Cost

| Item | Volume / month | Cost |
|---|---|---|
| Release posts (URL) | ~1–2 | ~$0.40 |
| Daily pick (URL + clip) | 30 | $6.45 |
| Highlights (no URL) | ≤ 30 | ≤ $0.45 |
| Media upload calls | ≤ 60 uploads | **unknown — verify in plan task 1** |
| Workers AI copy | ~60 short generations | < $0.05 |
| **Total** | | **≈ $7.30/mo** incl. booked media, capped at $10 |

## 6. Error handling

- Row inserted as `pending` **before** calling X. Crash mid-call leaves
  `pending`: never auto-retried (could double-post), counts toward budget,
  surfaced in logs for manual check.
- X 401 / 402 / non-duplicate 403 (auth revoked, out of credits) → row **deleted**
  so the candidate isn't burned; retried naturally on a later tick. Other 4xx
  (incl. 403 duplicate) → `failed`, no retry.
- Network error on create, or D1 failure after a successful create → ambiguous:
  row stays `pending`, `attempts=0` (manual check, never auto-retried); tweet id is
  logged before the D1 write. 429 / 5xx → stays `pending` with `attempts+1`, retried next
  tick up to 3 attempts. *(This is the only case a `pending` row is retried,
  because X didn't create anything.)*
- Media upload/processing failure → post without media (still no URL, same cost).
- AI failure or validation fail → template. Bot never skips a slot because of AI.
- `console.log` one structured line per tick (stream, ref, status, cost) for
  `wrangler tail`.

## 7. Testing

vitest, existing worker suite (miniflare D1):

- `oauth1Header` against **X's published OAuth 1.0a signature example** (fixed
  nonce/timestamp) — catches signing bugs with no network.
- validator: URL strip, id-present, weighted length, banned phrases.
- picker: priority order, time-of-day slots, `X_SINCE`, dedupe via UNIQUE,
  video-first pick, highlights never use user uploads.
- budget gate: daily max, monthly cap incl. next post's cost.
- `tick()` with mocked `fetch` + `AI` + R2: dry mode writes `draft` and calls no
  X endpoint; video path does init → N appends → finalize → status → post;
  processing resume across two ticks; 429 retry vs 403 fail.

Python: `clips.py` unit test for window selection (≤140 s whole, else 60 s @35%)
and ffmpeg arg building; real encode checked manually on 2–3 videos.

## 8. Rollout

1. Verify (plan task 1): OAuth 1.0a on v2 media endpoints; media upload pricing.
2. Migration `0009` → remote D1.
3. `python -m ingest.clips` backfill (165 videos) → spot-check 3 clips.
4. Deploy with `FEATURE_X=dry` → review drafts in `x_posts` for 2–3 days, tune
   prompt / banned list.
5. **User:** create X dev app for the bot account, Read+Write, generate OAuth
   1.0a access token, buy ~$10 credits, `wrangler secret put` ×4.
6. Delete `draft` rows, set `X_SINCE`, flip `FEATURE_X=on`, watch first posts
   with `wrangler tail`.

## 9. Known limitations

- `X_SINCE` must be set at launch or the first tick announces old releases.
- A `pending` row stuck by a crash needs manual resolution (check the account,
  then set `posted` or delete the row).
- If a release's clips/thumbs aren't cut yet when the 2h window passes, that
  release post goes out with no media (still announced, still linked).
