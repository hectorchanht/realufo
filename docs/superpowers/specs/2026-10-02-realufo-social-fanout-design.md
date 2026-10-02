# RealUFO — Social Fan-out (Spec 5)

**Date:** 2026-10-02
**Status:** approved-pending-review
**Builds on:** Spec 4 (X bot — `x_posts`, picker, copy, clips), Spec 2 (ingest GHA — clips are cut there).

---

## 1. Goal

Every post the X bot makes also goes out, automatically, to **Facebook Page,
Instagram, Threads, Bluesky, YouTube Shorts and TikTok** — no manual work after
one-time account setup.

Success looks like:

- Each `x_posts` row (release / pick) appears on every enabled platform within
  one cron tick (≤3 h) of the X post.
- Never double-posts on any platform; one platform failing never blocks X or the
  other platforms.
- Video items use a vertical 9:16 clip on IG / YouTube / TikTok, landscape clip
  elsewhere; nothing in the original frame is cropped away.
- No new cost: all six platform APIs are free (X stays the only paid one).

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Relation to X | **Mirror** — every `x_posts` row (status `posted`/`pending`/`processing`, created ≥ `SOCIAL_SINCE`) fans out to all enabled platforms | One picker, one cadence, one copy. No per-platform scheduling. |
| Storage | **Child table `social_posts`**, X bot untouched | `x_posts` is a live, money-spending bot; don't migrate its UNIQUE/status flow. Platforms fail and retry independently. |
| Clients | **Own adapter per platform** (`worker/lib/social/<p>.ts`), no aggregator | Free; no third-party dependency. Aggregator (Ayrshare etc.) was rejected; revisit only if YT/TikTok audits stall. |
| Vertical clips | **Pad + blurred background**, 1080×1920, title band | FLIR objects are often off-centre; centre crop would lose them. |
| Copy | **Reuse `x_posts.text`** + per-platform extras (link, hashtags, YT title) | X copy already passed the safety/fact rules (`xcopy.ts`); a second AI pass would need its own checks. |
| Rotating tokens | **D1 `social_auth`** | The Worker can't rewrite its own secrets; TikTok (24 h), Threads (60 d) tokens rotate. |
| Initial OAuth | **Local script** `crawler/social_auth.py`, redirect to `https://realufo.org/?code=…`, user pastes URL back | No new Worker routes / attack surface. |
| Flags | `FEATURE_SOCIAL_FB`, `_IG`, `_THREADS`, `_BSKY`, `_YT`, `_TIKTOK` = `off`\|`dry`\|`on`, default `off` | Same semantics as `FEATURE_X`; each platform rolls out alone. |

## 3. Architecture & data flow

`worker/index.ts` `scheduled()` runs `xbot.tick(env)` then `social.tick(env, now)`
(each in its own `waitUntil`, errors caught and logged; social never affects X).

`social.tick` — for each platform whose flag is `dry` or `on`, sequentially:

1. **Refresh** its rotating token if needed (§5).
2. **Resume** (`on` only) its `processing` rows: poll the container/job; finished →
   publish → `posted`; still processing and < 1 h old → leave; else `failed`
   (`error='processing timeout'`). Also retry `pending` rows with `attempts>0`.
3. **Pick** the oldest `x_posts` row with `status IN ('posted','pending','processing')`,
   `created_at >= SOCIAL_SINCE`, and no `social_posts` row for this platform.
4. **Insert** `social_posts(x_post_id, platform, status)` with `ON CONFLICT DO NOTHING
   RETURNING id` — status `draft` in `dry`, `pending` in `on`. No row returned → stop.
5. **Gate**: platform needs video and item has none → `failed`, `error='no video'`.
   YouTube: ≥5 `posted` rows in the last 24 h → `failed`, `error='quota cap'` (skipped, not queued — a backlog would grow forever at 8/day vs 5/day).
6. **Publish** (`on` only) → `posted` + `remote_id`, or `processing` + `container_id`.

One new post per platform per tick (= X's rate). X rows that failed (incl. `unsafe
title`) are never mirrored. If X halts (401/402 deletes the row), social pauses too.

### 3.1 Schema — migration `0016_social_posts.sql`

```sql
CREATE TABLE social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x_post_id INTEGER NOT NULL REFERENCES x_posts(id),
  platform TEXT NOT NULL CHECK(platform IN ('fb','ig','threads','bsky','yt','tiktok')),
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  remote_id TEXT,
  container_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(x_post_id, platform)
);
CREATE INDEX idx_social_posts_platform ON social_posts(platform, status);

