"""Cut X-ready MP4 clips for live videos (Spec 4 §4.7).

    python3 -m ingest.clips --dry-run --limit 2   # encode locally, no upload
    python3 -m ingest.clips                       # encode + R2 upload

Output: clips/<archive>/<id>.mp4, with the record id + clean title burned in top-left and
realufo.org bottom-right (reposts keep the source findable). The Worker bot treats the object's existence
as "this video has a clip", so there is no D1 row. Clips are ≤30 s (short, loopable;
the post links to the full video): 30 s from 35% in (same offset as thumbs: skips
the DoD "Unclassified" slates), pulled back so it ends inside the video. Short videos
start at 0, so green slate frames at either end of the window are trimmed off (skip_slates).
Idempotent: existing clips skipped unless --force (re-cut after a length change).

--vertical writes the 9:16 twin for Reels/Shorts/TikTok (Spec 5 §7) to
clips-v/<archive>/<id>.mp4: black pillar/letterbox bars cropped off (cropdetect), then the
video as big as it fits, on a blurred, cropped copy of itself (near-9:16 video fills the
frame); record id + clean title in the top band and realufo.org in the bottom band.
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

def title_layout(t, width=1000, em=0.72, max_fs=64):
    """(lines, fontsize) so the burned title fits `width` px of the 1080 frame: ≤2 lines split
    at the space nearest the middle, fontsize from the longest line. ponytail: em = DejaVu Sans
    Bold advance for all-caps text (mixed case ~0.62); a run of W/M could still clip — measure
    glyph widths if a real title does."""
    lines = [t]
    if len(t) > 24 and " " in t:
        i = min((i for i, c in enumerate(t) if c == " "), key=lambda i: abs(i - len(t) / 2))
        lines = [t[:i], t[i + 1:]]
    return lines, fit(max(map(len, lines)), max_fs, width, em)

def fit(n, max_fs, width=1000, em=0.72) -> int:
    """Largest fontsize ≤ max_fs at which n chars fit `width` px (see title_layout for em)."""
    return min(max_fs, int(width / (em * max(n, 1))))

def bars(iw, ih, w, h, x, y):
    """cropdetect box -> crop filter for a centred black pillarbox/letterbox, else None. Only one
    axis may shrink (by >=10%, symmetrically): a dark night sky also reads as black, e.g.
    LLE-UAP-PR002's top 354 rows, and those frames must stay whole."""
    for full, keep, off, ofull, okeep in ((iw, w, x, ih, h), (ih, h, y, iw, w)):
        if okeep >= 0.97 * ofull and 0.2 * full <= keep <= 0.9 * full and abs(off - (full - keep) / 2) <= 0.02 * full:
            return f"crop={w}:{h}:{x}:{y}"
    return None

def fills(w, h, loss=0.1) -> bool:
    """True when cropping w x h content to 9:16 loses <= `loss` of it: fill the frame, else fit inside."""
    r = (w / h) / (9 / 16)
    return 1 - 1 / max(r, 1 / r) <= loss

def probe(url, start, length):
    """(crop filter or None, fill?) from <=10 s of cropdetect over the clip window."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{start:.2f}", "-i", url, "-t", f"{min(length, 10):.2f}",
                          "-vf", "cropdetect=round=2", "-an", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"Video:.*?, (\d{2,5})x(\d{2,5})[ ,]", err)
    if not m:
        return None, False
    iw, ih = map(int, m.groups())
    if re.search(r"rotation of -?90", err):    # phone video: cropdetect sees the autorotated frame
        iw, ih = ih, iw
    box = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", err)
    crop = bars(iw, ih, *map(int, box[-1])) if box else None
    w, h = map(int, crop[5:].split(":")[:2]) if crop else (iw, ih)
    return crop, fills(w, h)

def slate(f, share=0.6) -> bool:
    """rgb24 frame is a DoD/AARO "Unclassified" title card: mostly flat green."""
    g = sum(f[i + 1] > f[i] + 40 and f[i + 1] > f[i + 2] + 40 for i in range(0, len(f) - 2, 3))
    return g >= share * len(f) / 3

def trim(flags, fps=10):
    """(skip s, keep s or None) dropping leading/trailing slate frames plus one sample of margin
    (fps sampling can land either side of the cut); all-slate keeps everything."""
    a, b = 0, len(flags)
    while a < b and flags[a]:
        a += 1
    while b > a and flags[b - 1]:
        b -= 1
    if a == b:
        return 0.0, None
    a, b = a + (a > 0), b - (b < len(flags))
    return a / fps, ((b - a) / fps if b < len(flags) else None)

def skip_slates(url, start, length, fps=10):
    """(start, length) with slates trimmed off both ends of the window (32x18 frames at 10 fps)."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.2f}", "-i", url, "-t", f"{length:.2f}",
                          "-vf", f"fps={fps},scale=32:18,format=rgb24", "-an", "-f", "rawvideo", "-"],
                         capture_output=True).stdout
    n = 32 * 18 * 3
    skip, keep = trim([slate(raw[i:i + n]) for i in range(0, len(raw) - n + 1, n)], fps)
    return round(start + skip, 2), (keep if keep is not None else length - skip)

