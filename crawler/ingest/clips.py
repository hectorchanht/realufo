"""Cut X-ready MP4 clips for live videos (Spec 4 §4.7).

    python3 -m ingest.clips --dry-run --limit 2   # encode locally, no upload
    python3 -m ingest.clips                       # encode + R2 upload

Output: clips/<archive>/<id>.mp4. The Worker bot treats the object's existence
as "this video has a clip", so there is no D1 row. Videos up to 140 s (X's
standard limit) go whole; longer ones get 60 s from 35% in (same offset as
thumbs: skips the DoD "Unclassified" slates). Idempotent: existing clips skipped.
"""
import argparse, os, subprocess, sys, tempfile
from . import d1, fetch, r2
from .models import R2_BASE

MAX_WHOLE = 140.0
WINDOW = 60.0

SELECT = """SELECT r.id, r.archive, a.cdn_url, a.duration FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='full'
WHERE r.status='live' AND a.mime LIKE 'video/%' ORDER BY r.id"""

def key(row) -> str:
    return f"clips/{row['archive']}/{row['id']}.mp4"

def window(duration):
    """(start, length) in seconds."""
    if not duration or duration <= MAX_WHOLE:
        return 0.0, MAX_WHOLE
    return round(duration * 0.35, 2), WINDOW

def ffmpeg_args(url, start, length, out):
    return ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", url, "-t", f"{length:.2f}",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "scale='trunc(min(1280,iw)/2)*2':-2", "-fpsmax", "30",
            "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-crf", "23", "-maxrate", "1500k", "-bufsize", "3000k",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]

def todo(rows, exists=fetch.head_ok, limit=None):
    seen, out = set(), []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        if exists(f"{R2_BASE}/{key(r)}"):
            continue
        out.append(r)
        if limit and len(out) >= limit:
            break
    return out

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="encode to --out only; no R2 upload")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "realufo-clips"))
    args = ap.parse_args(argv)
    rows = todo(d1._d1_json(" ".join(SELECT.split())), limit=args.limit)
    os.makedirs(args.out, exist_ok=True)
    done = failed = 0
    for i, row in enumerate(rows, 1):
        out = os.path.join(args.out, f"{row['id']}.mp4")
        start, length = window(row["duration"])
        p = subprocess.run(ffmpeg_args(row["cdn_url"], start, length, out), capture_output=True, text=True)
        if p.returncode or not os.path.exists(out) or not os.path.getsize(out):
            failed += 1
            print(f"[{i}/{len(rows)}] FAIL {row['id']}: {p.stderr.strip()[-300:]}")
            continue
        if not args.dry_run:
            r2.put(key(row), out, "video/mp4")
        done += 1
        print(f"[{i}/{len(rows)}] ok   {row['id']} {start:.0f}s+{length:.0f}s {os.path.getsize(out) // 1024} KB -> {key(row)}")
    print(f"{'dry-run ' if args.dry_run else ''}clips={done} failed={failed} out={args.out}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
