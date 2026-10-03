-- Spec 9 story polls. articles.poll = {"q": "...", "opts": ["...", ...]} (2-4 opts, <=25 chars).
-- poll_votes: one site vote per visitor per story (opt = index into opts).
-- poll_social: the native poll on a platform (X; Threads if its API allows), its latest counts.
-- status: pending (row in before the API call: never double-posts) → posted → closed (final counts) | failed.
ALTER TABLE articles ADD COLUMN poll TEXT;
CREATE TABLE poll_votes (
  actor_id   TEXT NOT NULL,
  slug       TEXT NOT NULL REFERENCES articles(slug),
  opt        INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, slug)
);
CREATE TABLE poll_social (
  slug       TEXT NOT NULL REFERENCES articles(slug),
  platform   TEXT NOT NULL CHECK(platform IN ('x','threads')),
  remote_id  TEXT,
  status     TEXT NOT NULL CHECK(status IN ('pending','posted','closed','failed')),
  closes_at  TEXT,
  counts     TEXT,
  total      INTEGER,
  fetched_at TEXT,
  cost_usd   REAL NOT NULL DEFAULT 0,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, platform)
);
