-- Newsletter issue archive: one row per weekly case-file email sent.
CREATE TABLE IF NOT EXISTS newsletter_issues (
  week TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  recipients INTEGER NOT NULL DEFAULT 0
);
