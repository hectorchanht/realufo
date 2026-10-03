# RealUFO — Re-OCR scanned PDFs with PaddleOCR (Spec 1 of "real full text into the LLMs")

Date: 2026-10-03 · Status: approved design, pending spec review

## Why

The AI features (Ask, AI summaries, TL;DR, llms-full.txt) only see part of the archive's real text.
Prod D1 on 2026-10-03:

| | |
|---|---|
| Live PDFs | 429 files, 21,171 pages |
| `record_text` (doc page, FTS, llms-full.txt, summaries input) | 2,884 pages kept (14%); 137 files cut at the 30k-char cap; 97 files with no text at all |
| AI summary input | first 12k chars of the kept pages (167 files are longer) |
| Ask index (Vectorize) | all raw pdftotext, 38.4M chars, garbled pages included |

Most pages are dropped because their embedded text layer is bad OCR: `fulltext.keep_page` (word ratio ≥ 0.65)
rejects them as garbage. Nobody has the real words on ~86% of pages.

The fix is in two specs:

1. **This spec:** re-OCR the scanned pages with PaddleOCR into a canonical full text per PDF, then rebuild the
   existing consumers from it.
2. **Spec 2 (later):** remove the caps. Map-reduce summaries over the full text, TL;DR reads doc text, a
   "Load all pages" button, uncapped llms-full.txt. It rebases on parked branch `feat/fulltext-all`, whose
   R2 `text/<id>.json` format is a subset of the one defined here.

## Decisions

- **Engine:** PaddleOCR 3.x, pipeline **PP-OCRv5** (English), CPU. User choice; no other OCR engine.
  PaddleOCR-VL (GPU) is noted as a possible later fallback for page classes v5 can't read. Not built here.
- **Hybrid pages:** pages whose pdftotext text passes `keep_page` keep it (free, exact). Only failing pages
  and files with no text layer are OCR'd.
- **Where it runs:** one-off backfill on the user's Mac (arm64, 10 cores) in a `uv` venv on Python 3.12
  (Paddle supports 3.8–3.12; system Python is 3.14). New PDFs are handled by the daily GHA ingest
  (Python 3.11).
- **Cost:** OCR has no API cost. Regenerating downstream LLM outputs (summaries, TL;DR) costs roughly
  $1–5 on Workers AI. Ask cost per question is unchanged.

## Architecture

### `crawler/ingest/ocr.py` (new)

For each live PDF without a `record_ocr` row:

1. Download the PDF (`fetch.download`) and run `pdftotext` per page (`chunking.split_pages`).
2. For each page `n`, clean it with `fulltext.clean_page`:
   - if `fulltext.keep_page(text)` → `{n, text, src: "pdf"}`
   - else render that page (`pdftoppm -r <dpi> -f n -l n`) → PP-OCRv5 → `{n, text, src: "ocr", conf}`
   - a render/OCR exception on one page → `{n, text: "", src: "err"}`; the rest of the file proceeds
3. Upload all pages, uncapped, to R2 `text/<id>.json` (`application/json`).
4. Then write D1: the `record_ocr` marker plus the requeue SQL (below), in one batch.

A download failure or whole-file failure writes nothing, so the next run retries it. Because the marker is
written after the R2 upload, a crash between them means a retry, never a marker without a file.

CLI: `python -m ingest.ocr [--dry-run] [--limit N] [--ids A,B] [--bench]`. `--dry-run` runs OCR and prints
per-file stats with no R2/D1 writes.

### OCR details

- The OCR engine is a function passed into the page router and imported lazily (`paddleocr` import inside
  the factory), so tests and other ingest steps never need Paddle installed.
- PaddleOCR options: English model, document orientation classification on (rotated scans),
  `text_rec_score_thresh ≈ 0.5`. Paddle drops low-confidence boxes itself, so garbage boxes never become text.
- Line order: boxes sorted top-to-bottom, then left-to-right, grouped into lines by vertical overlap, lines
  joined with `\n`. No layout model (PP-StructureV3 is out of scope; the archive is single-column memos and
  cables).
- `conf` = mean recognition score of the kept boxes, rounded to 2 decimals. Stored for tuning; nothing reads
  it yet.
- Blank or fully redacted pages are stored as `{n, text: ""}` so page numbers stay aligned with the PDF
  (`?p=N` deep links).
- Model tier (mobile vs server) and dpi (200 vs 300) are set by the benchmark (Rollout step 2) and stored in
  module constants plus `record_ocr.engine` (e.g. `"PP-OCRv5_server@200"`).

### R2 file `text/<id>.json`

```json
[{"n": 1, "text": "…", "src": "pdf"},
 {"n": 2, "text": "…", "src": "ocr", "conf": 0.93},
 {"n": 3, "text": "",  "src": "err"}]
```

Every page of the PDF, in order, no cap. This is the canonical full text for all consumers.

`assets.realufo.org` has a 1-month Cache Rule. A record is OCR'd once, so normally the file is never
rewritten. If a record is re-OCR'd (marker deleted, rerun), purge `text/<id>.json` from the zone cache (user
dashboard) or readers get the old text. `doc_pages` is only called after the marker exists, so a 404 is never
cached for a file that is about to be uploaded.

