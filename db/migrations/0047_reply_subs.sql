-- Reply-notification subscriptions: one row per (post, email).
-- A poster opts in by giving an email in the thread composer ("email me when
-- someone replies"); each direct quote-reply (>>No) to that post triggers one
-- email. Unsubscribe is one click via the token (handled by the same
-- /api/email/unsubscribe endpoint as the newsletter).
-- NOTE: apply manually in the D1 dashboard — the Cloudflare git integration
-- never auto-runs migrations. All reply-notify code paths tolerate the table
-- being absent (feature quietly off) until this is applied.
CREATE TABLE IF NOT EXISTS reply_subs (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, email)
);
CREATE INDEX IF NOT EXISTS idx_reply_subs_post ON reply_subs(post_id);
CREATE INDEX IF NOT EXISTS idx_reply_subs_token ON reply_subs(token);
