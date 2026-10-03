"""Point records.source_url at the official source so the doc page can link back:
the DVIDS page for videos, the war.gov file for war.gov PDFs/images, and for the
snapshot archives (aaro, nasa, nara, ...) the official file from their JSON `s` field.

    python source-links.py            # print planned changes
    python source-links.py --apply    # + write them to remote D1
    python source-links.py --apply x.csv   # also read these war.gov CSVs (war.gov 403s at times)

Idempotent; rerun after an ingest. Rows with no known source keep their URL.
"""
import csv, glob, json, os, posixpath, re, sys, tempfile
from urllib.parse import quote, unquote
from ingest import d1
from ingest.cli import CSV_PATHS
from ingest.sources import wargov
from ingest.sources.snapshot import ARCHIVE_ROWS, _load

HERE = os.path.dirname(os.path.abspath(__file__))


def _base(url):
    return unquote(posixpath.basename(url.split("?")[0])).strip().lower()


def dvids_by_dod():
    m = {}
    for p in glob.glob(os.path.join(HERE, "dvids-maps", "dvids2dod-r0*.json")):
        m.update({dod: dv for dv, dod in json.load(open(p)).items()})
    for dv, meta in json.load(open(os.path.join(HERE, "dvids-maps", "aaro-dvids.json"))).items():
        m.setdefault(meta["dod"], dv)
    return m


def wargov_links(paths):
    out = {}
    for p in paths:
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            link = (r.get("PDF | Image Link") or "").strip()
            if link.startswith("https://www.war.gov/"):
                out[_base(link)] = link
    return out


def snapshot_sources():
    """cdn_url -> official URL. An asset listed twice keeps its longest (most exact) source:
    the NASA PDFs appear once with the wp-content file and once with the /uap/ landing page."""
    m = {}
    for slug in ARCHIVE_ROWS:
        for a in _load(slug, os.path.join(HERE, "ingest", "data")):
            u, src = (a.get("u") or a.get("l") or "").strip(), (a.get("s") or "").strip()
            if u and src and len(src) > len(m.get(u, "")):
                m[u] = quote(src, safe=":/%?=&#")  # aaro.mil paths carry raw spaces
    return m


def source_for(row, dvids, links):
    url = row["cdn_url"] or ""
    if row["kind"] == "video":
        dod = (re.search(r"DOD_(\d+)", url) or [None, None])[1]
        return f"https://www.dvidshub.net/video/{dvids[dod]}" if dod in dvids else None
    if row["archive"] == "wargov":
        return links.get(_base(url))
    return None


def main(apply, extra_csvs):
    with tempfile.TemporaryDirectory() as work:
        # committed CSVs first so fresher ones override
        links = wargov_links(CSV_PATHS + extra_csvs + wargov.refresh_csvs(work, []))
    dvids = dvids_by_dod()
    snap = snapshot_sources()
    rows = d1._d1_json("SELECT r.id, r.archive, r.kind, r.source_url, a.cdn_url FROM records r "
                       "JOIN assets a ON a.record_id=r.id AND a.role='full'")
    sql = []
    for r in rows:
        src = source_for(r, dvids, links)
        # snapshot sources only fill rows still pointing at our own mirror
        cur = r["source_url"] or ""
        if not src and (not cur or cur.startswith("https://assets.realufo.org/")):
            src = snap.get(r["cdn_url"])
        if src and src != r["source_url"]:
            sql.append(f"UPDATE records SET source_url={d1.sql_q(src)} WHERE id={d1.sql_q(r['id'])};")
    print(f"records={len(rows)} updates={len(sql)}")
    print("\n".join(sql if "-v" in sys.argv else sql[:5]))
    if apply and sql:
        path = os.path.join(tempfile.gettempdir(), "source-links.sql")
        open(path, "w").write("\n".join(sql) + "\n")
        d1.apply_sql(path)
        print("applied to remote D1")


if __name__ == "__main__":
    main("--apply" in sys.argv[1:], [a for a in sys.argv[1:] if a.endswith(".csv")])
