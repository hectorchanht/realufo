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
clips-staging/<archive>/<id>.mp4: black pillar/letterbox bars cropped off (cropdetect), then the
video as big as it fits, on a blurred, cropped copy of itself (near-9:16 video fills the
frame); record id + clean title in the top band and a showcase-style "realufo.org · <id>"
watermark bottom-centre — all burned onto the content itself, never the blurred surround.
--voice mixes a Kokoro voiceover (spoken id + title + one-liner, same af_heart voice as the
handmade showcase clips) under the source audio; best-effort, the clip renders regardless.
Staging is invisible to the /shorts listing (it reads clips-v/ directly): the Telegram
admin portal (worker/lib/contentTick.ts) offers one staged clip per day, and approval
promotes it to clips-v/<archive>/<id>.mp4 — one curated Short per day, no batch posting.
Both need a TTF at $CLIP_FONT (default: DejaVu Sans Bold from apt fonts-dejavu-core); the path
must not contain spaces, ':' or quotes (ffmpeg filtergraph syntax).
"""
import argparse, os, re, subprocess, sys, tempfile, time
from . import d1, fetch, kokoro_voice, r2
from .models import R2_BASE

CLIP = 30.0

SELECT = """SELECT r.id, r.archive, r.title, a.cdn_url, a.duration, a.crop, t.one_liner FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='full'
LEFT JOIN record_tldr t ON t.record_id=r.id AND t.lang='en'
WHERE r.status='live' AND a.mime LIKE 'video/%' ORDER BY r.id"""
FONT = os.environ.get("CLIP_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")

def key(row) -> str:
    return f"clips/{row['archive']}/{row['id']}.mp4"

def vkey(row) -> str:
    # live 9:16 twin (what /shorts lists); vertical renders go to skey() staging first
    return f"clips-v/{row['archive']}/{row['id']}.mp4"

def skey(row) -> str:
    # staging for the Telegram gate: invisible until approval promotes it via vkey()
    return f"clips-staging/{row['archive']}/{row['id']}.mp4"

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

def spoken_id(rid) -> str:
    """Record id as TTS input: letters AND digits spelled out ("AARO-DOD_109584445" ->
    "A A R O D O D 1 0 9 5 8 4 4 4 5") so Kokoro reads it as an id, never as
    "one hundred nine million ..."."""
    return " ".join(" ".join(tok) for tok in re.findall(r"[A-Za-z]+|\d+", rid or ""))

def narration_text(row) -> str:
    """Voiceover line: spoken id + title + the record's one-liner (≤15 words) when it has one."""
    title = clean_title(row["id"], row.get("title"), 60)
    text = f"{spoken_id(row['id'])}. {title}."
    one = (row.get("one_liner") or "").strip()
    return f"{text} {one}" if one else text

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

