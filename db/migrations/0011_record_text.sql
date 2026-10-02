-- Doc-page full text (spec 2026-10-02-realufo-doc-fulltext). One row per PDF
-- processed by crawler ingest.fulltext; pages='[]' when no page passed the
-- OCR quality filter (so it isn't retried).
CREATE TABLE record_text (
  record_id   TEXT PRIMARY KEY REFERENCES records(id),
  pages       TEXT NOT NULL,
  truncated   INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
