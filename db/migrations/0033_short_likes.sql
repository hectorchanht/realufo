-- Shorts player likes: one per visitor per Short (keyed by its record id).
-- Shown only in the player (GET /api/shorts likes/liked), nowhere else.
CREATE TABLE short_likes (
  actor_id   TEXT NOT NULL,
  record_id  TEXT NOT NULL REFERENCES records(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, record_id)
);
CREATE INDEX idx_short_likes_record ON short_likes(record_id);
