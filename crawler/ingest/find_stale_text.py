"""Find records whose D1 record_text is stale vs their R2 text/<id>.json (PaddleOCR).

For every live PDF with a record_ocr marker: download the R2 text JSON, run
fulltext.select_pages over it (the exact code that builds record_text), and
compare against the stored record_text.pages. A record is STALE when the stored
row is missing a page the R2 text would keep, or a stored page's head/tail
clearly comes from a different extraction than the R2 one (e.g. the pre-OCR
pdftotext garbage). Same-source version drift (slightly different cut) is
tolerated.

Prints shell-safe assignments for the reindex workflow:
    STALE_IDS="<ids with a differing row>"      # requeue + full rebuild chain
    MISSING_IDS="<ids with marker but no row>"   # fulltext picks up; --ids for AI steps
"""
import json
import re
import sys
import urllib.parse
import urllib.request

from . import d1
from .fulltext import select_pages

TEXT_BASE = "https://assets.realufo.org/text/"
BATCH = 100  # ids per D1 IN-query (pages column is wide)


def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


def page_fresh(stored_text: str, expected_text: str) -> bool:
    ns, ne = norm(stored_text), norm(expected_text)
    if len(ns) < 50 or len(ne) < 50:
        return ns == ne
    # Same extraction => same head and tail (cuts only move the tail's cut
    # point, and a different extraction almost always changes the head).
    return ns[:200] == ne[:200] and ns[-200:] == ne[-200:]


def fetch_r2(rid: str):
    url = TEXT_BASE + urllib.parse.quote(rid, safe="") + ".json"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except Exception as e:
        print(f"  WARN {rid}: R2 text JSON unreadable: {e}", file=sys.stderr)
        return None


def main() -> int:
    ids = [r["id"] for r in d1._d1_json(
        "SELECT r.id FROM records r JOIN record_ocr o ON o.record_id=r.id "
        "WHERE r.status='live' AND r.kind='pdf' ORDER BY r.id")]
    print(f"{len(ids)} live PDFs with a record_ocr marker", file=sys.stderr)
    stored: dict[str, str | None] = {}
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        q = ",".join(d1.sql_q(x) for x in chunk)
        for r in d1._d1_json(
                f"SELECT record_id AS id, pages FROM record_text WHERE record_id IN ({q})"):
            stored[r["id"]] = r["pages"]
    safe = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.~-]*$")
    ids = [i for i in ids if safe.match(i)]  # keep eval() in the workflow safe
    stale, missing = [], []
    for n, rid in enumerate(ids, 1):
        pages = fetch_r2(rid)
        if not pages:
            continue
        expected, _ = select_pages([p.get("text", "") for p in pages])
        raw = stored.get(rid)
        if raw is None:
            missing.append(rid)
            continue
        try:
            have = json.loads(raw)
        except Exception:
            stale.append(rid)
            continue
        if [p["n"] for p in have] != [p["n"] for p in expected]:
            stale.append(rid)
            continue
        exp_by_n = {p["n"]: p["text"] for p in expected}
        if any(not page_fresh(p["text"], exp_by_n[p["n"]]) for p in have):
            stale.append(rid)
        if n % 100 == 0:
            print(f"  ...{n}/{len(ids)} checked", file=sys.stderr)
    print(f"STALE_IDS=\"{' '.join(stale)}\"")
    print(f"MISSING_IDS=\"{' '.join(missing)}\"")
    print(f"stale={len(stale)} missing={len(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
