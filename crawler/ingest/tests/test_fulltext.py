import json, pathlib, sqlite3, pytest
from ingest import fulltext

FIX = pathlib.Path(__file__).parent / "fixtures"
CLEAN = " ".join(f"The witness reported a bright object over the runway at {i} hours." for i in range(30))

def test_word_ratio_separates_garbled_from_noisy_but_readable_ocr():
    garbled = (FIX / "ocr-1946-p3.txt").read_text(encoding="utf-8")
    readable = (FIX / "ocr-1946-p20.txt").read_text(encoding="utf-8")
    assert fulltext.word_ratio(garbled) < fulltext.MIN_RATIO
    assert fulltext.word_ratio(readable) >= 0.65
    assert not fulltext.keep_page(fulltext.clean_page(garbled))
    assert fulltext.keep_page(fulltext.clean_page(readable))

def test_keep_page_needs_200_alnum_and_wordy_text():
    assert fulltext.keep_page(CLEAN)
    assert not fulltext.keep_page("The object was seen.")        # too short
    assert not fulltext.keep_page(".,;' -- ~~ |\n" * 80)          # noise

def test_clean_page_collapses_spaces_and_blank_runs():
    assert fulltext.clean_page("  a   b \n\n\n\n c\t\td  ") == "a b\n\nc d"

def test_select_pages_keeps_pdf_page_numbers_and_skips_noise():
    kept, truncated = fulltext.select_pages(["~~ |", CLEAN, "", CLEAN + " end."])
    assert [p["n"] for p in kept] == [2, 4]
    assert truncated is False

def test_select_pages_caps_at_a_line_break_and_flags_truncation():
    page = "\n".join(f"Line {i}: the radar operator logged another contact near the base." for i in range(100))
    kept, truncated = fulltext.select_pages([page, page], cap=5000)
    assert truncated is True
    assert [p["n"] for p in kept] == [1]
    assert len(kept[0]["text"]) <= 5000
    assert kept[0]["text"].endswith("base.")

def test_select_pages_drops_a_tail_cut_too_short_to_read():
    kept, truncated = fulltext.select_pages([CLEAN, CLEAN], cap=len(CLEAN) + 50)
    assert [p["n"] for p in kept] == [1]
    assert truncated is True

def test_select_pages_all_noise_is_empty_not_truncated():
    assert fulltext.select_pages(["", ".,;' --" * 50]) == ([], False)

def test_row_sql_escapes_quotes_and_stores_json():
    sql = fulltext.row_sql("ID'1", [{"n": 2, "text": "O'Hare — “disc”"}], True, 9)
    assert sql.startswith("INSERT OR REPLACE INTO record_text(record_id,pages,truncated,total_pages) VALUES('ID''1',")
    assert "O''Hare — “disc”" in sql
    assert sql.endswith(",1,9);")
    assert fulltext.row_sql("X", [], False, 3).endswith("'X','[]',0,3);")

def test_row_sql_round_trips_through_sqlite():
    pages = [{"n": 1, "text": "it's; DROP TABLE x; --\nline two \u0007 🛸 “q”"}]
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE record_text(record_id TEXT PRIMARY KEY, pages TEXT, truncated INT, total_pages INT)")
    db.executescript(fulltext.row_sql("R'1", pages, False, 4))
    rid, stored, trunc, total = db.execute("SELECT * FROM record_text").fetchone()
    assert (rid, json.loads(stored), trunc, total) == ("R'1", pages, 0, 4)

def test_row_sql_stays_under_d1_statement_limit():
    # multibyte punctuation (— “ ”) so bytes > chars; ~24k chars per page, 50 pages
    huge = ["\n".join(f"Line {i}: the object was bright — “very” fast; seen at {i} h." for i in range(400))] * 50
    kept, truncated = fulltext.select_pages(huge)
    assert truncated is True
    assert len(fulltext.row_sql("BIG", kept, truncated, 50).encode("utf-8")) < 100_000

@pytest.fixture
def world(monkeypatch):
    w = {"rows": [], "applied": [], "pages": {}}
    monkeypatch.setattr(fulltext.d1, "_d1_json", lambda sql: w["rows"])
    monkeypatch.setattr(fulltext.d1, "apply_sql", lambda path: w["applied"].append(open(path, encoding="utf-8").read()))
    def pdf_pages(url, work, ocr_id=None):
        w.setdefault("ocr_ids", []).append(ocr_id)
        p = w["pages"].get(url, [CLEAN])
        if isinstance(p, Exception):
            raise p
        return p
    monkeypatch.setattr(fulltext, "pdf_pages", pdf_pages)
    return w

def run(*argv):
    with pytest.raises(SystemExit) as e:
        fulltext.main(list(argv))
    return e.value.code

def test_live_run_writes_one_row_per_record_including_empty(world):
    world["rows"] = [{"id": "P1", "url": "u1"}, {"id": "P2", "url": "u2"}]
    world["pages"]["u2"] = ["~~ |"]
    assert run() == 0
    sql = "".join(world["applied"])
    assert "VALUES('P1','[{\"n\": 1, \"text\": \"The witness" in sql
    assert "VALUES('P2','[]',0,1);" in sql

def test_failed_download_gets_no_row_and_exit_code_1(world):
    world["rows"] = [{"id": "P1", "url": "u1"}, {"id": "P3", "url": "u3"}]
    world["pages"]["u3"] = RuntimeError("404")
    assert run() == 1
    sql = "".join(world["applied"])
    assert "'P1'" in sql and "'P3'" not in sql

def test_dry_run_writes_nothing(world):
    world["rows"] = [{"id": "P1", "url": "u1"}]
    assert run("--dry-run") == 0
    assert world["applied"] == []

def test_all_caps_teletype_counts_as_words():
    tty = " ".join(
        "URGENT FROM COMMANDER AIR DEFENSE COMMAND TO FBI WASHINGTON. UNIDENTIFIED OBJECT SIGHTED "
        f"OVER BASE AT {i} HOURS, ROUND, SILVER, NO SOUND. REQUEST INSTRUCTIONS." for i in range(6)
    )
    assert fulltext.word_ratio(tty) >= 0.9
    assert fulltext.keep_page(tty)

def test_ocrd_rows_read_their_r2_text(world):
    world["rows"] = [{"id": "A", "url": "https://cdn/a.pdf", "ocr": 1}, {"id": "B", "url": "https://cdn/b.pdf", "ocr": 0}]
    run()
    assert world["ocr_ids"] == ["A", None]
    assert "record_ocr" in fulltext.SELECT
