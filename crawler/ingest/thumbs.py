"""Backfill card thumbnails for live records that have no `thumb` asset.

    python3 -m ingest.thumbs --dry-run --limit 2   # render locally, no writes
    python3 -m ingest.thumbs                       # render + R2 upload + D1 rows

video -> ffmpeg picks a representative frame ~35% in, black bars cropped
(read straight from the CDN, range requests, no full download); image -> ffmpeg downscale;
pdf -> pdftoppm, the first non-blank of the first PAGES pages (black/grey scanner sheets
skipped). Output: 640px-wide JPEG at thumbs/<archive>/<id>.jpg.
Idempotent: only records without a thumb row are selected.

    python3 -m ingest.thumbs --redo DOW-UAP-D084:8 NARA-...   # replace existing PDF thumbs

--redo re-renders the given records' thumbs (page PAGE, else the first non-blank one) under a
new key thumbs/<archive>/<id>-p<N>.jpg (no CDN purge needed) and points the thumb row at it.

Also fills assets.duration (card m:ss badge) for video `full` assets still
NULL, via ffprobe on the CDN url; unprobeable ones stay NULL and retry next run.
"""
import argparse, glob, os, re, subprocess, sys, tempfile
from PIL import Image
from . import clips, d1, fetch, r2
from .models import R2_BASE

WIDTH = 640
SCALE = f"scale='min({WIDTH},iw)':-2"
SMALL = 400  # cards show ~180-260 CSS px; DocCard's srcset picks this on phones
PAGES = 6     # a PDF's thumb is its first non-blank page among these
BLANK = 0.98  # share of pixels within ±20 of the median that makes a page blank

def blank_page(path) -> bool:
    """Near-uniform page: black/grey scanner sheets, empty pages (0.98-1.0 of pixels near
    the median). Title slides and sparse text pages score <= 0.97.
    ponytail: blank folder covers with a small label pass as content; pick their page by hand
    with --redo ID:PAGE."""
    h = Image.open(path).convert("L").histogram()
    n, acc, med = sum(h), 0, 0
    for med, c in enumerate(h):
        acc += c
        if acc * 2 >= n:
            break
    return sum(h[max(0, med - 20):med + 21]) >= BLANK * n

def small_key(url: str):
    """R2 key of a card image's 400px WebP sibling (`x.jpg` -> `x-400.webp`).

    Same rule as web/src/lib/recordMedia.ts smallThumb(); None when the URL
    isn't a JPEG/PNG on our CDN."""
    m = re.fullmatch(re.escape(R2_BASE) + r"/(.+)\.(?:jpe?g|png)", url, re.I)
    return f"{m.group(1)}-{SMALL}.webp" if m else None

def small_pass(urls, exists, make):
    """Make the missing 400px siblings of `urls` -> (made, failed).

    exists(url) says whether a sibling is already on the CDN; make(url, key)
    renders + stores one. A failure is counted and the pass moves on."""
    made = failed = 0
    for url in dict.fromkeys(urls):
        key = small_key(url)
        if not key or exists(f"{R2_BASE}/{key}"):
            continue
        try:
            make(url, key)
            made += 1
        except Exception as e:
            failed += 1
            print(f"small FAIL {url}: {e}")
    return made, failed

def render_small(src, out):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", f"scale='min({SMALL},iw)':-2",
                    "-c:v", "libwebp", "-quality", "75", out], check=True, capture_output=True)

SELECT = """SELECT r.id, r.archive, r.kind, a.cdn_url, a.mime FROM records r
JOIN assets a ON a.record_id=r.id AND a.role IN ('full','original')
WHERE r.status='live'
  AND NOT EXISTS(SELECT 1 FROM assets t WHERE t.record_id=r.id AND t.role='thumb')
ORDER BY r.kind, r.id, a.role='full' DESC"""

REDO_SELECT = """SELECT r.id, r.archive, r.kind, a.cdn_url, a.mime FROM records r
JOIN assets a ON a.record_id=r.id AND a.role IN ('full','original')
WHERE r.id IN ({ids}) ORDER BY r.kind, r.id, a.role='full' DESC"""

# Every image a card can show (thumbSql in worker/lib/db.ts): thumbs, plus
# image `full` assets used when a record has no thumb.
SMALL_SELECT = """SELECT DISTINCT a.cdn_url FROM assets a JOIN records r ON r.id=a.record_id
WHERE r.status='live' AND (a.role='thumb' OR (a.role='full' AND a.mime LIKE 'image/%'))"""

DUR_SELECT = """SELECT a.id, a.cdn_url FROM assets a JOIN records r ON r.id=a.record_id
WHERE r.status='live' AND a.role='full' AND a.mime LIKE 'video/%' AND a.duration IS NULL"""

def probe_duration(url) -> str:
    return subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                           "-of", "csv=p=0", url], capture_output=True, text=True).stdout.strip()

