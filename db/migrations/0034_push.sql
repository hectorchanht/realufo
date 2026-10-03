-- Web Push (spec 2026-10-03-realufo-pwa-push-design §2a).
-- One row per browser push subscription; actor_id = salted anon id (same hash as votes/posts).
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  replies INTEGER NOT NULL DEFAULT 1,
  new_files INTEGER NOT NULL DEFAULT 0,
  daily INTEGER NOT NULL DEFAULT 1,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_subs_actor ON push_subs(actor_id);

-- What an anon actor follows. 'auto' = they posted there (obeys the replies pref),
-- 'bell' = they tapped the bell. Keyed by actor, not subscription, so follows made
-- before notifications are enabled count once they are.
CREATE TABLE follows (
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('thread','record','case','hub')),
  key TEXT NOT NULL, -- thread id | record id | case slug | 'agency/<slug>' | 'topic/<slug>' | 'location/<slug>'
  src TEXT NOT NULL CHECK(src IN ('auto','bell')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, kind, key)
);
CREATE INDEX idx_follows_target ON follows(kind, key);

-- Watermarks and throttles: 'new_files' → newest records.created_at pushed,
-- 'act:<kind>:<key>' → last activity push, 'daily:<x_posts.id>' → pick pushed.
CREATE TABLE push_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);
