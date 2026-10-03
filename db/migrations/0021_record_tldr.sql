-- Spec 7: funny-but-true TL;DR ("懶人包") per file, written by crawler ingest.tldr;
-- card_url by ingest.cards.
CREATE TABLE record_tldr (
  record_id    TEXT NOT NULL REFERENCES records(id),
  lang         TEXT NOT NULL DEFAULT 'en',
  bullets      TEXT NOT NULL,          -- JSON ["…","…","…"], exactly 3, each <= 18 words
  one_liner    TEXT NOT NULL,          -- <= 15 words, the joke
  input_hash   TEXT NOT NULL,          -- sha256 of the model input; changes -> regenerate
  card_url     TEXT,                   -- share PNG on assets.realufo.org; NULL until ingest.cards runs
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (record_id, lang)
);
