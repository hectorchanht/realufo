-- Real presence: one row per anon actor, last_seen bumped on each app load
-- (GET /api/bootstrap). "online" = distinct actors seen in the last 5 minutes.
CREATE TABLE presence (
  actor_id TEXT PRIMARY KEY,
  last_seen TEXT NOT NULL
);
CREATE INDEX idx_presence_seen ON presence(last_seen);
