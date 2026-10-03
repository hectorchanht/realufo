# Re-OCR Scanned PDFs with PaddleOCR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every live PDF a real, uncapped, per-page full text (pdftotext where the text layer is clean, PaddleOCR PP-OCRv5 where it is garbled or missing) in R2 `text/<id>.json`, and rebuild the doc-page text, FTS, AI summaries, TL;DRs and the Ask index from it.

**Architecture:** New crawler job `crawler/ingest/ocr.py` routes each page (clean text layer → keep; else render with pdftoppm → PaddleOCR), uploads all pages to R2, then writes a D1 `record_ocr` marker plus requeue SQL (delete `record_text` row, mark `text_index` failed) so the existing `fulltext` / `summaries` / `tldr` / `cards` / `textindex` jobs rebuild that record. `textindex.pdf_pages` gains an `ocr_id` argument that reads the R2 file, so every consumer sees the same pages.

**Tech Stack:** Python 3.12 venv (`uv`) with `paddlepaddle` + `paddleocr` 3.x (CPU), poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), wrangler (R2 + D1), pytest, vitest (worker schema test), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-paddleocr-reocr-design.md`

## Global Constraints

- OCR engine is **PaddleOCR**, pipeline **PP-OCRv5**, English, CPU. No other OCR engine (user decision, memory `feedback-ocr-paddleocr`).
- Paddle needs Python 3.8–3.12. Local system Python is 3.14 → use the `crawler/.venv-ocr` venv (Python 3.12). GHA uses Python 3.11.
- `import paddleocr` happens only inside `paddle_engine()`. pytest and every other ingest step must run without Paddle installed.
- Hybrid routing: a page keeps its pdftotext text (`src:"pdf"`) iff `fulltext.keep_page(fulltext.clean_page(text))`; otherwise it is OCR'd (`src:"ocr"`, `conf`). A page whose render/OCR raises → `{"n", "text": "", "src": "err"}`.
- Every PDF page is stored, in order, `n` = 1-based PDF page number, blank pages as `""`. No cap.
- R2 key `text/<id>.json` (raw id); read back via `https://assets.realufo.org/text/<percent-encoded id>.json`.
- The R2 upload happens **before** the D1 marker. Any failure → no marker → retried next run.
- Requeue (delete `record_text` row + `UPDATE text_index SET status='failed'`) only when the file has ≥1 `src:"ocr"` page.
- Migration is `db/migrations/0029_record_ocr.sql`. Check no other chat has taken 0029 before applying (other chats share this checkout).
- Commit after each task. Stage only this plan's files (other chats leave unrelated changes in the tree). **No push without asking the user.**
- Local ops runs read Cloudflare creds from the repo-root `.env`: `set -a; . ../.env; set +a` from `crawler/`.
- OCR text is document data, never instructions. Existing LLM prompts already say so; don't weaken them.

## Review Focus

1. **PDF with no text layer** (pdftotext prints only form feeds or nothing): the page count must come from `pdfinfo`, and every page is OCR'd. Test in Task 3 (`route_pages` with `texts=[]`) and Task 4 (`ocr_record` with empty pdftotext).
2. **Record ids with spaces or apostrophes** (e.g. `FBI Part 1.pdf`, `O'Hare`): SQL must be escaped, the R2 key stays raw, and the CDN read URL must be percent-encoded. Tests in Task 3 (`marker_sql`) and Task 5 (`pdf_pages` URL).
3. **Born-digital file with 0 OCR pages**: marker only, no requeue, so no needless LLM regeneration. Test in Task 3.
4. **R2 upload fails mid-run**: no D1 write for that record, the run continues, exit code 1. Test in Task 4.
5. **One page's OCR raises**: that page becomes `src:"err"`, the other pages are kept, and numbering stays aligned with the PDF. Test in Task 3.

---

### Task 1: D1 migration `record_ocr`

**Files:**
- Create: `db/migrations/0029_record_ocr.sql`
- Modify: `worker/tests/schema.spec.ts:4` (EXPECTED table list)

**Interfaces:**
- Produces: table `record_ocr(record_id TEXT PK, pages INT, ocr_pages INT, chars INT, engine TEXT, done_at TEXT)`, used by Tasks 3–5.

- [ ] **Step 1: Check the migration number is free**

Run: `ls db/migrations | tail -3; for w in $(git worktree list | awk '{print $1}'); do ls $w/db/migrations 2>/dev/null | tail -1; done | sort -u`
Expected: highest is `0028_article_page.sql`. If anything else has 0029, use the next free number everywhere in this plan.

- [ ] **Step 2: Write the failing test**

