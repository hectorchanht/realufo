-- Public API v1 webhooks: developer subscriptions for archive events.
-- NOTE: apply manually in the D1 dashboard (Cloudflare git integration does
-- NOT auto-run migrations). Code treats a missing table as "no subscribers".
CREATE TABLE IF NOT EXISTS webhook_subs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,          -- HMAC-SHA256 signing secret; shown once at creation
  events TEXT NOT NULL DEFAULT '["records.created","release.created"]',
  active INTEGER NOT NULL DEFAULT 1,
  fails INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_ok_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active ON webhook_subs(active);
