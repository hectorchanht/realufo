-- /api/ask's global daily cap counts rate_events by (action, created_at) across
-- all actors; the existing (actor_id, action, created_at) index can't serve that.
CREATE INDEX idx_rate_action_time ON rate_events(action, created_at);
