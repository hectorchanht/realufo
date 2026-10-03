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
