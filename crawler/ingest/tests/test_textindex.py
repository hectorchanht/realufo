import json, subprocess, pytest
from ingest import textindex, chunking

PAGE = " ".join(f"Line {i} describes the object seen over the base." for i in range(40))

def _row(id, kind="pdf", url="https://cdn/x.pdf"):
    return {"id": id, "kind": kind, "title": f"T {id}", "agency": "AARO", "incident_date": None,
            "location": None, "summary": "s", "url": url}

@pytest.fixture
def world(monkeypatch, tmp_path):
    w = {"rows": [], "failed": [], "embedded": [], "upserted": [], "deleted": [], "applied": [], "executed": [],
         "pages": {}}
    def d1_json(sql):
        return w["failed"] if "status='failed'" in sql else w["rows"]
    def pdf_pages(url, work, ocr_id=None):
        w.setdefault("ocr_ids", []).append(ocr_id)
        p = w["pages"].get(url, [PAGE])
        if isinstance(p, Exception):
            raise p
        return p
    monkeypatch.setattr(textindex.d1, "_d1_json", d1_json)
    monkeypatch.setattr(textindex.d1, "apply_sql", lambda path: w["applied"].append(open(path).read()))
    monkeypatch.setattr(textindex.d1, "execute", lambda sql: w["executed"].append(sql))
    monkeypatch.setattr(textindex, "pdf_pages", pdf_pages)
    monkeypatch.setattr(textindex.cfapi, "embed", lambda texts: w["embedded"].extend(texts) or [[0.0]] * len(texts))
    monkeypatch.setattr(textindex.cfapi, "upsert", lambda v: w["upserted"].extend(v))
    monkeypatch.setattr(textindex.cfapi, "delete", lambda ids: w["deleted"].extend(ids))
    return w

def run(*argv):
    with pytest.raises(SystemExit) as e:
        textindex.main(list(argv))
    return e.value.code

def test_live_run_upserts_card_and_pages_and_records_status(world):
    world["rows"] = [_row("P1"), _row("V1", kind="video", url="https://cdn/v.mp4")]
    assert run() == 0
    meta = [v["metadata"] for v in world["upserted"]]
    assert {"record_id": "V1", "page": 0, "text": "T V1 — AARO\ns"} in meta    # video: card only
    assert any(m["record_id"] == "P1" and m["page"] == 1 for m in meta)
    assert all(v["id"].startswith(chunking.vector_id(m["record_id"], 0)[:12]) for v, m in zip(world["upserted"], meta))
    sql = "".join(world["applied"])
    assert "'P1','indexed'" in sql and "'V1','indexed'" in sql
    assert "DELETE FROM ask_cache;" in world["executed"]

def test_kind_filter_indexes_only_those_kinds(world):
    world["rows"] = [_row("P1"), _row("V1", kind="video"), _row("I1", kind="image")]
    assert run("--kind", "video,image") == 0
    assert {v["metadata"]["record_id"] for v in world["upserted"]} == {"V1", "I1"}

def test_pdf_without_text_is_empty_but_card_still_indexed(world):
    world["rows"] = [_row("P2")]
    world["pages"]["https://cdn/x.pdf"] = ["   ", ""]
    assert run() == 0
    assert [v["metadata"]["page"] for v in world["upserted"]] == [0]
    assert "'P2','empty',1," in "".join(world["applied"])

def test_corrupt_pdf_marks_failed_and_run_continues(world, monkeypatch):
    world["rows"] = [_row("BAD", url="https://cdn/bad.pdf"), _row("OK")]
    world["pages"]["https://cdn/bad.pdf"] = subprocess.CalledProcessError(1, "pdftotext")
    assert run() == 1
    sql = "".join(world["applied"])
    assert "'BAD','failed'" in sql and "'OK','indexed'" in sql

def test_real_pdf_pages_raises_when_pdftotext_fails(monkeypatch, tmp_path):
    monkeypatch.setattr(textindex.fetch, "download", lambda url, dest: open(dest, "wb").write(b"%PDF-enc"))
    def boom(*a, **k): raise subprocess.CalledProcessError(1, "pdftotext")
    monkeypatch.setattr(textindex.subprocess, "run", boom)
    with pytest.raises(subprocess.CalledProcessError):
        textindex.pdf_pages("https://cdn/enc.pdf", str(tmp_path))
    assert not (tmp_path / "src.pdf").exists()                     # temp file cleaned up

def test_dry_run_writes_nothing(world):
    world["rows"] = [_row("P1")]
    world["failed"] = [{"record_id": "OLD", "chunks": 3}]
    assert run("--dry-run") == 0
    assert world["embedded"] == world["upserted"] == world["deleted"] == world["applied"] == world["executed"] == []

def test_failed_rows_are_cleaned_up_before_retry(world):
    world["failed"] = [{"record_id": "OLD", "chunks": 3}]
    assert run() == 0
    assert world["deleted"] == [chunking.vector_id("OLD", i) for i in range(3)]
    assert "DELETE FROM text_index WHERE status='failed';" in world["executed"]
    assert "DELETE FROM ask_cache;" not in world["executed"]       # nothing new indexed

def test_limit_and_periodic_flush(world):
    world["rows"] = [_row(f"R{i}", kind="image", url=None) for i in range(30)]
    assert run("--limit", "27") == 0
    assert len(world["applied"]) == 2                              # 25 + 2
    assert sum(s.count("INSERT OR REPLACE INTO text_index") for s in world["applied"]) == 27

def test_ocrd_rows_read_their_r2_text(world):
    world["rows"] = [dict(_row("P1"), ocr=1), dict(_row("P2"), ocr=0)]
    assert run() == 0
    assert world["ocr_ids"] == ["P1", None]

def test_select_flags_records_with_an_ocr_marker():
    assert "record_ocr" in textindex.SELECT and "AS ocr" in textindex.SELECT

def test_pdf_pages_with_ocr_id_reads_percent_encoded_r2_json(monkeypatch, tmp_path):
    seen = []
    def download(url, dest):
        seen.append(url)
        with open(dest, "w", encoding="utf-8") as f:
            json.dump([{"n": 1, "text": "one", "src": "pdf"}, {"n": 2, "text": "", "src": "ocr", "conf": 0.0}], f)
    monkeypatch.setattr(textindex.fetch, "download", download)
    assert textindex.pdf_pages("https://cdn/x.pdf", str(tmp_path), "O'Hare 1.pdf") == ["one", ""]
    assert seen == ["https://assets.realufo.org/text/O%27Hare%201.pdf.json"]
