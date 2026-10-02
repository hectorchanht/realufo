-- 0009_ai_moments.sql: AI-generated key moments per video (see crawler/ingest/moments.py)
ALTER TABLE records ADD COLUMN ai_moments TEXT;
