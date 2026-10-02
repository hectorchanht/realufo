-- record_links rows now come from two places (crawler ingest.links):
-- 'official' = war.gov CSV Video/PDF Pairing ("Related Media"), 'topic' = TF-IDF.
ALTER TABLE record_links ADD COLUMN source TEXT NOT NULL DEFAULT 'topic';
