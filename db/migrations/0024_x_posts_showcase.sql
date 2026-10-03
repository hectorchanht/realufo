-- New x_posts stream 'showcase': an operator-made video about one record (e.g. a
-- slow-motion / frame-by-frame cut) with operator-written text, posted on demand
-- via POST /__tick?showcase=ID (scripts/publish.sh --showcase). SQLite can't widen a
-- CHECK in place, hence the rebuild. social_posts references x_posts: dropping the
-- parent with child rows present trips D1's FK check even with deferred FKs, so the
-- child is parked in a plain copy first and recreated (same as 0023) afterwards.
CREATE TABLE social_posts_tmp AS SELECT * FROM social_posts;
DROP TABLE social_posts;

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

CREATE TABLE social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x_post_id INTEGER NOT NULL REFERENCES x_posts(id),
  platform TEXT NOT NULL CHECK(platform IN ('fb','ig','threads','bsky','yt','tiktok')),
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  remote_id TEXT,
  container_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO social_posts (id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at, deleted_at)
  SELECT id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at, deleted_at FROM social_posts_tmp;
DROP TABLE social_posts_tmp;
CREATE UNIQUE INDEX social_posts_live ON social_posts(x_post_id, platform) WHERE deleted_at IS NULL;
CREATE INDEX idx_social_posts_platform ON social_posts(platform, status);
