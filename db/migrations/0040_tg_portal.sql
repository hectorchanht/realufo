-- 0040 Telegram Admin Portal v2: the universal content gate.
-- Every content addition (record, short, article, social, poll) waits for the owner's
-- approval in Telegram. Widen bot_jobs.kind (SQLite can't alter a CHECK in place:
-- rebuild, same as 0038). Seed per-stream pause switches (0 = running).

CREATE TABLE bot_jobs_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK(kind IN ('post','poll','showcase','article','video','record','short')),
  stream     TEXT NOT NULL,   -- record | short | article | social | poll | pick | release | highlight | manual | showcase
  ref        TEXT NOT NULL,   -- record id, short key, article slug, thread id
  status     TEXT NOT NULL CHECK(status IN ('prep','media','brief_wait','making','video_wait','post_wait','handmade','approved','posted','skipped','failed')),
  version    INTEGER NOT NULL DEFAULT 1,
  caption    TEXT,
  media      TEXT,
  payload    TEXT NOT NULL,
  tg_msgs    TEXT,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO bot_jobs_new (id, kind, stream, ref, status, version, caption, media, payload, tg_msgs, error, created_at, updated_at, deleted_at)
  SELECT id, kind, stream, ref, status, version, caption, media, payload, tg_msgs, error, created_at, updated_at, deleted_at FROM bot_jobs;
DROP TABLE bot_jobs;
ALTER TABLE bot_jobs_new RENAME TO bot_jobs;
CREATE INDEX bot_jobs_stream ON bot_jobs(stream, status) WHERE deleted_at IS NULL;
CREATE INDEX bot_jobs_ref ON bot_jobs(ref) WHERE deleted_at IS NULL;

-- Per-stream human pause switches for the portal. 0 = running, 1 = paused (no new jobs queue).
INSERT OR IGNORE INTO bot_settings(key, value) VALUES
  ('paused_record', '0'),
  ('paused_short', '0'),
  ('paused_article', '0'),
  ('paused_social', '0'),
  ('paused_poll', '0');
