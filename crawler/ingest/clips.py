"""Cut X-ready MP4 clips for live videos (Spec 4 §4.7).

    python3 -m ingest.clips --dry-run --limit 2   # encode locally, no upload
    python3 -m ingest.clips                       # encode + R2 upload

Output: clips/<archive>/<id>.mp4, with the record id burned in top-left and
realufo.org bottom-right (reposts keep the source findable). The Worker bot treats the object's existence
as "this video has a clip", so there is no D1 row. Clips are ≤30 s (short, loopable;
the post links to the full video): 30 s from 35% in (same offset as thumbs: skips
the DoD "Unclassified" slates), pulled back so it ends inside the video.
Idempotent: existing clips skipped unless --force (re-cut after a length change).

--vertical writes the 9:16 twin for Reels/Shorts/TikTok (Spec 5 §7) to
clips-v/<archive>/<id>.mp4: the full frame centred on a blurred, cropped copy of
itself, record id + clean title in the top band and realufo.org in the bottom band.
Both need a TTF at $CLIP_FONT (default: DejaVu Sans Bold from apt fonts-dejavu-core); the path
must not contain spaces, ':' or quotes (ffmpeg filtergraph syntax).
"""
import argparse, os, re, subprocess, sys, tempfile
from . import d1, fetch, r2
from .models import R2_BASE

CLIP = 30.0

SELECT = """SELECT r.id, r.archive, r.title, a.cdn_url, a.duration FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='full'
WHERE r.status='live' AND a.mime LIKE 'video/%' ORDER BY r.id"""
FONT = os.environ.get("CLIP_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")

def key(row) -> str:
    return f"clips/{row['archive']}/{row['id']}.mp4"

def vkey(row) -> str:
    return f"clips-v/{row['archive']}/{row['id']}.mp4"

def clean_title(rid, title, n=40) -> str:
    """ponytail: minimal port of docTitleParts (id prefix + underscores only); the
    full rules live in web/src/lib/docTitle.ts — port more if titles look wrong."""
    t = title or ""
    if t.startswith(rid) and t[len(rid):len(rid) + 1] in (",", "_", " ", ":"):
        t = t[len(rid):]
    t = re.sub(r"\s+", " ", t.replace("_", " ")).strip(" ,:;") or rid
    return t if len(t) <= n else t[:n - 1].rstrip() + "…"

def has_audio(url) -> bool:
    return bool(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                "-of", "csv=p=0", url], capture_output=True, text=True).stdout.strip())

def window(duration):
    """(start, length) in seconds."""
    if not duration or duration <= CLIP:
        return 0.0, CLIP
    return round(min(duration * 0.35, duration - CLIP), 2), CLIP

def ffmpeg_args(url, start, length, out, id_file, font):
    mark = f"fontfile={font}:fontcolor=white:borderw=2:bordercolor=black"
    vf = ("scale='trunc(min(1280,iw)/2)*2':-2,"
          f"drawtext={mark}:textfile={id_file}:expansion=none:fontsize=32:x=20:y=20,"
          f"drawtext={mark}:text=realufo.org:fontsize=26:x=w-text_w-20:y=h-text_h-20")
    return ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", url, "-t", f"{length:.2f}",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", vf, "-fpsmax", "30",
            "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-crf", "23", "-maxrate", "1500k", "-bufsize", "3000k",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]

def vertical_args(url, start, length, out, title_file, font, audio=True, id_file=None):
    band = f"fontfile={font}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2"
    fc = ("[0:v]split[a][b];"
          "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20[bg];"
          "[b]scale=1080:-2[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2,"
          + (f"drawtext={band}:textfile={id_file}:expansion=none:fontsize=46:y=150," if id_file else "") +
          f"drawtext={band}:textfile={title_file}:expansion=none:fontsize=56:y=220,"
          f"drawtext={band}:text=realufo.org:fontsize=44:y=h-300[v]")
    a = ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", url]
    if not audio:
        a += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
    return a + ["-t", f"{length:.2f}", "-filter_complex", fc, "-map", "[v]", "-map", "0:a:0" if audio else "1:a",
                "-fpsmax", "30", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast",
                "-crf", "23", "-maxrate", "1500k", "-bufsize", "3000k",
                "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]

def todo(rows, exists=fetch.head_ok, limit=None, force=False, keyf=key):
    seen, out = set(), []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        if not force and exists(f"{R2_BASE}/{keyf(r)}"):
            continue
        out.append(r)
        if limit and len(out) >= limit:
            break
    return out

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="encode to --out only; no R2 upload")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--force", action="store_true", help="re-cut clips that already exist")
    ap.add_argument("--vertical", action="store_true", help="cut the 9:16 twin to clips-v/ (Reels/Shorts/TikTok)")
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "realufo-clips"))
    args = ap.parse_args(argv)
    keyf = vkey if args.vertical else key
    if not os.path.exists(FONT):
        sys.exit(f"clips need a TTF font at CLIP_FONT (missing: {FONT})")
    rows = todo(d1._d1_json(" ".join(SELECT.split())), limit=args.limit, force=args.force, keyf=keyf)
    os.makedirs(args.out, exist_ok=True)
    done = failed = 0
    for i, row in enumerate(rows, 1):
        out = os.path.join(args.out, f"{row['id']}{'-v' if args.vertical else ''}.mp4")
        start, length = window(row["duration"])
        # textfile= (not text=): ids and titles may hold ':' or quotes that break filtergraph syntax
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as idf:
            idf.write(row["id"])
        if args.vertical:
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                tf.write(clean_title(row["id"], row.get("title")))
            cmd = vertical_args(row["cdn_url"], start, length, out, tf.name, FONT, has_audio(row["cdn_url"]), idf.name)
        else:
            cmd = ffmpeg_args(row["cdn_url"], start, length, out, idf.name, FONT)
        p = subprocess.run(cmd, capture_output=True, text=True)
        os.unlink(idf.name)
        if args.vertical:
            os.unlink(tf.name)
        if p.returncode or not os.path.exists(out) or not os.path.getsize(out):
            failed += 1
            print(f"[{i}/{len(rows)}] FAIL {row['id']}: {p.stderr.strip()[-300:]}")
            continue
        if not args.dry_run:
            r2.put(keyf(row), out, "video/mp4")
        done += 1
        print(f"[{i}/{len(rows)}] ok   {row['id']} {start:.0f}s+{length:.0f}s {os.path.getsize(out) // 1024} KB -> {keyf(row)}")
    print(f"{'dry-run ' if args.dry_run else ''}clips={done} failed={failed} out={args.out}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
