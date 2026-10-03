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
