-- Topic hubs (spec 2026-10-03-realufo-topic-hubs-design): allow kind='topic'.
-- SQLite can't alter a CHECK constraint, so rebuild the table and keep its rows.
CREATE TABLE hub_highlights_new (
  kind          TEXT NOT NULL CHECK (kind IN ('release','agency','location','decade','topic')),
  slug          TEXT NOT NULL,
  lede          TEXT NOT NULL,
  picks         TEXT NOT NULL,
  members_hash  TEXT NOT NULL,
  generated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);
INSERT INTO hub_highlights_new (kind, slug, lede, picks, members_hash, generated_at)
  SELECT kind, slug, lede, picks, members_hash, generated_at FROM hub_highlights;
DROP TABLE hub_highlights;
ALTER TABLE hub_highlights_new RENAME TO hub_highlights;