def has_audio(url) -> bool:
    return bool(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                "-of", "csv=p=0", url], capture_output=True, text=True).stdout.strip())

def window(duration):
    """(start, length) in seconds."""
    if not duration or duration <= CLIP:
        return 0.0, CLIP
    return round(min(duration * 0.35, duration - CLIP), 2), CLIP

def ffmpeg_args(url, start, length, out, id_file, font, title_file=None, id_len=20, title_len=40):
    """Output width varies (<=1280), so id/title fontsizes shrink with w to fit (em as title_layout)."""
    # translucent box: readable on white-hot IR frames and over redaction blocks
    mark = f"fontfile={font}:fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.45:boxborderw=8"
    size = lambda fs, n: f"'min({fs},(w-40)/{0.72 * max(n, 1):.2f})'"
    vf = ("scale='trunc(min(1280,iw)/2)*2':-2,"
          f"drawtext={mark}:textfile={id_file}:expansion=none:fontsize={size(32, id_len)}:x=20:y=20,"
          + (f"drawtext={mark}:textfile={title_file}:expansion=none:fontsize={size(28, title_len)}:x=20:y=72,"
             if title_file else "") +
          f"drawtext={mark}:text=realufo.org:fontsize=26:x=w-text_w-20:y=h-text_h-20")
    return ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", url, "-t", f"{length:.2f}",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", vf, "-fpsmax", "30",
            "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-crf", "23", "-maxrate", "1500k", "-bufsize", "3000k",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]

def vertical_args(url, start, length, out, title_files, fontsize, font, audio=True, id_file=None, id_fontsize=46,
                  crop=None, fill=False):
    """title_files: one textfile per line (each drawtext centres its own line). crop strips black
    bars first; fill zooms near-9:16 content to the whole frame, else it is fitted as large as fits."""
    # Text stays inside the Reels/Shorts/TikTok safe zone: below the top tabs (~200 px)
    # and above the caption/buttons area (bottom ~450 px) of the 1080x1920 frame.
    band = f"fontfile={font}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2"
    boxed = f"{band}:box=1:boxcolor=black@0.45:boxborderw=10"
    title = "".join(f"drawtext={band}:textfile={f}:expansion=none:fontsize={fontsize}:y={340 + round(i * fontsize * 1.3)},"
                    for i, f in enumerate(title_files))
    cover = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    fc = (f"[0:v]{crop + ',' if crop else ''}split[a][b];"
          f"[a]{cover},boxblur=20[bg];"
          f"[b]{cover if fill else 'scale=1080:1920:force_original_aspect_ratio=decrease'}[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2,"
          + (f"drawtext={boxed}:textfile={id_file}:expansion=none:fontsize={id_fontsize}:y=270," if id_file else "") +
          f"{title}"
          f"drawtext={boxed}:text=realufo.org:fontsize=44:y=1420[v]")
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
        start, length = skip_slates(row["cdn_url"], *window(row["duration"]))
        # textfile= (not text=): ids and titles may hold ':' or quotes that break filtergraph syntax
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as idf:
            idf.write(row["id"])
        title = clean_title(row["id"], row.get("title"))     # landscape: one line, 40 chars
        if args.vertical:
            # 60: two auto-fitted lines hold it, so places/years survive ("…, Atlantic Ocean, 2020")
            lines, fs = title_layout(clean_title(row["id"], row.get("title"), 60))
            tfs = []
            for ln in lines:
                with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                    tf.write(ln)
                tfs.append(tf.name)
            crop, fill = probe(row["cdn_url"], start, length)
            cmd = vertical_args(row["cdn_url"], start, length, out, tfs, fs, FONT, has_audio(row["cdn_url"]), idf.name,
                                fit(len(row["id"]), 46), crop, fill)
        else:
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                tf.write(title)
            tfs = [tf.name]
            cmd = ffmpeg_args(row["cdn_url"], start, length, out, idf.name, FONT, tf.name, len(row["id"]), len(title))
        p = subprocess.run(cmd, capture_output=True, text=True)
        os.unlink(idf.name)
        for f in tfs:
            os.unlink(f)
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
