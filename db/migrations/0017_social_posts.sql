-- Spec 5: social fan-out. One row per (x_posts row, platform) ever attempted; the
-- UNIQUE is the double-post guard (row is inserted BEFORE the platform is called).
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
  UNIQUE(x_post_id, platform)
);
CREATE INDEX idx_social_posts_platform ON social_posts(platform, status);

-- Rotating OAuth tokens (threads, tiktok); the Worker can't rewrite its own secrets.
CREATE TABLE social_auth (
  platform TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,           -- UTC 'YYYY-MM-DD HH:MM:SS'
  updated_at TEXT DEFAULT (datetime('now'))
);