### D1 migration `0029_record_ocr.sql`

```sql
CREATE TABLE record_ocr (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  pages     INTEGER NOT NULL,   -- total pages in the PDF
  ocr_pages INTEGER NOT NULL,   -- pages with src='ocr'
  chars     INTEGER NOT NULL,   -- total chars across all pages
  engine    TEXT NOT NULL,      -- e.g. 'PP-OCRv5_server@200'
  done_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The Worker doesn't read this table in this spec, so no Worker deploy is needed.

### Shared page source

New helper `doc_pages(row, work) -> list[str]` in `textindex.py`, replacing direct `pdf_pages` calls:
if a `record_ocr` row exists for the record, read R2 `text/<id>.json` via its CDN URL and return the page
texts in order; otherwise pdftotext as today. `fulltext.py` and `textindex.py` both use it, so every
consumer sees the same pages. The SELECTs gain `EXISTS(SELECT 1 FROM record_ocr …) AS ocr`.

### Requeue (rebuild consumers via existing self-healing paths)

After a record's OCR, in the same D1 batch as the marker:

- `DELETE FROM record_text WHERE record_id=?`
  - the FTS delete trigger clears its search rows
  - the next `ingest.fulltext` run rebuilds `record_text` from the clean pages (the existing 30k cap and
    `keep_page` display filter still apply in this spec)
  - `ai_summary` is gone, so `ingest.summaries` regenerates it
  - the TL;DR input hash changes, so `ingest.tldr` and `ingest.cards` regenerate
- `UPDATE text_index SET status='failed' WHERE record_id=?`
  - the next live `ingest.textindex` run's `retry_failed()` deletes **all** of the record's old vectors
    (ids `0..chunks-1`) and re-embeds. Clean text can yield fewer chunks than garbled text did, so a plain
    upsert would leave garbage tail vectors in Ask.

Between OCR and the next `fulltext` run, the doc page shows no full text for that record. During the backfill
this window is closed by running the chain right after OCR; on GHA the steps run back-to-back in one job.

## GitHub Actions

In `.github/workflows/ingest.yml`, a new step after ingest/thumbs and **before** `ingest.fulltext`:

- `pip install -r crawler/ingest/requirements-ocr.txt` (new file: `paddlepaddle`, `paddleocr`, pinned)
- `actions/cache` for the Paddle model directory (`~/.paddlex`)
- live: `python -m ingest.ocr`; manual dry run: `python -m ingest.ocr --dry-run --limit 1`
- same `set -o pipefail` + `tee -a ingest-summary.txt` pattern as the other steps

The existing pytest step keeps using `requirements.txt` only.

## Testing

pytest in `crawler/ingest/tests/test_ocr.py`, with a fake OCR engine (no Paddle):

- page routing: passing text layer → `pdf`, failing → `ocr` (engine called with that page only), engine
  exception → `err` with empty text, other pages unaffected
- box → line ordering (two boxes on one line ordered by x; lines ordered by y)
- `text/<id>.json` shape and page alignment (blank page kept as `""`)
- marker + requeue SQL text
- `doc_pages`: `ocr` flag → R2 JSON; no flag → pdftotext
- `--dry-run` makes no R2/D1 calls

`worker/tests/schema.spec.ts` covers the new table if it enumerates tables.

## Rollout

1. Check pending migration numbers (other chats share this checkout), then apply `0029_record_ocr.sql` to remote D1.
2. **Benchmark gate:** `python -m ingest.ocr --bench` on ~20 sample pages (teletype/cable, typed memo, faint
   carbon, handwriting-ish, rotated, form, heavy redaction, pages from the 97 no-text files) × {mobile,
   server} × {200, 300 dpi}. Output `docs/launch/ocr-bench.md`: s/page, `keep_page` pass rate before/after,
   side-by-side old vs new text. The user reviews it and picks model and dpi. Continue only if most failing
   pages become readable and the full backfill fits about a night. Page classes v5 can't read are listed as
   PaddleOCR-VL candidates.
3. **Pilot:** `ingest.ocr --limit 10` live → `fulltext` → `summaries` → `textindex` for them. Spot-check 3 doc
   pages and a few Ask questions; `ingest.ask_eval` must stay at recall@8 10/10.
4. **Backfill:** full `ingest.ocr` under `caffeinate` (resumable per record), then `fulltext` → `summaries` →
   `textindex` → `tldr` → `cards`, then `crawler/indexnow.py` for the changed doc pages.
5. **GHA:** add the workflow step; confirm one live run with new PDFs (or a manual dry run).

**Rollback:** `DELETE FROM record_ocr` (all or some ids) → `doc_pages` falls back to pdftotext → requeue
the same records the same way. R2 `text/` files can stay; nothing reads them without a marker.

## Out of scope (Spec 2)

Lifting the 30k `record_text` cap and the 12k summary input cap, map-reduce summaries, TL;DR reading doc
text, the doc page "Load all pages" button / `GET /api/records/:id/text`, uncapped llms-full.txt,
PaddleOCR-VL fallback, FTS over all pages.
