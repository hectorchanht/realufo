-- SHA-256 content hash per mirrored asset file (tamper-evident provenance:
-- future researchers can hash a file and prove it matches the 2026 mirror).
ALTER TABLE assets ADD COLUMN sha256 TEXT;
CREATE INDEX IF NOT EXISTS idx_assets_sha256_null ON assets(sha256) WHERE sha256 IS NULL;
