---
name: key-moments
description: Use when a RealUFO video's KEY MOMENTS (records.ai_moments, the AI tab on /doc/<id>) are wrong, vague or missing, or a new video needs them — writing accurate, timestamped moments by reviewing the frames, then writing them to D1.
---

# Key moments from frame review

The daily `ingest.moments` step asks a small Workers AI vision model about 4 frames per ≥20 s window. It misses anything brief (AARO-956955's object is on screen for 3 frames), leaks grid talk ("top-right frame") and pads with "No visible change." Moments that visitors read are written by **looking at the frames** instead, and stored with `"reviewed": true` so the daily job never overwrites them.

## Tool
From `crawler/` (numpy + Pillow → `.venv-ocr`):
- `.venv-ocr/bin/python -m ingest.moment_sheets ID` → overview sheet(s) (timestamped tiles), `events.jpg` (fleeting small objects boxed red), JSON report: `cuts`, `dark` spans, `events` (t0–t1, frame count, centre path in 0–1 coords).
- `--range A B` → every frame in [A,B] (≤60 tiles, labelled `mm:ss.ss F<frame>`). `--at t1,t2` → one big frame each.
- `--work DIR` caches files (default `$TMPDIR/realufo-moments`). Black bars are cut (stored crop, else cropdetect).

`events` are candidates, not facts: most are canopy bolts, overlay digits or noise during shake. Open each plausible one with `--range` before writing it.

## Writing rules
- **Every sentence must be visible in the frames at that time.** Accurate beats complete. Verify each moment by opening a frame inside it.
- A moment = one thing the viewer should look for when they click it: object appears / enters / leaves / disappears, notable movement, camera or sensor change (zoom, mode switch white-hot↔black-hot or IR↔TV, re-acquire, cut, black screen, title card). First moment sets the scene (handheld phone through a cockpit canopy; IR sensor with crosshair over sea / clouds / desert; night-vision; 16 mm film).
- `start` = first frame it is visible, `end` = last. Sub-second events: start = middle of the first frame, `(n + 0.5) / fps`, so a seek lands on it; say how brief ("3 frames, ~0.1 s — use frame step").
- Count: 2–6 for clips under a minute, up to ~12 for long ones. No filler ("No visible change", "scene remains static"), no "frame 3 / top-left frame", no hedging, no feelings.
- ≤ 25 words, plain English, present tense. Positions: upper/lower left/right, centre, near the crosshair. Directions: left→right, rising, toward the camera. Size relative to the frame.
- **Never say what the object is** — no balloon, bird, drone, aircraft, missile, satellite, star, alien, craft, orb, UFO for it, even when the title says "Resolved as …". Call it object, light, bright spot, dark shape. The recording platform and scenery are fine when visible or stated by the source (cockpit canopy, sea, clouds, buildings, crosshair).
- Overlay text only when it changes and you can read it. Polarity: quote the overlay (`BLK` → `WHT`) or say "colours invert"; never guess "white-hot"/"black-hot" from looks (GOFAST's overlay says the opposite of what the picture suggests).
- Official time-coded description in the summary (war.gov): read it for orientation, never copy it; the AI tab may be finer-grained but must not contradict what is on screen.

## Write
One file per video, `<ID>.json`: `{"id": "...", "moments": [{"start": 8.96, "end": 9.04, "text": "..."}], "notes": "data problems seen (wrong title, missing crop, unrelated footage)"}`.

From `crawler/` after `set -a; . ../.env; set +a`:
- Check: `python3 -m ingest.moments --apply DIR --dry-run` (validates; prints SQL; also how to load local D1: `> x.sql && wrangler d1 execute realufo-db --local --file x.sql`).
- Live (moments are public — explicit OK for that version first): `python3 -m ingest.moments --apply DIR`. It sets `text_index` failed so the next textindex run re-embeds Ask vectors.
- Then purge `https://realufo.org/__page/doc/<ID>` memo keys + page URLs via `CF_PURGE_TOKEN` (batches of 30), and IndexNow the doc URLs.
- TL;DRs of AI-only videos were built from the old moments: `ingest.tldr --ids …` regenerates them (public text too → same OK rule).
- Undo one: `UPDATE records SET ai_moments=NULL WHERE id=?` (daily job regenerates a model draft).
