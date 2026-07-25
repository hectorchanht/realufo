import argparse, os, sys, tempfile
from . import d1, r2
from .sources import wargov, snapshot

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "data")
CSV_PATHS = [os.path.join(os.path.dirname(HERE), "uap-data.csv"),
             os.path.join(os.path.dirname(HERE), "uap-release001.csv")]
DVIDS_DIR = os.path.join(os.path.dirname(HERE), "dvids-maps")

def _dvids_map():
    import glob, json
    m = {}
    for p in sorted(glob.glob(os.path.join(DVIDS_DIR, "dvids2dod-r0*.json"))):
        m.update(json.load(open(p)))
    return m

def _load_source(slug, taken, work):
    if slug == "wargov":
        # re-fetch live war.gov CSVs so new releases surface as new rows
        paths = wargov.refresh_csvs(work, CSV_PATHS) or CSV_PATHS
        return wargov.candidates(paths, _dvids_map(), taken), wargov.ARCHIVE_ROW
    return snapshot.candidates(slug, DATA, taken), snapshot.ARCHIVE_ROWS[slug]

def build_plan(existing_ids, existing_urls, all_candidates):
    return [c for c in all_candidates if c.cdn_url not in existing_urls]

def run(sources, dry_run=False, limit=None):
    existing_ids, existing_urls = d1.load_existing()
    taken = set(existing_ids)
    summary = {}
    with tempfile.TemporaryDirectory() as work:
        for slug in sources:
            try:
                cands, arch_row = _load_source(slug, taken, work)
                plan = build_plan(existing_ids, existing_urls, cands)
                if limit:
                    plan = plan[:limit]
                mirrored, failed = [], 0
                for c in plan:
                    if dry_run:
                        mirrored.append(c); continue
                    if r2.mirror(c, work):
                        mirrored.append(c); existing_urls.add(c.cdn_url)
                    else:
                        failed += 1
                summary[slug] = {"new": len(plan), "mirrored": len(mirrored), "failed": failed}
                if mirrored and not dry_run:
                    sql = d1.emit_sql(mirrored, {slug: arch_row})
                    p = os.path.join(work, f"{slug}.sql")
                    open(p, "w").write(sql)
                    d1.apply_sql(p)
            except Exception as e:
                summary[slug] = {"new": 0, "mirrored": 0, "failed": 1, "error": str(e)}
                continue
    return summary

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="wargov,aaro,nasa,nara")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args(argv)
    summary = run([s.strip() for s in args.sources.split(",") if s.strip()], args.dry_run, args.limit)
    for slug, s in summary.items():
        print(f"{slug:8} new={s['new']:4} mirrored={s['mirrored']:4} failed={s['failed']:4}")
        if s.get("error"):
            print(f"  ERROR: {s['error']}")
    sys.exit(1 if any(s["failed"] for s in summary.values()) else 0)
