# 009 — New-release auto-publish (gate-free)

Status: IN PROGRESS (step 1 DONE 2026-11-24; steps 2–3 TODO)
Priority: P1 · Effort: M · Depends on: —

## Why

Hector (2026-11-24): 「停咗嗰個 gate，自動全部出發」 — the Telegram gate
(`FEATURE_GATE`) is disabled and everything the pipeline produces should publish
automatically, the way pre-portal releases did. No post may wait for a Telegram tap.

## The chain as it now works (step 1 — DONE 2026-11-24)

1. `FEATURE_GATE` set to `"off"` in `wrangler.jsonc` **and** in the live Worker
   script settings (verified by read-back: 55 bindings / 22 secrets intact,
   `FEATURE_X` live `"on"` preserved; the repo file's stale `FEATURE_X: "off"`
   was aligned to live `"on"` in the same change so a repo deploy cannot
   silently kill the bot).
2. With the gate off, the existing machinery is already automatic end-to-end:
   - ingest (`.github/workflows/ingest.yml`, daily) inserts new records as
     `pending` and renders vertical twins to `clips-staging/`;
   - the Worker cron's `contentTick.publishDirect` flips pending records live
     and promotes staged shorts to `clips-v/` (pre-portal behaviour);
   - `xbot`'s `releaseCandidate` posts the release announcement to X
     (release stream has first priority; `X_DAILY_MAX`/`X_MONTHLY_USD_CAP`
     still apply), and `socialTick` mirrors every X post to
     FB/IG/Threads/Bluesky/YouTube/TikTok/Telegram;
   - daily picks continue (`X_PICK_HOURS`, `paused_picks` in D1).
3. `ADMIN_TOKEN` was rotated and written to the repo-root `.env` (gitignored),
   so `scripts/publish.sh` works again for operator posts.

## Step 2 — TODO: hero-record auto-picks for a new release

When a new wargov release lands, the announcement post goes out on its own, but
the release's *hero* records (long reports, anything with a topic hub like
AAWSAP) are only posted if the daily pick lottery reaches them. Add to
`xpick.releaseCandidate`'s aftermath (or a sibling candidate with priority
between `release` and `pick`): for the newest release only, offer up to 3
not-yet-posted records from it, ranked by (has thumb/clip, page count desc,
topic-hub membership), one per day, as `pick` candidates with `manual`-like
budget treatment (they skip the pick-hour slot but not the monthly cap).
STOP if: a record from that release already has 3 pick posts — never announce
the same release more than 1 + 3 times.

## Step 3 — TODO: auto-showcase for the hero record

Generate a first-cut showcase Short automatically for the release's top hero
record (PDF page stills + Kokoro narration from the record's AI summary, in the
`showcase/lib.py` style, as `showcase/DOW-UAP-D172.py` was hand-made for
Release 08), upload to `showcase/<archive>/<ID>.mp4` and post via
`POST /__tick?showcase=`. Human-made showcases still win: skip if a
`showcase` x_posts row or a hand-written `showcase/<ID>.py` exists.
STOP if: the record has no AI summary or no thumb — fall back to step 2 only.

## Verification

- After the next PURSUE release: release announcement in `x_posts`
  (stream=`release`) with no `bot_jobs` row created; hero picks on the
  following days; `social_posts` rows on all enabled platforms.
- `FEATURE_GATE` must read `"off"` in both `wrangler.jsonc` and the live
  script settings; any future deploy that flips it back is a regression.
