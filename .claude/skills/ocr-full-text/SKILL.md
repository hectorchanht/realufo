---
name: ocr-full-text
description: Use when RealUFO PDFs need real full text — scanned or garbled pages, new PDFs without OCR, re-OCRing a file, running or resuming the PaddleOCR backfill, rebuilding doc text / AI summaries / TL;DR / Ask vectors from OCR text, or changing the full-text Markdown view (record_ocr, R2 text/<id>.json, /doc/<id>/text, ingest.ocr).
---

# OCR full text (PaddleOCR)

Canonical full text of every PDF = R2 `text/<id>.json` (`[{n, text, src: pdf|ocr|err, conf?}]`, every page, no cap), written by `crawler/ingest/ocr.py`; a D1 `record_ocr` row marks it done. Pages whose pdftotext layer passes `fulltext.keep_page` keep it; the rest are OCR'd. Spec: `docs/superpowers/specs/2026-10-03-realufo-paddleocr-reocr-design.md`.

## Decided — don't relitigate
- Engine is **PaddleOCR PP-OCRv5**, `PP-OCRv5_mobile_det` + `en_PP-OCRv5_mobile_rec` @ 200 dpi (bench `docs/launch/ocr-bench.md`: same text as server det, 3.6× faster). User choice: no other OCR engine.
- **PP-StructureV3 is rejected**: it reads transcripts/forms as tables and drops up to 100% of their words. Rich Markdown comes from the lossless formatter `worker/lib/ocrMarkdown.ts` instead.
- Paddle needs Python ≤3.12 (system is 3.14) → always `crawler/.venv-ocr/bin/python`. Missing venv: `cd crawler && uv venv --python 3.12 .venv-ocr && uv pip install --python .venv-ocr/bin/python -r ingest/requirements.txt -r ingest/requirements-ocr.txt pytest`.

## Run (from `crawler/`, after `set -a; . ../.env; set +a`)
1. `ps -A -o pid,etime,command | grep ingest.ocr` — other chats share this Mac; don't stack OCR runs.
2. `.venv-ocr/bin/python -m ingest.ocr --ids A,B` (comma list) OCRs only those, uploads `text/<id>.json` to R2 itself and writes the D1 marker. No `--ids` = every live PDF without a marker. Dry run: add `--dry-run`.
3. Paddle uses ONE core (~14–18 s per OCR page), so parallelise with `--shard i/N` (round-robin over the work list; combines with `--ids`). Start all N **in the same second**:
   `for i in 0 1 2 3 4 5 6 7; do nohup caffeinate -i .venv-ocr/bin/python -m ingest.ocr [--ids A,B,…] --shard $i/8 > LOG$i 2>&1 & done`
   N ≤ files and ≤ 8 (10 cores). To rebalance: kill your own workers by PID (`pkill` patterns also hit other chats' runs), restart all N together. A killed file has no marker → redone, never lost.
4. **Rebuild consumers, in this order** (summaries drops `text_index` rows, so textindex comes after):
   `fulltext` → `summaries --ids A B` → `textindex` → `tldr --ids A B` → `cards --ids A B`, each `.venv-ocr/bin/python -m ingest.<step>`. These take **space-separated** ids; in zsh split a comma list with `${(s:,:)IDS}`.
5. Verify: logs end `ocr ok=N failed=0`; `curl https://assets.realufo.org/text/<id>.json`; `https://realufo.org/doc/<id>/text`; `.venv-ocr/bin/python -m ingest.ask_eval` (9–10/10 — one miss flipping between runs is answer noise; check the miss cites a correct file).
6. IndexNow for changed doc pages: `python3 indexnow.py <url> …`.

## Re-OCR one file
`wrangler d1 execute realufo-db --remote --command "DELETE FROM record_ocr WHERE record_id='X'"` (a prod write: confirm with the user) → rerun step 2 + 4 → purge `text/X.json` from the assets.realufo.org cache (1-month Cache Rule; user's dashboard), or readers get the old text.

## Gotchas
- The daily GHA ingest (06:00 UTC) runs fulltext/textindex **from origin**: OCR'd records are only rebuilt correctly by code that reads `record_ocr` — make sure origin has it before live OCR.
- OCR requeues a record (deletes `record_text`, marks `text_index` failed) only when ≥1 page was OCR'd; born-digital files get a marker only.
- Rollback a record: delete its `record_ocr` row and requeue the same way → pdftotext again.
- Changing `ocrMarkdown.ts`: it must stay **lossless** (same alphanumeric tokens, same order). Keep the property test green and rerun it over real `text/*.json` pages before deploying.
- `fetch.download` timeout is 600 s (173 MB PDFs exist).
