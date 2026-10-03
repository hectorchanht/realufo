import json, sqlite3, pytest
from ingest import ocr

CLEAN = " ".join(f"The witness reported a bright object over the runway at {i} hours." for i in range(30))
GARBLED = "~~ |; .,' -- ~ ;; |' ., ~" * 40

def test_lines_from_boxes_orders_top_to_bottom_then_left_to_right():
    items = [("world", (100, 10, 160, 30)), ("Next", (10, 50, 60, 70)), ("Hello", (10, 12, 80, 32))]
    assert ocr.lines_from_boxes(items) == "Hello world\nNext"

def test_lines_from_boxes_empty_page_is_empty_string():
    assert ocr.lines_from_boxes([]) == ""

def test_route_pages_keeps_clean_text_layer_and_ocrs_the_rest():
    calls = []
    def fake(n):
        calls.append(n)
        return f"ocr text {n}", 0.912
    pages = ocr.route_pages([CLEAN, GARBLED], 2, fake)
    assert calls == [2]
    assert pages[0] == {"n": 1, "text": CLEAN, "src": "pdf"}
    assert pages[1] == {"n": 2, "text": "ocr text 2", "src": "ocr", "conf": 0.91}

def test_route_pages_no_text_layer_ocrs_every_page_from_pdfinfo_count():
    pages = ocr.route_pages([], 3, lambda n: ("", 0.0))
    assert [(p["n"], p["src"], p["text"]) for p in pages] == [(1, "ocr", ""), (2, "ocr", ""), (3, "ocr", "")]

def test_route_pages_ocr_error_marks_page_and_keeps_alignment():
    def fake(n):
        if n == 2:
            raise RuntimeError("render failed")
        return "fine", 0.8
    pages = ocr.route_pages([GARBLED, GARBLED, GARBLED], 3, fake)
    assert [p["n"] for p in pages] == [1, 2, 3]
    assert pages[1] == {"n": 2, "text": "", "src": "err"}
    assert pages[2]["src"] == "ocr"

def _db():
    db = sqlite3.connect(":memory:")
    db.executescript("""
      CREATE TABLE record_ocr(record_id TEXT PRIMARY KEY, pages INT, ocr_pages INT, chars INT, engine TEXT, done_at TEXT);
      CREATE TABLE record_text(record_id TEXT PRIMARY KEY, pages TEXT);
      CREATE TABLE text_index(record_id TEXT PRIMARY KEY, status TEXT);
      INSERT INTO record_text VALUES ('O''Hare 1.pdf','[]');
      INSERT INTO text_index VALUES ('O''Hare 1.pdf','indexed');""")
    return db

def test_marker_sql_requeues_when_any_page_was_ocrd_and_escapes_ids():
    db = _db()
    pages = [{"n": 1, "text": "abc", "src": "pdf"}, {"n": 2, "text": "de", "src": "ocr", "conf": 0.9}]
    db.executescript(ocr.marker_sql("O'Hare 1.pdf", pages, "eng"))
    assert db.execute("SELECT pages, ocr_pages, chars, engine FROM record_ocr").fetchall() == [(2, 1, 5, "eng")]
    assert db.execute("SELECT COUNT(*) FROM record_text").fetchone() == (0,)
    assert db.execute("SELECT status FROM text_index").fetchone() == ("failed",)

def test_marker_sql_born_digital_file_writes_marker_only():
    db = _db()
    db.executescript(ocr.marker_sql("O'Hare 1.pdf", [{"n": 1, "text": "abc", "src": "pdf"}], "eng"))
    assert db.execute("SELECT ocr_pages FROM record_ocr").fetchone() == (0,)
    assert db.execute("SELECT COUNT(*) FROM record_text").fetchone() == (1,)
    assert db.execute("SELECT status FROM text_index").fetchone() == ("indexed",)

