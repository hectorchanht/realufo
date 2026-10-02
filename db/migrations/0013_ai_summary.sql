-- AI summary of the doc-page full text (see crawler/ingest/summaries.py).
-- NULL until generated; failures stay NULL and are retried.
ALTER TABLE record_text ADD COLUMN ai_summary TEXT;