def stored(crop):
    """assets.crop 'w:h:x:y' (thumbs.py backfill, or set by hand where bars() refuses, e.g. dark
    night footage) -> (crop filter, fill?) like probe(); None when unset so the caller probes."""
    if not crop:
        return None
    w, h = map(int, crop.split(":")[:2])
    return f"crop={crop}", fills(w, h)

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
    # text only (no box): a thick outline + soft shadow keeps it readable on white-hot IR frames
    mark = f"fontfile={font}:fontcolor=white:borderw=3:bordercolor=black:shadowcolor=black@0.6:shadowx=2:shadowy=2"
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
                  crop=None, fill=False, brand_file=None, brand_fontsize=52, voice_file=None):
    """title_files: one textfile per line (each drawtext centres its own line). crop strips black
    bars first; fill zooms near-9:16 content to the whole frame, else it is fitted as large as fits.
    brand_file: textfile with "realufo.org · <id>", burned bottom-centre of the clip itself.
    voice_file: Kokoro narration wav mixed under the source audio (best-effort: None skips it)."""
    # Text is burned onto the fitted content box BEFORE the blur composite, so the watermark
    # always sits inside the clip — never on the blurred surround (the old fixed y=1420 landed
    # outside the clip whenever the content didn't fill the frame, e.g. #12 AARO-DOD_109584445).
    # Style copied from the handmade showcase clips (showcase/lib.py): bold white with a thick
    # black outline + soft shadow, no box; the brand line sits bottom-centre of the content.
    band = ("fontfile=%s:fontcolor=white:borderw=4:bordercolor=black:shadowcolor=black@0.6:"
            "shadowx=2:shadowy=2:x=(w-text_w)/2" % font)
    fg_text = "".join([
        f",drawtext={band}:textfile={id_file}:expansion=none:fontsize={id_fontsize}:y=40" if id_file else "",
        *[f",drawtext={band}:textfile={f}:expansion=none:fontsize={fontsize}"
           f":y={40 + round(id_fontsize * 1.4) + round(i * fontsize * 1.3)}"
           for i, f in enumerate(title_files)],
        # showcase-style watermark: "realufo.org · <id>", bottom-centre of the clip itself
        f",drawtext={band}:textfile={brand_file}:expansion=none:fontsize={brand_fontsize}:y=h-text_h-90" if brand_file else "",
    ])
    cover = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    fc = (f"[0:v]{crop + ',' if crop else ''}split[a][b];"
          f"[a]{cover},boxblur=20[bg];"
          f"[b]{cover if fill else 'scale=1080:1920:force_original_aspect_ratio=decrease'}{fg_text}[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]")
    a = ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", url]
    n_in = 1
    vi = ai = None
    if voice_file:
        a += ["-i", voice_file]
        vi, n_in = n_in, n_in + 1
    if not audio and voice_file is None:
        a += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
        ai, n_in = n_in, n_in + 1
    if voice_file is not None:
        # narration under the source audio (or a silent bed when the source has none),
        # starting 0.8 s in so the title card reads first; never longer than the clip
        base = ("[0:a]aformat=channel_layouts=stereo[base]" if audio
                else f"anullsrc=channel_layout=stereo:sample_rate=44100:d={length:.2f}[base]")
        fc += (f";{base};[{vi}:a]aformat=channel_layouts=stereo,adelay=800|800[vo];"
               "[base][vo]amix=inputs=2:normalize=0:duration=first[aout]")
        amap = ["-map", "[aout]"]
    else:
        amap = ["-map", "0:a:0" if audio else f"{ai}:a"]
    return a + ["-t", f"{length:.2f}", "-filter_complex", fc, "-map", "[v]", *amap,
                # constant 30 fps: TikTok rejects < 23 fps (FBI-UAP-PR007's source is 10 fps)
                "-r", "30", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast",
                "-crf", "23", "-maxrate", "1500k", "-bufsize", "3000k",
                "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]

def todo(rows, exists=fetch.head_ok, limit=None, force=False, keyf=key, live_keyf=None):
    seen, out = set(), []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        if not force and exists(f"{R2_BASE}/{keyf(r)}"):
            continue
        if not force and live_keyf and exists(f"{R2_BASE}/{live_keyf(r)}"):
            continue  # already promoted to the live prefix: nothing to stage
        out.append(r)
        if limit and len(out) >= limit:
            break
    return out

def record_motion(rid, kind, path):
    """Best-effort: score the rendered clip's first frames into short_motion
    (db/migrations/0042) so the feed's motion-first ordering picks it up.
    Never raises — a missing table (migration not yet applied), missing numpy
    or an ffmpeg hiccup must not fail a render."""
    try:
        from .motion import score_frames
        motion, n = score_frames(path)
        d1.execute(
            "INSERT INTO short_motion (record_id, kind, motion, frames, computed_at) VALUES "
            f"({d1.sql_q(rid)}, '{kind}', {motion}, {n}, {int(time.time())}) "
            "ON CONFLICT(record_id, kind) DO UPDATE SET motion=excluded.motion, "
            "frames=excluded.frames, computed_at=excluded.computed_at")
        print(f"motion {rid}: {motion}")
    except Exception as e:  # noqa: BLE001 - scoring is advisory
        print(f"motion SKIP {rid}: {str(e)[:120]}")

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="encode to --out only; no R2 upload")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--force", action="store_true", help="re-cut clips that already exist")
    ap.add_argument("--vertical", action="store_true", help="cut the 9:16 twin to clips-v/ (Reels/Shorts/TikTok)")
    ap.add_argument("--voice", action="store_true",
                    help="mix a Kokoro voiceover (spoken id + title + one-liner) under --vertical twins; "
                         "best-effort: the clip still renders when TTS is unavailable")
    ap.add_argument("--only", nargs="+", metavar="ID", help="just these record ids (with --force: re-cut them)")
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "realufo-clips"))
    args = ap.parse_args(argv)
    keyf = skey if args.vertical else key
    live_keyf = vkey if args.vertical else None
    if not os.path.exists(FONT):
        sys.exit(f"clips need a TTF font at CLIP_FONT (missing: {FONT})")
    rows = d1._d1_json(" ".join(SELECT.split()))
    if args.only:
        rows = [r for r in rows if r["id"] in args.only]
    rows = todo(rows, limit=args.limit, force=args.force, keyf=keyf, live_keyf=live_keyf)
    os.makedirs(args.out, exist_ok=True)
    done = failed = 0
    for i, row in enumerate(rows, 1):
        out = os.path.join(args.out, f"{row['id']}{'-v' if args.vertical else ''}.mp4")
        start, length = skip_slates(row["cdn_url"], *window(row["duration"]))
        # textfile= (not text=): ids and titles may hold ':' or quotes that break filtergraph syntax
        tmp_txts = []

        def textfile(text):
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                tf.write(text)
            tmp_txts.append(tf.name)
            return tf.name

        id_file = textfile(row["id"])
        title = clean_title(row["id"], row.get("title"))     # landscape: one line, 40 chars
        if args.vertical:
            # 60: two auto-fitted lines hold it, so places/years survive ("…, Atlantic Ocean, 2020")
            lines, fs = title_layout(clean_title(row["id"], row.get("title"), 60))
            tfs = [textfile(ln) for ln in lines]
            # showcase-style watermark, burned bottom-centre of the clip itself
            brand_text = f"realufo.org · {row['id']}"
            brand_file = textfile(brand_text)
            brand_fs = fit(len(brand_text), 52, 1000, 0.62)   # shrink long ids to the 1080 frame
            voice_file = (kokoro_voice.narration_wav(narration_text(row), os.path.join(args.out, ".voice"))
                          if args.voice else None)
            crop, fill = stored(row.get("crop")) or probe(row["cdn_url"], start, length)
            cmd = vertical_args(row["cdn_url"], start, length, out, tfs, fs, FONT, has_audio(row["cdn_url"]), id_file,
                                fit(len(row["id"]), 46), crop, fill, brand_file, brand_fs, voice_file)
        else:
            tfs = [textfile(title)]
            cmd = ffmpeg_args(row["cdn_url"], start, length, out, id_file, FONT, tfs[0], len(row["id"]), len(title))
        p = subprocess.run(cmd, capture_output=True, text=True)
        for f in tmp_txts:
            os.unlink(f)
        if p.returncode or not os.path.exists(out) or not os.path.getsize(out):
            failed += 1
            print(f"[{i}/{len(rows)}] FAIL {row['id']}: {p.stderr.strip()[-300:]}")
            continue
        if not args.dry_run:
            r2.put(keyf(row), out, "video/mp4")
        if args.vertical and not args.dry_run:
            # the 9:16 twin is what the feed's Shorts listing serves: score its
            # first frames so the motion-first ordering picks it up (0042)
            record_motion(row["id"], "twin", out)
        done += 1
        print(f"[{i}/{len(rows)}] ok   {row['id']} {start:.0f}s+{length:.0f}s {os.path.getsize(out) // 1024} KB -> {keyf(row)}")
    print(f"{'dry-run ' if args.dry_run else ''}clips={done} failed={failed} out={args.out}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
