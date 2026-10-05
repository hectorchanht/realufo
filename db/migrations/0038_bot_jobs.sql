-- Telegram admin center (spec 2026-10-04-realufo-telegram-gate-design): every post waits for
-- the owner's tap. A job is a post that is ready but not written to x_posts / site rows yet.
CREATE TABLE bot_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK(kind IN ('post','poll','showcase','article','video')),
  stream     TEXT NOT NULL,   -- bot: pick | release | highlight | poll · operator: manual | showcase | article
  ref        TEXT NOT NULL,   -- record id, release ref, thread id or article slug
  status     TEXT NOT NULL CHECK(status IN ('prep','media','brief_wait','making','video_wait','post_wait','handmade','approved','posted','skipped','failed')),
  version    INTEGER NOT NULL DEFAULT 1,
  caption    TEXT,            -- the text that will be posted (THREAD_SEP-joined for X threads)
  media      TEXT,            -- JSON {key, mime, size} or NULL
  payload    TEXT NOT NULL,   -- JSON: what approval executes (see worker/lib/gate.ts)
  tg_msgs    TEXT,            -- JSON array: Telegram message ids of the current preview
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX bot_jobs_stream ON bot_jobs(stream, status) WHERE deleted_at IS NULL;
CREATE INDEX bot_jobs_ref ON bot_jobs(ref) WHERE deleted_at IS NULL;

-- Every version of a job's caption/media is kept, with the owner's note and decision.
CREATE TABLE bot_job_versions (
  job_id     INTEGER NOT NULL REFERENCES bot_jobs(id),
  version    INTEGER NOT NULL,
  caption    TEXT,
  media      TEXT,
  note       TEXT,
  decision   TEXT,            -- post | skip | NULL (superseded)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (job_id, version)
);

CREATE TABLE bot_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Bot picks wait for Plan 2 (auto Shorts at the making-shorts bar); /resume turns them on.
INSERT INTO bot_settings(key, value) VALUES ('paused_picks', '1');

-- social_posts.platform gains 'tg' (Telegram channel). SQLite can't widen a CHECK in place:
-- rebuild, same as 0023/0024.
CREATE TABLE social_posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x_post_id INTEGER NOT NULL REFERENCES x_posts(id),
  platform TEXT NOT NULL CHECK(platform IN ('fb','ig','threads','bsky','yt','tiktok','tg')),
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  remote_id TEXT,
  container_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO social_posts_new (id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at, deleted_at)
  SELECT id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at, deleted_at FROM social_posts;
DROP TABLE social_posts;
ALTER TABLE social_posts_new RENAME TO social_posts;
CREATE UNIQUE INDEX social_posts_live ON social_posts(x_post_id, platform) WHERE deleted_at IS NULL;
CREATE INDEX idx_social_posts_platform ON social_posts(platform, status);

-- The Telegram channel starts fresh: posts already on X before the gate are not mirrored there
-- (a live row of any status blocks the fan-out). Soft-delete a row to mirror that post after all.
-- When clearing tg dry-run drafts before flipping FEATURE_SOCIAL_TG to "on", delete only rows with
-- platform='tg' AND status='draft' AND error IS NULL — the seeded backlog rows carry an error note.
INSERT INTO social_posts (x_post_id, platform, status, error)
  SELECT id, 'tg', 'draft', 'pre-gate backlog: not mirrored to the Telegram channel' FROM x_posts WHERE status='posted';
