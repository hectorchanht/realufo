#!/usr/bin/env python3
"""Motion score for RealUFO Shorts: how much the FIRST FEW FRAMES move.

The feed's "Short clips" carousel autoplays each card muted + looping while
it's on screen, so a clip that opens on a static title card looks dead. This
scores the first ~2 s (8 fps, 160 px wide grayscale) as the mean absolute
inter-frame difference: 0 = static card, high = moving video.

Usage:
  python3 scripts/short_motion.py --backfill > /tmp/motion_seed.sql
      # score every live Short served by /api/shorts -> INSERT statements
  python3 scripts/short_motion.py FILE.mp4
      # print the score of one local file
  python3 scripts/short_motion.py --url https://.../clip.mp4
      # print the score of one remote file

Backfill emits one INSERT ... ON CONFLICT DO UPDATE per scored clip for the
short_motion table (see db/migrations/0042_short_motion.sql). Failures are
reported on stderr and skipped (no row emitted).
"""
import argparse
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "crawler"))
from ingest.motion import score_frames  # noqa: E402  (shared with crawler/ingest/clips.py)

API = "https://realufo.org/api/shorts?limit=200"


def score_one(path: str) -> None:
    motion, n = score_frames(path)
    print(f"{motion}  (frames={n})")


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def backfill() -> None:
    with urllib.request.urlopen(API, timeout=60) as r:
        data = json.load(r)
    shorts = data["shorts"]
    now = int(time.time())
    ok, failed = 0, 0
    for s in shorts:
        rid, kind = s["id"], ("showcase" if s["showcase"] else "twin")
        try:
            motion, n = score_frames(s["clip"])
        except Exception as e:  # noqa: BLE001 - one bad clip must not stop the backfill
            print(f"-- SKIP {rid} ({kind}): {e}", file=sys.stderr)
            failed += 1
            continue
        print(
            f"INSERT INTO short_motion (record_id, kind, motion, frames, computed_at) "
            f"VALUES ('{sql_escape(rid)}', '{kind}', {motion}, {n}, {now}) "
            f"ON CONFLICT(record_id, kind) DO UPDATE SET motion=excluded.motion, "
            f"frames=excluded.frames, computed_at=excluded.computed_at;"
        )
        ok += 1
    print(f"-- scored {ok}/{len(shorts)} clips, {failed} failed", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", nargs="?", help="local MP4 to score")
    ap.add_argument("--url", help="remote MP4 to score")
    ap.add_argument("--backfill", action="store_true", help="score every live Short -> SQL")
    a = ap.parse_args()
    if a.backfill:
        backfill()
    elif a.url:
        score_one(a.url)
    elif a.file:
        score_one(a.file)
    else:
        ap.error("give FILE.mp4, --url, or --backfill")


if __name__ == "__main__":
    main()
