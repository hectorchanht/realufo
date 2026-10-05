-- Email alert subscriptions (double opt-in).
CREATE TABLE email_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | unsubscribed
  token TEXT NOT NULL UNIQUE,             -- confirm + unsubscribe token
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  unsubscribed_at TEXT
);
CREATE INDEX idx_email_subs_status ON email_subscribers(status);
