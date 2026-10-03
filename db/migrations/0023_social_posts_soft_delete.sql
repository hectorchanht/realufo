-- Soft delete for social_posts: deleted_at retires a row but keeps its history
-- (remote ids, errors). The double-post guard now covers live rows only, so a
-- retired (x_post, platform) pair can be posted again. SQLite can't drop an inline
-- UNIQUE, hence the rebuild.
CREATE TABLE social_posts_new (
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
INSERT INTO social_posts_new (id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at)
  SELECT id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at FROM social_posts;
DROP TABLE social_posts;
ALTER TABLE social_posts_new RENAME TO social_posts;
CREATE UNIQUE INDEX social_posts_live ON social_posts(x_post_id, platform) WHERE deleted_at IS NULL;
CREATE INDEX idx_social_posts_platform ON social_posts(platform, status);
