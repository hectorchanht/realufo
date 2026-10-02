-- Permanent log of every question asked (ask_cache expires after 7 days).
-- public=1 only when the asker opts in; /api/ask/recent lists those.
CREATE TABLE ask_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  actor_id   TEXT NOT NULL,
  sources    INTEGER NOT NULL DEFAULT 0,
  cached     INTEGER NOT NULL DEFAULT 0,
  public     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ask_log_public ON ask_log(public, created_at);