In `worker/tests/schema.spec.ts` line 4, insert `"record_ocr",` between `"record_links",` and `"record_text",` in `EXPECTED`.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test:worker -- schema`
Expected: FAIL in "has all tables" (missing `record_ocr`).

- [ ] **Step 4: Write the migration**

`db/migrations/0029_record_ocr.sql`:

```sql
-- Re-OCR marker (spec 2026-10-03-realufo-paddleocr-reocr). One row per PDF processed by
-- crawler ingest.ocr, written AFTER its full text was uploaded to R2 text/<id>.json.
-- Rows here make ingest.fulltext / ingest.textindex read that R2 file instead of pdftotext.
-- Rollback for a record: delete its row here and requeue it (see the spec).
CREATE TABLE record_ocr (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  pages     INTEGER NOT NULL,   -- total pages in the PDF
  ocr_pages INTEGER NOT NULL,   -- pages with src='ocr'
  chars     INTEGER NOT NULL,   -- total chars across all pages
  engine    TEXT NOT NULL,      -- e.g. 'PP-OCRv5:PP-OCRv5_server_det+en_PP-OCRv5_mobile_rec@200'
  done_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 5: Run tests and apply locally**

Run: `pnpm test:worker -- schema && pnpm db:migrate:local`
Expected: PASS; local apply lists `0029_record_ocr.sql`.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0029_record_ocr.sql worker/tests/schema.spec.ts
git commit -m "feat(db): record_ocr marker table for PaddleOCR re-OCR"
```

---

### Task 2: OCR venv, Paddle API probe, pinned requirements

**Files:**
- Create: `crawler/ingest/requirements-ocr.txt`
- Modify: `.gitignore` (add `crawler/.venv-ocr/`)

**Interfaces:**
- Produces: a working `crawler/.venv-ocr` (Python 3.12, `requirements.txt` + Paddle + pytest). Confirmed PaddleOCR 3.x result keys `rec_texts`, `rec_scores`, `rec_boxes`, confirmed model names, and the model cache dir. Task 4's `paddle_engine` relies on these facts.

- [ ] **Step 1: Create the venv**

```bash
cd crawler
uv venv --python 3.12 .venv-ocr
uv pip install --python .venv-ocr/bin/python -r ingest/requirements.txt paddlepaddle paddleocr pytest
echo "crawler/.venv-ocr/" >> ../.gitignore
```

Expected: installs without error (macOS arm64 wheels exist for py3.12).

- [ ] **Step 2: Get one garbled sample page**

```bash
set -a; . ../.env; set +a
wrangler d1 execute realufo-db --remote --json --command "SELECT rt.record_id, (SELECT cdn_url FROM assets a WHERE a.record_id=rt.record_id AND a.role='full') url FROM record_text rt WHERE rt.pages='[]' ORDER BY rt.total_pages LIMIT 3"
```

Download the first URL to `/tmp/probe.pdf` (`curl -sSL -o /tmp/probe.pdf "<url>"`; percent-encode spaces), then `pdftoppm -r 200 -f 1 -l 1 -png -singlefile /tmp/probe.pdf /tmp/probe`.

- [ ] **Step 3: Probe the API**

```bash
.venv-ocr/bin/python - <<'EOF'
from paddleocr import PaddleOCR
ocr = PaddleOCR(text_detection_model_name="PP-OCRv5_server_det",
                text_recognition_model_name="en_PP-OCRv5_mobile_rec",
                use_doc_orientation_classify=True, use_doc_unwarping=False,
                use_textline_orientation=False, text_rec_score_thresh=0.5)
r = ocr.predict("/tmp/probe.png")[0]
print(sorted(r.keys()))
print(r["rec_texts"][:5], list(r["rec_scores"][:5]), [list(b) for b in r["rec_boxes"][:2]])
EOF
ls ~/.paddlex/official_models
```

Expected: keys include `rec_texts`, `rec_scores`, `rec_boxes` (boxes `[x1,y1,x2,y2]`), and the text reads like English. Models are cached under `~/.paddlex/official_models`.
If a model name is rejected, also try `PP-OCRv5_mobile_det` / `PP-OCRv5_server_rec` and record which names load. If the result keys differ, record the real names. **Use the confirmed names in Task 4's `paddle_engine` and Task 6's `BENCH`, and the confirmed cache dir in Task 9.**

- [ ] **Step 4: Pin the versions**

```bash
uv pip freeze --python .venv-ocr/bin/python | grep -iE '^(paddlepaddle|paddleocr)==' > ingest/requirements-ocr.txt
cat ingest/requirements-ocr.txt
```

Expected: two lines, e.g. `paddleocr==3.7.0` and `paddlepaddle==3.x.y`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore crawler/ingest/requirements-ocr.txt
git commit -m "chore(ocr): pin PaddleOCR deps for the re-OCR job"
```

---

### Task 3: `ocr.py` pure helpers — line ordering, page routing, marker SQL

**Files:**
- Create: `crawler/ingest/ocr.py`
- Test: `crawler/ingest/tests/test_ocr.py`

**Interfaces:**
- Consumes: `fulltext.clean_page(str) -> str`, `fulltext.keep_page(str) -> bool`, `d1.sql_q(v) -> str`.
- Produces:
  - `lines_from_boxes(items: list[tuple[str, tuple[float, float, float, float]]]) -> str`
  - `route_pages(texts: list[str], page_count: int, ocr_page: Callable[[int], tuple[str, float]]) -> list[dict]`
  - `marker_sql(rid: str, pages: list[dict], engine: str) -> str`

- [ ] **Step 1: Write the failing tests**

`crawler/ingest/tests/test_ocr.py`:

```python
import sqlite3, pytest
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd crawler && python3 -m pytest ingest/tests/test_ocr.py -q`
Expected: FAIL — `ImportError: cannot import name 'ocr'`.

- [ ] **Step 3: Write the helpers**

`crawler/ingest/ocr.py`:

```python
"""Re-OCR scanned PDF pages with PaddleOCR (spec 2026-10-03-realufo-paddleocr-reocr-design).

    python -m ingest.ocr --dry-run --limit 3      # OCR + print stats, no writes
    python -m ingest.ocr --ids A,B                # only these records
    python -m ingest.ocr                          # every live PDF without a record_ocr row

Pages whose pdftotext layer already reads as text keep it (src "pdf"); the rest
are rendered with pdftoppm and OCR'd (src "ocr"). All pages, uncapped, go to R2
text/<id>.json, then D1 gets a record_ocr marker. When any page was OCR'd, the
record's record_text row is deleted and its text_index row marked failed, so
fulltext / summaries / tldr / cards / textindex rebuild it from the new text.
Needs Paddle (crawler/.venv-ocr or requirements-ocr.txt); nothing else does.
"""
from . import d1
from .fulltext import clean_page, keep_page

def lines_from_boxes(items) -> str:
    """[(text, (x1, y1, x2, y2))] -> lines top-to-bottom, boxes left-to-right in a line."""
    lines = []  # [y_center, height, [(x1, text)]]
    for text, (x1, y1, x2, y2) in sorted(items, key=lambda it: (it[1][1] + it[1][3]) / 2):
        yc, h = (y1 + y2) / 2, y2 - y1
        if lines and abs(yc - lines[-1][0]) <= max(h, lines[-1][1]) / 2:
            lines[-1][2].append((x1, text))
        else:
            lines.append([yc, h, [(x1, text)]])
    return "\n".join(" ".join(t for _, t in sorted(words)) for _, _, words in lines)

def route_pages(texts: list[str], page_count: int, ocr_page) -> list[dict]:
    """Pages 1..page_count: clean text layer kept, else ocr_page(n) -> (text, conf)."""
    out = []
    for n in range(1, page_count + 1):
        text = clean_page(texts[n - 1]) if n <= len(texts) else ""
        if keep_page(text):
            out.append({"n": n, "text": text, "src": "pdf"})
            continue
        try:
            t, conf = ocr_page(n)
            out.append({"n": n, "text": t, "src": "ocr", "conf": round(conf, 2)})
        except Exception as e:
            print(f"  page {n}: {e}", flush=True)
            out.append({"n": n, "text": "", "src": "err"})
    return out

def marker_sql(rid: str, pages: list[dict], engine: str) -> str:
    q = d1.sql_q(rid)
    ocr_pages = sum(p["src"] == "ocr" for p in pages)
    chars = sum(len(p["text"]) for p in pages)
    sql = [f"INSERT OR REPLACE INTO record_ocr(record_id,pages,ocr_pages,chars,engine) "
           f"VALUES({q},{len(pages)},{ocr_pages},{chars},{d1.sql_q(engine)});"]
    if ocr_pages:  # text changed: rebuild record_text (+FTS, summary, TL;DR) and the Ask vectors
        sql += [f"DELETE FROM record_text WHERE record_id={q};",
                f"UPDATE text_index SET status='failed' WHERE record_id={q};"]
    return "\n".join(sql) + "\n"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/test_ocr.py -q`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add crawler/ingest/ocr.py crawler/ingest/tests/test_ocr.py
git commit -m "feat(ocr): page routing, box->line ordering, record_ocr marker SQL"
```

---

### Task 4: `ocr.py` I/O + CLI — download, render, PaddleOCR, R2 upload, D1 marker

**Files:**
- Modify: `crawler/ingest/ocr.py`
- Test: `crawler/ingest/tests/test_ocr.py`

**Interfaces:**
- Consumes: Task 3 helpers; `fetch.download(url, dest)`; `r2.put(key, path, content_type)`; `d1._d1_json(sql) -> list[dict]`; `d1.apply_sql(path)`; `chunking.split_pages(str) -> list[str]`. PaddleOCR names/keys confirmed in Task 2.
- Produces:
  - constants `DET`, `REC`, `DPI`, `SCORE_MIN`, `ENGINE`
  - `page_count(pdf: str) -> int`, `pdftotext_pages(pdf: str) -> list[str]`, `render(pdf: str, n: int, dpi: int, work: str) -> str` (PNG path)
  - `paddle_engine(det: str = DET, rec: str = REC) -> Callable[[str], tuple[str, float]]`
  - `ocr_record(row: dict, engine, work: str, dpi: int = DPI) -> list[dict]`
  - `put_text(rid: str, pages: list[dict], work: str) -> None`
  - `main(argv=None)` with `--dry-run`, `--limit`, `--ids`. Task 6 adds `--bench`.

- [ ] **Step 1: Write the failing tests** (append to `test_ocr.py`)

```python
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
```

Also add `import json` to the test file's first line: `import json, sqlite3, pytest`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd crawler && python3 -m pytest ingest/tests/test_ocr.py -q`
Expected: the 5 new tests FAIL (`AttributeError: module 'ingest.ocr' has no attribute 'fetch'` / `main`).

- [ ] **Step 3: Implement**

Change the imports at the top of `ocr.py` to:

```python
import argparse, json, os, re, subprocess, sys, tempfile, time
from . import d1, fetch, r2
from .chunking import split_pages
from .fulltext import clean_page, keep_page
```

Add after the imports. Use the model names confirmed in Task 2; Task 6 may change `DET`/`REC`/`DPI`:

```python
SELECT = """SELECT r.id,
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url
FROM records r LEFT JOIN record_ocr o ON o.record_id=r.id
WHERE r.status='live' AND r.kind='pdf' AND o.record_id IS NULL
  AND EXISTS (SELECT 1 FROM assets a WHERE a.record_id=r.id AND a.role='full'){ids}
ORDER BY r.created_at DESC, r.id"""
DET, REC, DPI = "PP-OCRv5_server_det", "en_PP-OCRv5_mobile_rec", 200  # picked by the benchmark
SCORE_MIN = 0.5  # Paddle drops boxes recognised below this, so garbage never becomes text
ENGINE = f"PP-OCRv5:{DET}+{REC}@{DPI}"
```

Add after `marker_sql`:

```python
def page_count(pdf: str) -> int:
    out = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, check=True).stdout
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    if not m:
        raise RuntimeError("pdfinfo: no page count")
    return int(m.group(1))

def pdftotext_pages(pdf: str) -> list[str]:
    out = subprocess.run(["pdftotext", "-enc", "UTF-8", pdf, "-"],
                         capture_output=True, text=True, check=True).stdout
    return split_pages(out)

def render(pdf: str, n: int, dpi: int, work: str) -> str:
    base = os.path.join(work, "page")
    subprocess.run(["pdftoppm", "-r", str(dpi), "-f", str(n), "-l", str(n), "-png", "-singlefile", pdf, base],
                   capture_output=True, check=True)
    return base + ".png"

def paddle_engine(det: str = DET, rec: str = REC):
    from paddleocr import PaddleOCR  # lazy: only the OCR venv / GHA ocr step installs Paddle
    model = PaddleOCR(text_detection_model_name=det, text_recognition_model_name=rec,
                      use_doc_orientation_classify=True, use_doc_unwarping=False,
                      use_textline_orientation=False, text_rec_score_thresh=SCORE_MIN)
    def run(png: str) -> tuple[str, float]:
        r = model.predict(png)[0]
        scores = [float(s) for s in r["rec_scores"]]
        items = [(t, tuple(float(v) for v in b)) for t, b in zip(r["rec_texts"], r["rec_boxes"])]
        return lines_from_boxes(items), (sum(scores) / len(scores) if scores else 0.0)
    return run

def ocr_record(row: dict, engine, work: str, dpi: int = DPI) -> list[dict]:
    pdf = os.path.join(work, "src.pdf")
    fetch.download(row["url"], pdf)
    try:
        return route_pages(pdftotext_pages(pdf), page_count(pdf),
                           lambda n: engine(render(pdf, n, dpi, work)))
    finally:
        os.remove(pdf)

def put_text(rid: str, pages: list[dict], work: str) -> None:
    path = os.path.join(work, "text.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    r2.put(f"text/{rid}.json", path, "application/json; charset=utf-8")

def select_rows(ids: list[str], limit):
    where = f" AND r.id IN ({','.join(d1.sql_q(i) for i in ids)})" if ids else ""
    return d1._d1_json(" ".join(SELECT.format(ids=where).split()))[:limit]

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="OCR + print stats; no R2/D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max records this run")
    ap.add_argument("--ids", default=None, help="comma-separated record ids")
    args = ap.parse_args(argv)
    rows = select_rows([i for i in (args.ids or "").split(",") if i], args.limit)
    engine = paddle_engine() if rows else None
    ok = failed = 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            t0 = time.time()
            try:
                pages = ocr_record(row, engine, work)
                if not args.dry_run:
                    put_text(row["id"], pages, work)  # before the marker: a crash in between means a retry
                    path = os.path.join(work, "ocr.sql")
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(marker_sql(row["id"], pages, ENGINE))
                    d1.apply_sql(path)
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['id']}: {e}", flush=True)
                continue
            ok += 1
            print(f"[{i}/{len(rows)}] ok   {row['id']} pages={len(pages)} "
                  f"ocr={sum(p['src'] == 'ocr' for p in pages)} err={sum(p['src'] == 'err' for p in pages)} "
                  f"chars={sum(len(p['text']) for p in pages)} {time.time() - t0:.0f}s", flush=True)
    print(f"{'dry-run ' if args.dry_run else ''}ocr ok={ok} failed={failed}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/test_ocr.py -q`
Expected: 12 passed.

- [ ] **Step 5: Real smoke on one page (OCR venv, dry run)**

```bash
cd crawler && set -a; . ../.env; set +a
.venv-ocr/bin/python -m ingest.ocr --dry-run --ids "<a no-text record id from Task 2 step 2>"
```

Expected: `ok … ocr=N` with chars > 0. This fails until Task 1's migration is on remote D1, because the SELECT joins `record_ocr`. If it isn't applied yet, apply it now (Task 7 step 1 commands) or skip this step until Task 7.

- [ ] **Step 6: Commit**

```bash
git add crawler/ingest/ocr.py crawler/ingest/tests/test_ocr.py
git commit -m "feat(ocr): ingest.ocr job — PaddleOCR failing pages, all pages to R2, D1 marker + requeue"
```

---

### Task 5: Consumers read the OCR'd text — `pdf_pages(…, ocr_id)` in textindex + fulltext

**Files:**
- Modify: `crawler/ingest/textindex.py` (imports, `SELECT`, `pdf_pages`, call site in `main`)
- Modify: `crawler/ingest/fulltext.py` (`SELECT`, call site in `main`)
- Test: `crawler/ingest/tests/test_textindex.py`, `crawler/ingest/tests/test_fulltext.py`

**Interfaces:**
- Consumes: R2 file layout from Task 4 (`[{n, text, src[, conf]}]`), table `record_ocr` (Task 1).
- Produces: `textindex.TEXT_BASE = "https://assets.realufo.org/text/"`; `textindex.pdf_pages(url: str, work: str, ocr_id: str | None = None) -> list[str]`; both SELECTs return an `ocr` column (0/1).

- [ ] **Step 1: Update the fakes and write the failing tests**

In `test_textindex.py` and `test_fulltext.py`, change each fixture's fake to accept and record the new argument:

```python
    def pdf_pages(url, work, ocr_id=None):
        w.setdefault("ocr_ids", []).append(ocr_id)
        p = w["pages"].get(url, [PAGE])   # test_fulltext.py keeps its own default: [CLEAN]
        if isinstance(p, Exception):
            raise p
        return p
```

Append to `test_textindex.py`:

```python
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
```

(add `json` to `test_textindex.py`'s imports: `import json, subprocess, pytest`.)

Append to `test_fulltext.py`:

```python
def test_ocrd_rows_read_their_r2_text(world):
    world["rows"] = [{"id": "A", "url": "https://cdn/a.pdf", "ocr": 1}, {"id": "B", "url": "https://cdn/b.pdf", "ocr": 0}]
    run()
    assert world["ocr_ids"] == ["A", None]
    assert "record_ocr" in fulltext.SELECT
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd crawler && python3 -m pytest ingest/tests/test_textindex.py ingest/tests/test_fulltext.py -q`
Expected: the 4 new tests FAIL (ocr_ids are all `None` / `SELECT` lacks `record_ocr` / unexpected argument).

- [ ] **Step 3: Implement**

`textindex.py`: change the imports to `import argparse, json, os, subprocess, sys, tempfile, urllib.parse`. In `SELECT`, change the url line to:

```python
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url,
  EXISTS(SELECT 1 FROM record_ocr o WHERE o.record_id=r.id) AS ocr
```

Replace `pdf_pages`:

```python
TEXT_BASE = "https://assets.realufo.org/text/"

def pdf_pages(url: str, work: str, ocr_id: str | None = None) -> list[str]:
    if ocr_id:  # re-OCR'd by ingest.ocr: its R2 file is the canonical per-page text
        path = os.path.join(work, "text.json")
        try:
            fetch.download(TEXT_BASE + urllib.parse.quote(ocr_id, safe="") + ".json", path)
            with open(path, encoding="utf-8") as f:
                return [p["text"] for p in json.load(f)]
        finally:
            if os.path.exists(path):
                os.remove(path)
    pdf = os.path.join(work, "src.pdf")
    try:
        fetch.download(url, pdf)
        out = subprocess.run(["pdftotext", "-enc", "UTF-8", pdf, "-"],
                             capture_output=True, text=True, check=True).stdout
    finally:
        if os.path.exists(pdf):
            os.remove(pdf)
    return chunking.split_pages(out)
```

In `main`, change the call to:

```python
                pages = (pdf_pages(row["url"], work, row["id"] if row.get("ocr") else None)
                         if row["kind"] == "pdf" and row["url"] else [])
```

`fulltext.py`: in `SELECT`, change the url line to:

```python
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url,
  EXISTS(SELECT 1 FROM record_ocr o WHERE o.record_id=r.id) AS ocr
```

and in `main` change `pages = pdf_pages(row["url"], work)` to `pages = pdf_pages(row["url"], work, row["id"] if row.get("ocr") else None)`. Update the module docstring's first paragraph: "download, pdftotext (or the R2 text/<id>.json of a re-OCR'd file, see ingest.ocr), keep the pages…".

- [ ] **Step 4: Run the whole crawler suite**

Run: `cd crawler && python3 -m pytest ingest/tests/ -q`
Expected: all pass. This also proves Paddle isn't needed: system Python has no Paddle.

- [ ] **Step 5: Commit**

```bash
git add crawler/ingest/textindex.py crawler/ingest/fulltext.py crawler/ingest/tests/test_textindex.py crawler/ingest/tests/test_fulltext.py
git commit -m "feat(ocr): fulltext + textindex read the re-OCR'd R2 text when a record_ocr row exists"
```

---

### Task 6: Benchmark mode + run it → **USER GATE**

**Files:**
- Modify: `crawler/ingest/ocr.py` (`BENCH`, `BENCH_DPI`, `bench_report`, `bench`, `--bench` flags)
- Test: `crawler/ingest/tests/test_ocr.py`
- Create (output): `docs/launch/ocr-bench.md`

**Interfaces:**
- Consumes: `select_rows`, `pdftotext_pages`, `page_count`, `render`, `paddle_engine`, `clean_page`, `keep_page`.
- Produces: `bench_report(samples: list[tuple[str, int, str]], results: dict[tuple[str, str, int], list[tuple[str, float]]], today: str) -> str`; CLI `--bench --ids … [--bench-pages N] [--out PATH]`. After the gate: final `DET`, `REC`, `DPI` constants.

- [ ] **Step 1: Write the failing test** (append to `test_ocr.py`)

```python
def test_bench_report_tables_speed_and_readability_per_config():
    samples = [("A", 2, "~~ garbled"), ("B", 1, "")]
    results = {("detM", "recM", 200): [(CLEAN, 1.0), ("", 3.0)],
               ("detS", "recS", 300): [(CLEAN, 4.0), (CLEAN, 6.0)]}
    md = ocr.bench_report(samples, results, "2026-10-03")
    assert "| pdftotext (today) | – | 0/2 |" in md
    assert "| detM + recM @200 | 2.0 | 1/2 |" in md
    assert "| detS + recS @300 | 5.0 | 2/2 |" in md
    assert "## A p.2" in md and "## B p.1" in md
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd crawler && python3 -m pytest ingest/tests/test_ocr.py -q -k bench`
Expected: FAIL — no attribute `bench_report`.

- [ ] **Step 3: Implement**

Add to `ocr.py` (model names as confirmed in Task 2):

```python
BENCH = [("PP-OCRv5_mobile_det", "en_PP-OCRv5_mobile_rec"),
         ("PP-OCRv5_server_det", "en_PP-OCRv5_mobile_rec"),
         ("PP-OCRv5_server_det", "PP-OCRv5_server_rec")]
BENCH_DPI = (200, 300)
SNIP = 400

def _readable(t: str) -> bool:
    return keep_page(clean_page(t))

def bench_report(samples, results, today: str) -> str:
    """samples [(id, page, pdftotext text)]; results {(det, rec, dpi): [(text, secs)] per sample}."""
    n = len(samples)
    rows = [f"| pdftotext (today) | – | {sum(_readable(old) for _, _, old in samples)}/{n} |"]
    for (det, rec, dpi), res in results.items():
        rows.append(f"| {det} + {rec} @{dpi} | {sum(s for _, s in res) / n:.1f} | "
                    f"{sum(_readable(t) for t, _ in res)}/{n} |")
    out = [f"# PaddleOCR benchmark ({today})", "",
           f"{n} pages that fail `keep_page` today, from {len({s[0] for s in samples})} files. "
           "Readable = passes `fulltext.keep_page`.", "",
           "| config | s/page | readable |", "|---|---|---|", *rows, ""]
    for i, (rid, page, old) in enumerate(samples):
        out += [f"## {rid} p.{page}", "", "**pdftotext:**", "```", old[:SNIP], "```"]
        for (det, rec, dpi), res in results.items():
            out += [f"**{det} + {rec} @{dpi}:**", "```", res[i][0][:SNIP], "```"]
        out.append("")
    return "\n".join(out)

def bench(rows, per_file: int, out_path: str) -> None:
    samples, pdfs = [], []
    with tempfile.TemporaryDirectory() as work:
        for k, row in enumerate(rows):
            pdf = os.path.join(work, f"{k}.pdf")
            fetch.download(row["url"], pdf)
            texts, count = pdftotext_pages(pdf), page_count(pdf)
            old = [clean_page(texts[n - 1]) if n <= len(texts) else "" for n in range(1, count + 1)]
            for n in [n for n in range(1, count + 1) if not keep_page(old[n - 1])][:per_file]:
                samples.append((row["id"], n, old[n - 1]))
                pdfs.append(pdf)
        results = {}
        for det, rec in BENCH:
            engine = paddle_engine(det, rec)
            for dpi in BENCH_DPI:
                res = []
                for (rid, n, _), pdf in zip(samples, pdfs):
                    t0 = time.time()
                    text, _ = engine(render(pdf, n, dpi, work))
                    res.append((text, time.time() - t0))
                    print(f"{det}+{rec}@{dpi} {rid} p.{n} {res[-1][1]:.1f}s", flush=True)
                results[(det, rec, dpi)] = res
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(bench_report(samples, results, time.strftime("%Y-%m-%d")))
    print(f"wrote {out_path}")
```

In `main`, add the arguments and dispatch right after `rows = select_rows(...)`:

```python
    ap.add_argument("--bench", action="store_true", help="time model/dpi variants on failing pages of --ids")
    ap.add_argument("--bench-pages", type=int, default=3, help="--bench: failing pages per file")
    ap.add_argument("--out", default="../docs/launch/ocr-bench.md", help="--bench report path")
```

```python
    if args.bench:
        bench(rows, args.bench_pages, args.out)
        sys.exit(0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/test_ocr.py -q`
Expected: 13 passed.

- [ ] **Step 5: Commit the bench code**

```bash
git add crawler/ingest/ocr.py crawler/ingest/tests/test_ocr.py
git commit -m "feat(ocr): --bench mode comparing PP-OCRv5 model tiers and dpi"
```

- [ ] **Step 6: Pick ~8 sample files (about 20 pages)**

Needs the remote migration (Task 7 step 1) applied first, because `select_rows` joins `record_ocr`. Query candidates:

```bash
cd crawler && set -a; . ../.env; set +a
wrangler d1 execute realufo-db --remote --json --command "SELECT r.id, r.archive, r.agency, rt.total_pages, json_array_length(rt.pages) kept FROM record_text rt JOIN records r ON r.id=rt.record_id WHERE rt.total_pages > json_array_length(rt.pages) ORDER BY r.archive, r.agency"
```

Pick a mix by agency/era: 2 of the `kept=0` files (no usable text), 1 old teletype/cable (NARA 1940s–50s), 1 FBI typed memo, 1 faint carbon copy, 1 with handwriting or forms, 1 heavily redacted, 1 with rotated pages (look at the PDFs).

- [ ] **Step 7: Run the benchmark**

```bash
.venv-ocr/bin/python -m ingest.ocr --bench --bench-pages 3 --ids "ID1,ID2,ID3,ID4,ID5,ID6,ID7,ID8"
```

Expected: `wrote ../docs/launch/ocr-bench.md` with a 7-row table (pdftotext + 6 configs).

- [ ] **Step 8: USER GATE — stop and ask**

Send the user `docs/launch/ocr-bench.md` with:
- a 3-line summary: best config by readable/s-page, and estimated backfill time = s/page × (non-`keep_page` pages; estimate as `SUM(total_pages) - SUM(kept pages)` ≈ 18k)
- any page class still unreadable (PaddleOCR-VL candidates)

Ask which config to use. **Do not continue until the user picks.** If the user stops here, the code is still safe: nothing writes until Task 7.

- [ ] **Step 9: Set the chosen config and commit**

Set `DET, REC, DPI` in `ocr.py` to the chosen values. Run `python3 -m pytest ingest/tests/test_ocr.py -q` (expected: pass).

```bash
git add crawler/ingest/ocr.py docs/launch/ocr-bench.md
git commit -m "chore(ocr): benchmark report; use <DET>+<REC>@<DPI>"
```

---

### Task 7: Remote migration + 10-file pilot (ops)

**Files:** none (prod data only)

- [ ] **Step 1: Apply the migration to remote D1**

```bash
cd /Users/laichan/code/tung/realufo-superpower
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler d1 migrations list realufo-db --remote --env-file /dev/null
```

Expected: only `0029_record_ocr.sql` pending. **If other migrations are pending, stop and ask the user** (another chat's rollout). Then:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler d1 migrations apply realufo-db --remote --env-file /dev/null
```

(Can be done before Task 6 step 6; the benchmark needs it.)

- [ ] **Step 2: Ask the user to push before any live OCR**

Live OCR deletes `record_text` rows. If the daily GHA run (06:00 UTC) runs **old** `fulltext` code in between, it rebuilds those rows from garbled pdftotext and the record never gets the OCR text. Ask: "Push tasks 1–6 to origin so the daily GHA run uses the R2-aware fulltext/textindex?" Push only on a yes (`git push`). If no, do the pilot and the backfill chain only in windows that finish before 06:00 UTC.

- [ ] **Step 3: Pilot OCR on 10 garbled files**

Pick 10 ids from the Task 6 step 6 query (not just the bench ones):

```bash
cd crawler && set -a; . ../.env; set +a
.venv-ocr/bin/python -m ingest.ocr --ids "ID1,…,ID10" | tee ../ocr-pilot.log
```

Expected: `ocr ok=10 failed=0`. Verify: `curl -s "https://assets.realufo.org/text/<ID1 percent-encoded>.json" | head -c 600`.

- [ ] **Step 4: Rebuild their consumers**

```bash
.venv-ocr/bin/python -m ingest.fulltext
.venv-ocr/bin/python -m ingest.summaries --ids ID1 … ID10
.venv-ocr/bin/python -m ingest.textindex
.venv-ocr/bin/python -m ingest.tldr --ids ID1 … ID10
.venv-ocr/bin/python -m ingest.cards --ids ID1 … ID10
```

Expected: fulltext `ok=10` (only requeued rows lack `record_text`); textindex shows the 10 re-indexed, plus anything else that was pending.

- [ ] **Step 5: Verify**

- `wrangler d1 execute realufo-db --remote --json --command "SELECT record_id, total_pages, json_array_length(pages) kept, truncated FROM record_text WHERE record_id IN ('ID1',…)"`: `kept` is far higher than before (compare with the Task 6 step 6 output).
- Open 3 doc pages `https://realufo.org/doc/<id>` in the browser pane: the full text section reads as English, and `?p=N` jumps to the right page.
- Ask 2 questions answerable only from the newly readable pages (on realufo.org Ask). The answers cite those files.
- `.venv-ocr/bin/python -m ingest.ask_eval` → recall@8 stays 10/10.

If anything fails: stop, report to the user, roll back those ids (`DELETE FROM record_ocr WHERE record_id IN (…)`, then the same requeue SQL: `DELETE FROM record_text …; UPDATE text_index SET status='failed' …`, then rerun step 4).

---

### Task 8: Full backfill + downstream chain + IndexNow (ops)

**Files:** none (prod data only). Log goes to `ocr-backfill.log` (not committed).

- [ ] **Step 1: Start the backfill in the background**

```bash
cd crawler && set -a; . ../.env; set +a
caffeinate -i .venv-ocr/bin/python -m ingest.ocr > ../ocr-backfill.log 2>&1
```

Run via Bash `run_in_background`. It resumes on rerun (records with a marker are skipped). Watch with `tail -3 ../ocr-backfill.log`. Expected end: `ocr ok=~419 failed=0` (the 429 PDFs minus the 10 pilots). Rerun once to retry any `FAIL` lines.

- [ ] **Step 2: Rebuild every requeued record**

```bash
.venv-ocr/bin/python -m ingest.fulltext
.venv-ocr/bin/python -m ingest.summaries
.venv-ocr/bin/python -m ingest.textindex
.venv-ocr/bin/python -m ingest.tldr
.venv-ocr/bin/python -m ingest.cards
```

Expected: each ends with `failed=0` (rerun any that don't).

- [ ] **Step 3: Verify coverage**

```bash
wrangler d1 execute realufo-db --remote --json --command "SELECT COUNT(*) files, SUM(ocr_pages) ocr_pages, SUM(chars) chars FROM record_ocr"
wrangler d1 execute realufo-db --remote --json --command "SELECT SUM(pages='[]') empty, SUM(json_array_length(pages)) kept_pages FROM record_text"
.venv-ocr/bin/python -m ingest.ask_eval
```

Expected: `files` = live PDF count. `empty` well below 97 and `kept_pages` well above 2,884 (the 30k cap still applies until Spec 2). ask_eval 10/10.

- [ ] **Step 3b: OCR-only golden questions (added 2026-10-03, user request)**

Append 10 questions to `crawler/ingest/data/ask_golden.json`, each answerable ONLY from pages that were garbled/empty before and are now OCR'd (`src:"ocr"` in R2 `text/<id>.json`), spread over agencies/eras (e.g. NASA-UAP-D004 Apollo 11 debrief, FBI-UAP-D013 1952 Seattle, CIA-UAP-005 Ludwig, Blue Book incident summaries, DOW 1948 reports). Format `{"q": "...", "expect": ["<record id>"]}`. Verify each answer by reading the cited page. Run `.venv-ocr/bin/python -m ingest.ask_eval`: report recall on the 10 new ones separately; target ≥ 8/10. Commit the golden file.

- [ ] **Step 4: IndexNow for changed doc pages**

```bash
cd .. && wrangler d1 execute realufo-db --remote --json --command "SELECT record_id FROM record_ocr WHERE ocr_pages > 0" \
  | python3 -c "import json,sys,urllib.parse; d=sys.stdin.read(); print('\n'.join('https://realufo.org/doc/'+urllib.parse.quote(r['record_id']) for r in json.loads(d[d.index('['):])[0]['results']))" > /tmp/ocr-urls.txt
cd crawler && xargs python3 indexnow.py < /tmp/ocr-urls.txt
```

Expected: indexnow reports submitted URLs (it takes `urls` positionally).

- [ ] **Step 5: Report** coverage numbers, cost note (Workers AI usage for summaries/tldr), and any files still failing.

---

### Task 9: Daily GHA step for new PDFs + README

**Files:**
- Modify: `.github/workflows/ingest.yml` (new cache + `ocr` step immediately before the `# Doc-page full text` comment / `fulltext` step)
- Modify: `crawler/ingest/README.md` (new section)

Do this **only after Task 8 is complete**. Otherwise the first scheduled run OCRs the whole archive on a GHA runner.

- [ ] **Step 1: Add the workflow step**

Insert before the `# Doc-page full text: …` comment:

```yaml
      # Re-OCR scanned pages of new PDFs with PaddleOCR (ingest.ocr, spec 2026-10-03-realufo-paddleocr-reocr);
      # before fulltext so their doc text comes from the OCR'd R2 file
      - uses: actions/cache@v4
        if: ${{ !cancelled() }}
        with:
          path: ~/.paddlex
          key: paddlex-${{ hashFiles('crawler/ingest/requirements-ocr.txt') }}
      - name: ocr
        if: ${{ !cancelled() }}
        working-directory: crawler
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          LIVE: ${{ github.event_name == 'schedule' || github.event.inputs.dry_run == 'false' }}
        run: |
          set -o pipefail
          pip install -q -r ingest/requirements-ocr.txt
          if [ "$LIVE" = "true" ]; then
            python -m ingest.ocr | tee -a ingest-summary.txt
          else
            python -m ingest.ocr --dry-run --limit 1 | tee -a ingest-summary.txt
          fi
```

Use the cache dir confirmed in Task 2 if it is not `~/.paddlex`.

- [ ] **Step 2: README section** (append to `crawler/ingest/README.md`)

```markdown
## Re-OCR (`ingest.ocr`)
Runs before fulltext. For each live PDF without a `record_ocr` row: pages whose
pdftotext layer reads as text keep it, the rest are OCR'd with PaddleOCR PP-OCRv5;
all pages go to R2 `text/<id>.json`, then D1 `record_ocr` (+ requeue of
record_text / text_index when anything was OCR'd). fulltext and textindex read
that R2 file for records with a marker.
Paddle needs Python ≤3.12 — locally use the venv:
`cd crawler && uv venv --python 3.12 .venv-ocr && uv pip install --python .venv-ocr/bin/python -r ingest/requirements.txt -r ingest/requirements-ocr.txt`
then `.venv-ocr/bin/python -m ingest.ocr --dry-run --limit 1`.
Re-OCR a record: delete its `record_ocr` row, rerun, and purge `text/<id>.json`
from the assets.realufo.org cache (1-month Cache Rule).
```

- [ ] **Step 3: Validate the YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ingest.yml'))" && echo ok`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ingest.yml crawler/ingest/README.md
git commit -m "ci(ingest): daily PaddleOCR re-OCR step for new PDFs"
```

- [ ] **Step 5: Ask the user to push, then verify on GHA**

After a yes and `git push`: trigger a manual run (`gh workflow run ingest.yml -f dry_run=true`), confirm the `ocr` step passes (`gh run watch` or `gh run view --log | grep -A3 "ocr ok"`). The next scheduled run handles new PDFs live.

---

## Spec 2 backlog (not this plan)

Remove the 30k `record_text` cap and the 12k summary-input cap; map-reduce summaries; TL;DR reads doc text; doc page "Load all pages" / `GET /api/records/:id/text`; **full text as Markdown (`## Page N` headings, each linking `/doc/<id>?p=N`) and JSON** (R2 `text/<id>.json` is already public after this plan); uncapped llms-full.txt; PaddleOCR-VL fallback for page classes v5 can't read; FTS over all pages.