CREATE TABLE social_auth (
  platform TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,           -- UTC 'YYYY-MM-DD HH:MM:SS'
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 3.2 Text per platform

Base = `x_posts.text`. Link = `https://realufo.org/doc/<id>`; if base already contains a URL (X release
posts carry one), no link is appended. `ref` → record id comes from `x_posts.ref`.

| Platform | Text |
|---|---|
| fb | base + `\n\n` + link |
| threads | base + `\n\n` + link, trimmed to 500 |
| bsky | base trimmed so base + link ≤ 300 graphemes; link gets a byte-offset `app.bsky.richtext.facet#link` |
| ig | base + `\n\n🔗 link in bio` + hashtags (`#UFO #UAP #Pentagon #declassified` + archive tag), ≤ 2200, ≤ 30 tags |
| yt | title = first line of base, ≤ 100, + ` #Shorts` if it fits; description = base + link + hashtags |
| tiktok | base + hashtags, ≤ 2200 |

### 3.3 Media per platform

`x_posts.media` = `clip:<key>` | `thumb:<key>` | NULL. Public URL =
`https://assets.realufo.org/<key>`. Vertical twin key = `clips/` → `clips-v/`.

| Platform | clip | thumb only | none |
|---|---|---|---|
| fb | landscape video | photo | text + link |
| threads | landscape video | image | text |
| bsky | landscape video | image (thumb ≤1 MB) | text |
| ig | vertical Reel | photo (JPEG thumb) | `failed` `no media` |
| yt | vertical Short | `failed` `no video` | `failed` `no video` |
| tiktok | vertical video | `failed` `no video` | `failed` `no video` |

## 4. Platform adapters

Each `worker/lib/social/<p>.ts` exports
`publish(env, p: SocialPost): Promise<{ remoteId: string } | { containerId: string }>`
and, where async, `finish(env, containerId): Promise<{ remoteId } | 'processing' | { error }>`.
`SocialPost = { text, link, recordId, media: { kind: 'video'|'image', url, key, size } | null }`.
Exact endpoints/fields are re-verified against current docs during planning.

| Platform | Publish | Auth |
|---|---|---|
| **fb** | `POST /{page}/videos` (`file_url`, `description`) / `/{page}/photos` (`url`, `caption`) / `/{page}/feed` (`message`, `link`) | secrets `META_PAGE_ID`, `META_PAGE_TOKEN` (long-lived Page token, no expiry) |
| **ig** | `POST /{ig}/media` (`media_type=REELS`, `video_url` \| `image_url`, `caption`) → `GET /{container}?fields=status_code` until `FINISHED` → `POST /{ig}/media_publish` | same Page token + `IG_USER_ID` |
| **threads** | `POST graph.threads.net/v1.0/{user}/threads` (`media_type=VIDEO\|IMAGE\|TEXT`) → poll status → `/threads_publish` | `THREADS_USER_ID` secret; token in `social_auth` |
| **bsky** | `createSession` → video: `getServiceAuth` + `app.bsky.video.uploadVideo` → poll `getJobStatus` → blob; image: `uploadBlob` → `createRecord app.bsky.feed.post` | `BSKY_HANDLE`, `BSKY_APP_PASSWORD` |
| **yt** | refresh token → access token (each tick, not stored) → `POST upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` → `PUT` bytes streamed from R2 (`MEDIA.get`) | `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` |
| **tiktok** | `POST /v2/post/publish/creator_info/query/` → `POST /v2/post/publish/video/init/` (`PULL_FROM_URL`, `privacy_level=$TIKTOK_PRIVACY`) → poll `/v2/post/publish/status/fetch/` | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`; tokens in `social_auth` |

Platform limits honoured:

- **YouTube quota** 10k units/day, upload = 1600 → cap 5 posted / rolling 24 h.
  OAuth consent screen must be **In production** (unverified is fine for the
  owner's account) or the refresh token expires in 7 days. Until Google's API
  audit passes, uploads are locked private.
- **TikTok** until audit: `TIKTOK_PRIVACY=SELF_ONLY` (var; flip to
  `PUBLIC_TO_EVERYONE` after audit). `assets.realufo.org` must be a verified
  URL prefix in the TikTok developer portal for `PULL_FROM_URL`.
- **IG** daily publish limit (API) is far above our ≤8/day.

## 5. Tokens

- **Static secrets** (`wrangler secret put`): Meta, Bluesky, YouTube client +
  refresh token, TikTok client key/secret, `THREADS_USER_ID`, `IG_USER_ID`.
- **`social_auth`** rows: `threads` (60-day long-lived token; refresh via
  `th_refresh_token` when < 7 days left), `tiktok` (access 24 h / refresh 365 d;
  refresh when < 1 h left; store the new refresh token returned).
- Refresh failure → log `{ social, platform, authExpired }`, skip the platform
  this tick (no row inserted).
- **`crawler/social_auth.py <threads|tiktok|yt>`**: prints the consent URL; user
  approves; browser lands on `https://realufo.org/?code=…`; user pastes that URL;
  script exchanges the code. threads/tiktok → upserts `social_auth` via
  `wrangler d1 execute --remote`; yt → prints the `wrangler secret put
  YT_REFRESH_TOKEN` command.

## 6. Error handling

Mirrors `xbot.ts` `post()`:

| Outcome | Action |
|---|---|
| Auth revoked/expired (HTTP 401, Meta error code 190) | **Delete** the row (item retried after the token is fixed); log `halted` |
| 429 / 5xx | `pending`, `attempts+1`; `failed` at 3 |
| Other 4xx | `failed` + error (≤500 chars) |
| Network error after request sent | `pending`, `attempts=0`, error set — **never auto-retried** (manual check; avoids double post) |
| Container processing > 1 h | `failed`, `processing timeout` |
| Success but D1 write fails | log `postedUnrecorded` with `remote_id` before the write (recoverable) |

Each platform runs in its own try/catch inside `social.tick`; an exception in
one is logged and the loop continues.

## 7. Vertical clips (`crawler/ingest/clips.py`)

- New `vertical` path writes `clips-v/<archive>/<id>.mp4` for every video with a clip;
  CI clips step produces both; backfill `python -m ingest.clips --vertical --force`.
- Same start offset and ≤30 s length as the landscape clip.
- Filter: `split` → bg `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20` ;
  fg `scale=1080:-2` ; `overlay=(W-w)/2:(H-h)/2` ; `drawtext` title (via
  `docTitleParts`-equivalent clean title, ≤40 chars, one line) in the top band
  and `realufo.org` in the bottom band. Font: DejaVu Sans (`fonts-dejavu-core`
  via apt in CI; `CLIP_FONT` env path locally). Title text escaped for drawtext.
- H.264 yuv420p, `-fpsmax 30`, `-maxrate 1500k`; keep source audio, else add a
  silent AAC track (`anullsrc`).
- `xpick.mediaFor` keeps choosing by the landscape key; social derives the
  vertical key and HEAD-checks it — missing → falls back as if no clip (yt/tiktok
  `no video`, ig photo).

## 8. Testing

**Worker** (vitest + `cloudflare:test` + `fetchMock`; specs pin every var they read):

- Per adapter: request shape (URL, fields, auth header), success parse, error mapping (401, 190, 429, 5xx, network).
- `social.tick`: fans out one row per enabled platform; second tick on the same state inserts nothing (UNIQUE); `dry` writes only `draft` and calls no API; YT cap at 5/24 h; yt/tiktok `no video`; ig photo fallback; bsky text trimmed to 300 graphemes with a correct link facet byte range; threads/tiktok token refresh and refresh-failure skip; resume `processing` → `posted`, and timeout → `failed`; one platform throwing doesn't stop the others; X `failed` rows never mirrored; rows before `SOCIAL_SINCE` ignored.

**Python:** `test_clips.py` — vertical `ffmpeg_args` contains the pad/blur/overlay
filter, 1080×1920, escaped title, and the silent-audio input when the source has
no audio.

## 9. Rollout

1. `pnpm db:migrate` (0016) — **before** deploy.
2. Vertical clip backfill (`python -m ingest.clips --vertical --force`), check `clips-v/` in R2.
3. Deploy (clean worktree) with all six flags `dry`, `SOCIAL_SINCE=<launch date>`.
4. Review: `SELECT s.platform, s.status, s.error, x.text FROM social_posts s JOIN x_posts x ON x.id = s.x_post_id`.
5. Per platform (user creates accounts/apps; Claude cannot create accounts):
   - **Bluesky** — account + app password → 2 secrets.
   - **Meta** — FB Page, IG Business/Creator linked to it, Threads profile, one Meta app (Pages + Instagram content publish + Threads permissions) → secrets + `social_auth.py threads`.
   - **YouTube** — channel, Google Cloud project, YouTube Data API v3, OAuth consent **In production** → `social_auth.py yt` → secrets; submit API audit day 1.
   - **TikTok** — developer app with Content Posting API, verify `assets.realufo.org` → `social_auth.py tiktok`; submit audit day 1.
   - then `DELETE FROM social_posts WHERE platform=? AND status='draft'` → flag `on` → deploy.
6. Pause a platform: its flag `off` + deploy.

## 10. Out of scope

Engagement analytics, replies/DMs, per-platform AI copy, FB Reels API (plain FB
video), per-platform cadence, Reddit (bot self-promo gets banned), LinkedIn,
Mastodon. Add only when a platform clearly needs it.
