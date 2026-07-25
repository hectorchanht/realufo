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
