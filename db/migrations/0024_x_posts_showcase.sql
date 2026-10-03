-- New x_posts stream 'showcase': an operator-made video about one record (e.g. a
-- slow-motion / frame-by-frame cut) with operator-written text, posted on demand
-- via POST /__tick?showcase=ID (scripts/publish.sh --showcase). SQLite can't widen a
-- CHECK in place, hence the rebuild; social_posts references x_posts, so FK checks
-- are deferred to the end of the migration.
PRAGMA defer_foreign_keys = true;
CREATE TABLE x_posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream TEXT NOT NULL CHECK(stream IN ('release','pick','highlight','showcase')),
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
INSERT INTO x_posts_new SELECT id, stream, ref, text, ai, media, media_id, cost_usd, status, tweet_id, error, attempts, created_at FROM x_posts;
DROP TABLE x_posts;
ALTER TABLE x_posts_new RENAME TO x_posts;
CREATE INDEX idx_x_posts_created ON x_posts(created_at);