@pytest.fixture
def world(monkeypatch):
    w = {"rows": [], "applied": [], "put": [], "pdftotext": {}, "pages": {}, "sql": [], "fail_put": set()}
    def d1_json(sql):
        w["sql"].append(sql)
        return w["rows"]
    monkeypatch.setattr(ocr.d1, "_d1_json", d1_json)
    monkeypatch.setattr(ocr.d1, "apply_sql", lambda path: w["applied"].append(open(path, encoding="utf-8").read()))
    monkeypatch.setattr(ocr.fetch, "download", lambda url, dest: open(dest, "wb").write(url.encode()))
    monkeypatch.setattr(ocr, "page_count", lambda pdf: w["pages"].get(open(pdf, "rb").read().decode(), 1))
    monkeypatch.setattr(ocr, "pdftotext_pages", lambda pdf: w["pdftotext"].get(open(pdf, "rb").read().decode(), [CLEAN]))
    monkeypatch.setattr(ocr, "render", lambda pdf, n, dpi, work: f"page{n}.png")
    monkeypatch.setattr(ocr, "paddle_engine", lambda *a: (lambda png: (f"OCR {png}", 0.9)))
    def put(key, path, ctype):
        if key in w["fail_put"]:
            raise RuntimeError("r2 down")
        w["put"].append((key, open(path, encoding="utf-8").read(), ctype))
    monkeypatch.setattr(ocr.r2, "put", put)
    return w

def run(*argv):
    with pytest.raises(SystemExit) as e:
        ocr.main(list(argv))
    return e.value.code

def test_live_run_uploads_all_pages_then_writes_marker(world):
    world["rows"] = [{"id": "A", "url": "https://cdn/a.pdf"}]
    world["pages"]["https://cdn/a.pdf"] = 2
    world["pdftotext"]["https://cdn/a.pdf"] = [CLEAN, GARBLED]
    assert run() == 0
    key, body, ctype = world["put"][0]
    assert key == "text/A.json" and ctype.startswith("application/json")
    assert json.loads(body) == [{"n": 1, "text": CLEAN, "src": "pdf"},
                                {"n": 2, "text": "OCR page2.png", "src": "ocr", "conf": 0.9}]
    assert "INSERT OR REPLACE INTO record_ocr" in world["applied"][0]
    assert "DELETE FROM record_text WHERE record_id='A'" in world["applied"][0]

def test_no_text_layer_pdf_is_fully_ocrd(world):
    world["rows"] = [{"id": "S", "url": "https://cdn/s.pdf"}]
    world["pages"]["https://cdn/s.pdf"] = 3
    world["pdftotext"]["https://cdn/s.pdf"] = []
    assert run() == 0
    assert [p["src"] for p in json.loads(world["put"][0][1])] == ["ocr", "ocr", "ocr"]

def test_r2_failure_writes_no_marker_and_run_continues(world):
    world["rows"] = [{"id": "BAD", "url": "https://cdn/b.pdf"}, {"id": "OK", "url": "https://cdn/o.pdf"}]
    world["fail_put"].add("text/BAD.json")
    assert run() == 1
    assert len(world["applied"]) == 1 and "'OK'" in world["applied"][0] and "'BAD'" not in world["applied"][0]

def test_dry_run_writes_nothing(world):
    world["rows"] = [{"id": "A", "url": "https://cdn/a.pdf"}]
    assert run("--dry-run") == 0
    assert world["put"] == [] and world["applied"] == []

def test_ids_filter_is_escaped_into_the_select(world):
    run("--ids", "A,O'Hare")
    assert "r.id IN ('A','O''Hare')" in world["sql"][0]

def test_bench_report_tables_speed_and_readability_per_config():
    samples = [("A", 2, "~~ garbled"), ("B", 1, "")]
    results = {("detM", "recM", 200): [(CLEAN, 1.0), ("", 3.0)],
               ("detS", "recS", 300): [(CLEAN, 4.0), (CLEAN, 6.0)]}
    md = ocr.bench_report(samples, results, "2026-10-03")
    assert "| pdftotext (today) | – | 0/2 |" in md
    assert "| detM + recM @200 | 2.0 | 1/2 |" in md
    assert "| detS + recS @300 | 5.0 | 2/2 |" in md
    assert "## A p.2" in md and "## B p.1" in md

def test_shard_splits_rows_disjointly_by_id(world):
    ids = [f"R{i}" for i in range(20)]
    seen = []
    for shard in ("0/3", "1/3", "2/3"):
        world["rows"] = [{"id": i, "url": f"https://cdn/{i}.pdf"} for i in ids]
        world["put"].clear()
        run("--shard", shard)
        seen.append({k[5:-5] for k, _, _ in world["put"]})
    assert set().union(*seen) == set(ids)
    assert sum(len(s) for s in seen) == len(ids)
    assert all(seen)
