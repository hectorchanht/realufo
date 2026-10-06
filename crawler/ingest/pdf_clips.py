"""Ken Burns video clips for non-video records (pdf/image) — "every post has a video".

    python3 -m ingest.pdf_clips --dry-run --limit 2   # encode locally, no upload
    python3 -m ingest.pdf_clips                       # encode + R2 upload
    python3 -m ingest.pdf_clips --id DOW-UAP-D097     # single record

Output: clips/<archive>/<id>.mp4 (same key shape as ingest.clips, so the Worker's
mediaFor() picks it up automatically once it checks clips for every kind).
8 s, 1080x1080, slow zoom-in over the thumb; idempotent — existing clips skipped
unless --force. Needs ffmpeg on PATH.

Source image: the record's thumb asset (assets.role='thumb'), same one the site
and the Telegram preview already show.
"""
import argparse, os, subprocess, sys, tempfile
from . import d1, r2

DUR, SIZE = 8, 1080

SELECT = """SELECT r.id, r.archive, a.cdn_url FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='thumb'
WHERE r.status='live' AND r.kind IN ('pdf','image') ORDER BY r.id"""

def key(row) -> str:
    return f"clips/{row['archive']}/{row['id']}.mp4"

def has_clip(row) -> bool:
    # R2 head via the CDN: the Worker's mediaFor() does the same check.
    import urllib.request
    from .models import R2_BASE
    req = urllib.request.Request(R2_BASE + key(row), method="HEAD")
    try:
        urllib.request.urlopen(req, timeout=15).status
        return True
    except Exception:
        return False

def make_clip(src: str, dst: str) -> None:
    # Slow zoom-in (Ken Burns) over the document thumb.
    vf = (f"scale={SIZE}:-2:force_original_aspect_ratio=increase,crop={SIZE}:{SIZE},"
          f"zoompan=z='1+0.12*on/{DUR*30}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
          f":d={DUR*30}:s={SIZE}x{SIZE}:fps=30")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", src,
                    "-vf", vf, "-t", str(DUR), "-c:v", "libx264", "-preset", "medium",
                    "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst],
                   check=True)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--id", default="")
    a = ap.parse_args()
    rows = d1._d1_json(" ".join(SELECT.split()))
    if a.id:
        rows = [r for r in rows if r["id"] == a.id]
    if a.limit:
        rows = rows[:a.limit]
    done = skipped = 0
    for row in rows:
        k = key(row)
        if not a.force and has_clip(row):
            skipped += 1
            continue
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "thumb.jpg")
            subprocess.run(["curl", "-sL", "-o", src, row["cdn_url"]], check=True)
            dst = os.path.join(td, "clip.mp4")
            make_clip(src, dst)
            size = os.path.getsize(dst)
            print(f"{row['id']}: {size/1024:.0f}KB -> {k}")
            if not a.dry_run:
                r2.put(k, dst, "video/mp4")
                done += 1
    print(f"done={done} skipped={skipped} total={len(rows)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
