# AI key moments for video records — design

Date: 2026-10-02 · Builds on official key moments (a516e7d, `web/src/lib/keyMoments.ts`).

## Goal

Every video doc page can show timestamped **key moments**. Today 117 of 165
videos have them, parsed from the time-coded "Video Description" war.gov ships
in its summaries. This adds **AI-generated** moments for **all** 165 videos,
produced by a vision model from sampled frames:

1. Videos with no official description (47: 32 AARO clips, 15 war.gov/FBI) get
   moments for the first time.
2. Videos that have both let the viewer switch **Official | AI**; official is
   the default.
3. AI moments are always labelled as AI and never claim what an object is.

## Non-goals

- Fixing the 32 AARO clips that are all titled "NAVAIR - FOIA: Unresolved Case:
  GIMBAL Video" (bad old-repo metadata) — separate data-quality task.
- Human review before publishing — the user chose direct publish with an AI
  label.
- An admin UI to hide or edit moments — manual D1 update (see §1).
- Audio, transcripts, or object tracking.

## 1. Storage

Migration `db/migrations/0009_ai_moments.sql` (renumber if another branch has
taken 0009 by then):

```sql
ALTER TABLE records ADD COLUMN ai_moments TEXT;
```

Value — one JSON document per record:

```json
{"model":"@cf/meta/llama-4-scout-17b-16e-instruct",
 "generated_at":"2026-10-02T12:00:00Z",
 "moments":[{"start":0,"end":12.4,"text":"The sensor pans right, keeping an area of contrast near the center."}]}
```

- `NULL` → not generated; the job will pick the record up.
- `"moments": []` → attempted, nothing usable; the job won't retry daily.
- `start`/`end` are seconds (floats); `end` is always set for AI moments.
- `model` + `generated_at` allow regenerating everything from a given model.

Why a column: a video's moments are written and read as one unit, never queried
individually. `GET /api/records/:id` already does `SELECT * FROM records`, so
the column reaches the page with **no worker change**.

Undo: `UPDATE records SET ai_moments=NULL WHERE id=?` (regenerates next run);
all: `UPDATE records SET ai_moments=NULL`.

## 2. Ingest job — `crawler/ingest/moments.py`

```
python3 -m ingest.moments [--dry-run] [--limit N] [--ids A,B] [--force]
```

### 2.1 Selection

Live `video` records with a `full` asset and `ai_moments IS NULL`, ordered by
id. `--ids` restricts to given records; `--force` ignores existing
`ai_moments`; `--limit` caps videos per run.

### 2.2 Segmentation (deterministic — timestamps never come from the model)

Read straight from the CDN URL (range requests, no full download), as
`ingest.thumbs` does.

1. Duration from `assets.duration`; ffprobe fallback.
2. Scene cuts: ffmpeg on a downscaled stream with `select='gt(scene,0.3)'` +
   `showinfo`, parsing `pts_time`.
3. Boundaries = `[0, cuts…, duration]`; merge segments shorter than **3 s** into
   their neighbour.
4. Split segments longer than `W = max(20 s, duration / 15)` into equal parts
   ≤ W, so a video yields at most ~15 moments.

Pure function: `plan_segments(duration, cuts) -> [(start, end)]`.

### 2.3 Frames

