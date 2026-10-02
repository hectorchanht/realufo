"""Backfill card thumbnails for live records that have no `thumb` asset.

    python3 -m ingest.thumbs --dry-run --limit 2   # render locally, no writes
    python3 -m ingest.thumbs                       # render + R2 upload + D1 rows

video -> ffmpeg picks a representative frame ~35% in, black bars cropped
(read straight from the CDN, range requests, no full download); image -> ffmpeg downscale;
pdf -> pdftoppm page 1. Output: 640px-wide JPEG at thumbs/<archive>/<id>.jpg.
Idempotent: only records without a thumb row are selected.
"""
import argparse, os, subprocess, sys, tempfile
from . import d1, fetch, r2
from .models import R2_BASE

WIDTH = 640
SCALE = f"scale='min({WIDTH},iw)':-2"

SELECT = """SELECT r.id, r.archive, r.kind, a.cdn_url, a.mime FROM records r
JOIN assets a ON a.record_id=r.id AND a.role IN ('full','original')
WHERE r.status='live'
  AND NOT EXISTS(SELECT 1 FROM assets t WHERE t.record_id=r.id AND t.role='thumb')
ORDER BY r.kind, r.id, a.role='full' DESC"""

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

def render(row, out, work):
    url = row["cdn_url"]
    if row["media"] == "pdf":
        pdf = os.path.join(work, "src.pdf")
        fetch.download(url, pdf)
        prefix = os.path.join(work, "page")
        subprocess.run(["pdftoppm", "-jpeg", "-jpegopt", "quality=80", "-scale-to-x", str(WIDTH),
                        "-scale-to-y", "-1", "-singlefile", "-f", "1", "-l", "1", pdf, prefix],
                       check=True, capture_output=True)
        os.replace(prefix + ".jpg", out)
        os.remove(pdf)
        return
    vf, seek = SCALE, []
    if row["media"] == "video":
        # DoD clips open (and often close) on "Unclassified" slates: sample at
        # 35% of the runtime, crop black letter/pillarbox bars, then let
        # thumbnail= pick the most representative of the next 30 frames.
        dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", url], capture_output=True, text=True).stdout.strip()
        seek = ["-ss", f"{float(dur or 0) * 0.35:.2f}"]
        det = subprocess.run(["ffmpeg", "-v", "info", *seek, "-i", url, "-vf", "cropdetect=24:2:0",
                              "-frames:v", "30", "-f", "null", "-"], capture_output=True, text=True).stderr
        crop = "crop=" + det.rsplit("crop=", 1)[1].split()[0] + "," if "crop=" in det else ""
        vf = f"{crop}thumbnail=30,{SCALE}"
    for s in (seek, []):  # unreadable duration / seek past end: retry from 0
        p = subprocess.run(["ffmpeg", "-v", "error", "-y", *s, "-i", url, "-vf", vf,
                            "-frames:v", "1", "-q:v", "4", out], capture_output=True, text=True)
        if p.returncode == 0 and os.path.exists(out) and os.path.getsize(out):
            return
    raise RuntimeError(p.stderr.strip()[-300:])

def insert_sql(row) -> str:
    rid = d1.sql_q(row["id"])
    return ("INSERT INTO assets(record_id,role,cdn_url,mime) "
            f"SELECT {rid},'thumb',{d1.sql_q(f'{R2_BASE}/' + row['key'])},'image/jpeg' "
            f"WHERE NOT EXISTS(SELECT 1 FROM assets WHERE record_id={rid} AND role='thumb');")

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="render to --out only; no R2/D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max records per media kind")
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "realufo-thumbs"))
    args = ap.parse_args(argv)
    rows = todo(d1._d1_json(" ".join(SELECT.split())), args.limit)
    os.makedirs(args.out, exist_ok=True)
    done, failed = [], 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            out = os.path.join(args.out, f"{row['id']}.jpg")
            try:
                render(row, out, work)
                if not args.dry_run:
                    r2.put(row["key"], out, "image/jpeg")
                done.append(row)
                print(f"[{i}/{len(rows)}] ok   {row['media']:5} {row['id']} -> {row['key']}")
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['media']:5} {row['id']}: {e}")
        sql = "\n".join(insert_sql(r) for r in done) + "\n"
        open(os.path.join(args.out, "thumbs.sql"), "w").write(sql)
        if done and not args.dry_run:
            d1.apply_sql(os.path.join(args.out, "thumbs.sql"))
    print(f"{'dry-run ' if args.dry_run else ''}rendered={len(done)} failed={failed} out={args.out}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
