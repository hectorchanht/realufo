import os
from ingest.sources import snapshot

FIXDIR = os.path.join(os.path.dirname(__file__), "fixtures")

def test_snapshot_keeps_r2_hosted_dedups_and_skips_origin(tmp_path):
    import shutil
    shutil.copy(os.path.join(FIXDIR, "aaro_sample.json"), tmp_path / "aaro.json")
    cands = snapshot.candidates("aaro", str(tmp_path), set())
    assert len(cands) == 1                          # dup url collapsed, aaro.mil IMG dropped
    c = cands[0]
    assert c.kind == "pdf"
    assert c.cdn_url == "https://assets.realufo.org/pdfs/aaro/report-a.pdf"
    assert c.thumb_url.endswith("report-a.jpg")

def test_snapshot_keeps_origin_url_and_licence(tmp_path):
    import json
    a = {"t": "PDF", "ti": "Shag Harbour file", "u": "https://assets.realufo.org/pdfs/canada/shag.pdf",
         "s": "https://recherche-collection-search.bac-lac.gc.ca/x", "lic": "crown-copyright-canada"}
    (tmp_path / "canada.json").write_text(json.dumps({"v1": {"assets": [a]}}))
    c = snapshot.candidates("canada", str(tmp_path), set())[0]
    assert c._source == a["s"] and c._license == "crown-copyright-canada"

def test_snapshot_incident_date_can_differ_from_the_document_date(tmp_path):
    import json
    a = {"t": "PDF", "ti": "Roswell report", "u": "https://assets.realufo.org/pdfs/dod/r.pdf", "date": "Jul 1994", "idate": "Jul 1947"}
    b = {"t": "PDF", "ti": "Hearing", "u": "https://assets.realufo.org/pdfs/dod/h.pdf", "date": "Sep 2025"}
    (tmp_path / "dod.json").write_text(json.dumps({"v1": {"assets": [a, b]}}))
    r, h = snapshot.candidates("dod", str(tmp_path), set())
    assert (r.doc_date, r.incident_date) == ("Jul 1994", "Jul 1947")
    assert (h.doc_date, h.incident_date) == ("Sep 2025", "Sep 2025")   # no idate: same as before
