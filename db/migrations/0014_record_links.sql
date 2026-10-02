-- Topic links between records (crawler ingest.links, TF-IDF over title +
-- summaries). The whole table is rewritten each run. No FKs: the doc page
-- joins records, so links to a deleted record just drop out.
CREATE TABLE record_links (
  record_id  TEXT NOT NULL,
  related_id TEXT NOT NULL,
  score      REAL NOT NULL,
  PRIMARY KEY (record_id, related_id)
);