Per segment, 4 frames at ⅛, ⅜, ⅝, ⅞ of its span (ffmpeg `-ss` seek, one frame,
480 px wide), tiled 2×2 (left-to-right, top-to-bottom = time order) into one
JPEG with ffmpeg's `tile` filter. No text is drawn on the tiles: the segment's
times travel in the prompt text (§2.4), and `drawtext` is missing from ffmpeg
builds without freetype (e.g. this Mac's Homebrew build). No new Python
dependency.

### 2.4 Model call

Workers AI REST `POST /accounts/{id}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`
through the existing `ingest/cfapi.py` client (same token the daily
`ingest.textindex` step uses). Input: the 2×2 image + a text block.

- **System prompt** — describe only what is visible, in neutral DoD
  video-description style: sensor/camera behaviour (pans, zooms, focus,
  overlays, reticles, cuts) and objects as "light source", "area of contrast",
  "object". Never identify, classify, or speculate about what an object is,
  its size, speed, or origin. If nothing changes, say so plainly. One sentence,
  ≤ 30 words.
- **User text** — "Four frames from seconds S–E of a government sensor or
  camera video, in time order left-to-right, top-to-bottom." plus the previous segment's sentence (continuity). The
  record title and summary are **not** sent (AARO titles are wrong; summaries
  contain claims the model would echo; the AI list should be an independent
  read).
- **Output** — `guided_json` schema `{"text": string, "same_as_previous": boolean}`.

The exact image-input shape for this model on the REST API (expected:
OpenAI-style `{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,…"}}`
content block) is confirmed by a one-frame probe as the plan's first task.

### 2.5 Post-processing

1. Validate each result (§3). 2. Consecutive segments with
`same_as_previous: true` merge into the previous moment (extend `end`, keep
the earlier text). 3. Build the §1 JSON.

### 2.6 Write

One `UPDATE records SET ai_moments=? WHERE id=?` per video via the existing
`ingest/d1.py` helper, only after **every** segment of that video succeeded.
`--dry-run` prints the JSON per video and writes nothing.

### 2.7 Schedule

- Backfill: one local run over all 165 (≈402 min of footage, ≤ ~1,650 calls,
  under ~$2 at $0.27/M input tokens).
- Daily: new step in `.github/workflows/ingest.yml` after the thumbs step:
  `python3 -m ingest.moments --limit 10` (ffmpeg already installed there).

## 3. Errors

Principle: a video gets a complete set of moments or nothing — never partial,
never invented timestamps.

| Failure | Handling |
|---|---|
| Model call timeout / 5xx / 429 | retry ×2 with backoff; then skip the video this run (`ai_moments` stays NULL) |
| Output not valid JSON, empty `text`, > 60 words | retry that segment once; then skip the video this run |
| Speculation in `text` — case-insensitive whole-word match against a list kept in `moments.py`, starting with: alien, UFO, craft, drone, aircraft, airplane, plane, jet, helicopter, missile, rocket, balloon, bird, satellite, spacecraft, saucer, orb | retry once with a reminder; then skip the video this run |
| ffmpeg cannot read the stream / no frames | skip the video, log it |
| No usable segments at all | write `{"moments": []}` (no daily retry) |

One bad video never stops the run (per-video isolation, as per-source in
`ingest`). End-of-run line: `moments: done=N skipped=N empty=N calls=N`.

## 4. Web

### 4.1 Data

- `web/src/api/types.ts`: `RecordFull.ai_moments?: string | null`.
- `web/src/lib/keyMoments.ts`: `parseAiMoments(raw) -> KeyMoment[]` — returns
  `[]` for null, malformed JSON, or invalid entries (never throws).

### 4.2 `KeyMoments` box (`web/src/components/VideoTools.tsx`)

- Fed `official` (parsed from summary) and `ai` lists.
- Both non-empty → header toggle **Official | AI** (`aria-pressed` buttons);
  default Official; the choice is remembered per browser in `localStorage`
  (`ru:moments-src`), wrapped in try/catch.
- Only AI → no toggle, AI list shown. Neither → no box (unchanged).
- While AI is shown: header subtitle **"AI-generated from video frames · may be
  inaccurate"** in amber (instead of the faint "from the official video
  description"), and each row carries a small `AI` tag.
- Click-to-seek, current-moment highlight, follow-while-playing, own scroll box:
  unchanged for both lists.
- Summary prose is unchanged (official time-coded lines stay out of it).

## 5. Testing

- **Python (pytest, no network)** — `plan_segments` (3 s merge, long split,
  ~15 cap, no cuts, cuts at edges), `same_as_previous` merging, speculation
  filter, output validation, UPDATE SQL quoting. ffmpeg and model calls sit
  behind small functions replaced by fakes.
- **Probe** — one real call on one frame (image shape); then `--dry-run` on 3
  real clips (IR sensor, handheld phone, 16mm film) for the user to read before
  any D1 write.
- **Web (vitest)** — Doc: toggle default Official, switch to AI shows AI rows
  and amber label, choice remembered; AI-only video shows AI list without
  toggle; `parseAiMoments` with valid, malformed and empty input.
- **E2E** — after backfill, browser check on one video with both lists and one
  AI-only video; deploy.

## 6. Rollout

1. Apply migration 0009 to remote D1 (`pnpm db:migrate`) — before deploying web
   code (web tolerates the column missing anyway: `ai_moments` undefined → no
   AI list).
2. Probe + 3-clip dry run → user reads output.
3. Backfill all 165 locally.
4. Deploy web (clean worktree of HEAD).
5. Enable the daily workflow step.
