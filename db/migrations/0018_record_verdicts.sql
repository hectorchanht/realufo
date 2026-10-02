-- Spec 6 Part A: one verdict per visitor per file. Tallies are counted on read.
CREATE TABLE record_verdicts (
  actor_id   TEXT NOT NULL,
  record_id  TEXT NOT NULL REFERENCES records(id),
  verdict    TEXT NOT NULL CHECK (verdict IN ('explained','unexplained','more_data')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, record_id)
);
CREATE INDEX idx_verdicts_record ON record_verdicts(record_id, updated_at);