def duration_sql(asset_id, probed: str):
    """UPDATE for a probed duration; None when ffprobe gave nothing usable ('', 'N/A')."""
    try:
        dur = float(probed)
    except ValueError:
        return None
    return f"UPDATE assets SET duration={dur:.3f} WHERE id={int(asset_id)};" if dur > 0 else None

CROP_SELECT = """SELECT a.id, a.cdn_url, a.duration FROM assets a JOIN records r ON r.id=a.record_id
WHERE r.status='live' AND a.role='full' AND a.mime LIKE 'video/%' AND a.crop IS NULL"""

def crop_sql(asset_id, crop) -> str:
    """UPDATE storing clips.probe's black-bar crop ("crop=w:h:x:y" or None) as 'w:h:x:y' / ''.
    ponytail: a failed probe also stores '' (probe can't tell it from "no bars"); reset crop to
    NULL to re-probe."""
    val = d1.sql_q(crop[5:]) if crop else "''"  # sql_q('') is NULL = unprobed
    return f"UPDATE assets SET crop={val} WHERE id={int(asset_id)};"

def todo(rows, limit=None):
    """One row per record (full beats original); `limit` caps each kind."""
    seen, per_kind, out = set(), {}, []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        k = "video" if r["mime"].startswith("video/") else "pdf" if r["mime"] == "application/pdf" else "image" if r["mime"].startswith("image/") else None
        if not k or (limit and per_kind.get(k, 0) >= limit):
            continue
        per_kind[k] = per_kind.get(k, 0) + 1
        out.append({**r, "media": k, "key": f"thumbs/{r['archive']}/{r['id']}.jpg"})
    return out

def crop_filter(cropdetect_log: str) -> str:
    """Last cropdetect result as a `crop=...,` filter prefix, per axis.

    Dark footage can make one axis fail: e.g. a night clip pillarboxed in
    1920x1080 gives `crop=606:-1078:656:1080` (columns found, no row bright
    enough once the bars are averaged in). Keep the valid axis, full size on
    the other; nothing usable -> no crop.
    """
    if "crop=" not in cropdetect_log:
        return ""
    w, h, x, y = cropdetect_log.rsplit("crop=", 1)[1].split()[0].split(":")
    wx = (w, x) if int(w) > 0 and int(x) >= 0 else ("iw", "0")
    hy = (h, y) if int(h) > 0 and int(y) >= 0 else ("ih", "0")
    if wx == ("iw", "0") and hy == ("ih", "0"):
        return ""
    return f"crop={wx[0]}:{hy[0]}:{wx[1]}:{hy[1]},"

def pick_page(pages, page=None):
    """pdftoppm outputs (page-01.jpg, ...) -> (path, page no.): `page` if given, else the
    first non-blank one, else the first."""
    num = lambda p: int(re.search(r"-(\d+)\.jpg$", p).group(1))
    pages = sorted(pages, key=num)
    pick = next((p for p in pages if num(p) == page), None) if page else next((p for p in pages if not blank_page(p)), None)
    pick = pick or pages[0]
    return pick, num(pick)

def render(row, out, work):
    """Render a thumb to `out`; returns the PDF page used (1 for video/image)."""
    url = row["cdn_url"]
    if row["media"] == "pdf":
        pdf = os.path.join(work, "src.pdf")
        fetch.download(url, pdf)
        prefix = os.path.join(work, "page")
        first, last = (row["page"], row["page"]) if row.get("page") else (1, PAGES)
        subprocess.run(["pdftoppm", "-jpeg", "-jpegopt", "quality=80", "-scale-to-x", str(WIDTH),
                        "-scale-to-y", "-1", "-f", str(first), "-l", str(last), pdf, prefix],
                       check=True, capture_output=True)
        pages = glob.glob(prefix + "-*.jpg")
        pick, n = pick_page(pages, row.get("page"))
        os.replace(pick, out)
        for p in pages:
            if p != pick:
                os.remove(p)
        os.remove(pdf)
        return n
    vf, seek = SCALE, []
    if row["media"] == "video":
        # DoD clips open (and often close) on "Unclassified" slates: sample at
        # 35% of the runtime, crop black letter/pillarbox bars, then let
        # thumbnail= pick the most representative of the next 30 frames.
        dur = probe_duration(url)
        seek = ["-ss", f"{float(dur) * 0.35 if duration_sql(0, dur) else 0:.2f}"]
        det = subprocess.run(["ffmpeg", "-v", "info", *seek, "-i", url, "-vf", "cropdetect=24:2:0",
                              "-frames:v", "30", "-f", "null", "-"], capture_output=True, text=True).stderr
        vf = f"{crop_filter(det)}thumbnail=30,{SCALE}"
    for s in (seek, []):  # unreadable duration / seek past end: retry from 0
        p = subprocess.run(["ffmpeg", "-v", "error", "-y", *s, "-i", url, "-vf", vf,
                            "-frames:v", "1", "-q:v", "4", out], capture_output=True, text=True)
        if p.returncode == 0 and os.path.exists(out) and os.path.getsize(out):
            return 1
    raise RuntimeError(p.stderr.strip()[-300:])

