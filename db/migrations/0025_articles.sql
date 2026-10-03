-- Operator-written articles (scripts/article.py, publish-article skill): a story across
-- several records (e.g. look-alike pairs) with evidence. articles holds the story; each
-- article_records row is one piece of evidence: the record, the moment (seconds into its
-- video) where it shows best, a caption, and a close-up image (R2 uploads/<uuid>.jpg).
-- The doc page lists the articles a record is in; thread_id is the site thread the
-- article is published as (OP = story, one reply per evidence row).
CREATE TABLE articles (
  slug       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  image_key  TEXT,
  thread_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE article_records (
  slug      TEXT NOT NULL REFERENCES articles(slug),
  record_id TEXT NOT NULL,
  pos       INTEGER NOT NULL,
  t         REAL,
  label     TEXT NOT NULL,
  evidence  TEXT NOT NULL,
  image_key TEXT,
  PRIMARY KEY (slug, record_id)
);
CREATE INDEX idx_article_records_record ON article_records(record_id);
