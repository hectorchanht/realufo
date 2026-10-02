-- Spec 4: X bot. One row per (stream, ref) ever attempted; the UNIQUE is the
-- double-post guard (row is inserted BEFORE X is called).
CREATE TABLE x_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream TEXT NOT NULL CHECK(stream IN ('release','pick','highlight')),
  ref TEXT NOT NULL,
  text TEXT NOT NULL,
  ai INTEGER NOT NULL,
  media TEXT,
  media_id TEXT,
  cost_usd REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  tweet_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(stream, ref)
);
CREATE INDEX idx_x_posts_created ON x_posts(created_at);