def insert_sql(row) -> str:
    rid = d1.sql_q(row["id"])
    return ("INSERT INTO assets(record_id,role,cdn_url,mime) "
            f"SELECT {rid},'thumb',{d1.sql_q(f'{R2_BASE}/' + row['key'])},'image/jpeg' "
            f"WHERE NOT EXISTS(SELECT 1 FROM assets WHERE record_id={rid} AND role='thumb');")

def redo_sql(row) -> str:
    return (f"UPDATE assets SET cdn_url={d1.sql_q(f'{R2_BASE}/' + row['key'])} "
            f"WHERE record_id={d1.sql_q(row['id'])} AND role='thumb';")

def parse_redo(args):
    """['A', 'B:8'] -> {'A': None, 'B': 8}"""
    out = {}
    for a in args:
        rid, _, page = a.rpartition(":") if re.search(r":\d+$", a) else (a, "", "")
        out[rid] = int(page) if page else None
    return out

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="render to --out only; no R2/D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max records per media kind")
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "realufo-thumbs"))
    ap.add_argument("--redo", nargs="+", metavar="ID[:PAGE]", help="replace these records' thumbs (see module doc)")
    args = ap.parse_args(argv)
    redo = parse_redo(args.redo or [])
    if redo:
        ids = ",".join(d1.sql_q(i) for i in redo)
        rows = [{**r, "page": redo[r["id"]]} for r in todo(d1._d1_json(" ".join(REDO_SELECT.format(ids=ids).split())))]
    else:
        rows = todo(d1._d1_json(" ".join(SELECT.split())), args.limit)
    os.makedirs(args.out, exist_ok=True)
    done, failed = [], 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            out = os.path.join(args.out, f"{row['id']}.jpg")
            try:
                page = render(row, out, work)
                if redo:
                    row["key"] = f"thumbs/{row['archive']}/{row['id']}-p{page}.jpg"
                if not args.dry_run:
                    r2.put(row["key"], out, "image/jpeg")
                done.append(row)
                print(f"[{i}/{len(rows)}] ok   {row['media']:5} {row['id']} -> {row['key']}")
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['media']:5} {row['id']}: {e}")
        sql = "\n".join((redo_sql if redo else insert_sql)(r) for r in done) + "\n"
        open(os.path.join(args.out, "thumbs.sql"), "w").write(sql)
        if done and not args.dry_run:
            d1.apply_sql(os.path.join(args.out, "thumbs.sql"))
    # 400px WebP siblings for every card image still missing one: this run's new
    # thumbs (inserted above) and the backfill of older ones. Idempotent.
    def make(url, key):
        with tempfile.TemporaryDirectory() as w:
            src, out = os.path.join(w, "src"), os.path.join(args.out, key.replace("/", "_"))
            fetch.download(url, src)
            render_small(src, out)
            if not args.dry_run:
                r2.put(key, out, "image/webp")
    small_urls = [r["cdn_url"] for r in d1._d1_json(" ".join(SMALL_SELECT.split()))]
    if args.limit:  # CI's manual dry run (--limit 1): one real libwebp render as a smoke test
        small_urls = [u for u in small_urls if small_key(u)][:args.limit]
    small_made, small_failed = small_pass(small_urls, fetch.head_ok, make)
    failed += small_failed
    print(f"small {SMALL}px: made={small_made} failed={small_failed} of {len(set(small_urls))}")
    dur_rows = d1._d1_json(" ".join(DUR_SELECT.split()))
    updates = [u for u in (duration_sql(r["id"], probe_duration(r["cdn_url"])) for r in dur_rows) if u]
    open(os.path.join(args.out, "durations.sql"), "w").write("\n".join(updates) + "\n")
    if updates and not args.dry_run:
        d1.apply_sql(os.path.join(args.out, "durations.sql"))
    print(f"durations: probed={len(updates)}/{len(dur_rows)}")
    # black bars (phone clip padded to 16:9): mid-video window, clear of DoD slates at the ends
    crop_rows = d1._d1_json(" ".join(CROP_SELECT.split()))
    crops = [crop_sql(r["id"], clips.probe(r["cdn_url"], max(0.0, (r["duration"] or 0) / 2 - 5), 10)[0]) for r in crop_rows]
    open(os.path.join(args.out, "crops.sql"), "w").write("\n".join(crops) + "\n")
    if crops and not args.dry_run:
        d1.apply_sql(os.path.join(args.out, "crops.sql"))
    barred = sum("crop=''" not in c for c in crops)
    print(f"crops: barred={barred}/{len(crops)}")
    print(f"{'dry-run ' if args.dry_run else ''}rendered={len(done)} failed={failed} out={args.out}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
