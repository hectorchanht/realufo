-- 0041 Telegram Admin Portal v2 (retry): widen bot_jobs.kind CHECK.
-- SUPERSEDES 0040_tg_portal.sql — DO NOT APPLY 0040_tg_portal.sql.
--
-- Why a new file: D1 enforces the FK bot_job_versions.job_id → bot_jobs(id)
-- and ignores PRAGMA foreign_keys=OFF in the console, so the old file's
-- DROP TABLE bot_jobs can never succeed. This version stages the child's
-- data aside, drops BOTH old tables (child first), then rebuilds the child
-- with its FK pointing at the new parent table.

-- 1. New parent with widened kind CHECK (identical to 0040's intended schema).
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

-- 2. Stage the child's rows aside (its FK would block dropping the parent).
CREATE TABLE _versions_backup AS SELECT * FROM bot_job_versions;

-- 3. Drop CHILD first (removes the FK), then the parent. At this point no
--    live table references bot_jobs, so the drop succeeds under FK enforcement.
DROP TABLE bot_job_versions;
DROP TABLE bot_jobs;

-- 4. Rename the new parent into place.
ALTER TABLE bot_jobs_new RENAME TO bot_jobs;

-- 5. Rebuild the child with its FK pointing at the (new) bot_jobs table.
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
INSERT INTO bot_job_versions (job_id, version, caption, media, note, decision, created_at)
  SELECT job_id, version, caption, media, note, decision, created_at FROM _versions_backup;
DROP TABLE _versions_backup;

-- 6. Indexes (same as 0040 intended).
CREATE INDEX bot_jobs_stream ON bot_jobs(stream, status) WHERE deleted_at IS NULL;
CREATE INDEX bot_jobs_ref ON bot_jobs(ref) WHERE deleted_at IS NULL;

-- 7. Per-stream human pause switches for the portal. 0 = running, 1 = paused (no new jobs queue).
INSERT OR IGNORE INTO bot_settings(key, value) VALUES
  ('paused_record', '0'),
  ('paused_short', '0'),
  ('paused_article', '0'),
  ('paused_social', '0'),
  ('paused_poll', '0');
