-- Public API v1 usage analytics (privacy-preserving: no IPs, no user agents).
-- Counts hits per day per route template. Written fire-and-forget via
-- ctx.waitUntil() in v1guarded, so a failed/pending migration never breaks
-- the API — the writer fails soft like the webhook code.
CREATE TABLE IF NOT EXISTS api_usage (
  day TEXT NOT NULL,        -- YYYY-MM-DD (UTC)
  endpoint TEXT NOT NULL,   -- e.g. "GET /api/v1/records"
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, endpoint)
);
