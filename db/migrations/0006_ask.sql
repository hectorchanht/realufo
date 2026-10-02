-- Ask the Archive (Spec 3). text_index: one row per record the indexer has
-- processed (vectors live in Vectorize). ask_cache: answers by normalized question.
CREATE TABLE text_index (
  record_id  TEXT PRIMARY KEY REFERENCES records(id),
  status     TEXT CHECK(status IN ('indexed','empty','failed')) NOT NULL,
  chunks     INTEGER NOT NULL DEFAULT 0,
  chars      INTEGER NOT NULL DEFAULT 0,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE ask_cache (
  key        TEXT PRIMARY KEY,
  answer     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
