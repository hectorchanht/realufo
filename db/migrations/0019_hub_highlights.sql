-- Spec 6 Part B: AI "What stands out" per hub, written by crawler ingest.highlights.
CREATE TABLE hub_highlights (
  kind          TEXT NOT NULL CHECK (kind IN ('release','agency','location','decade')),
  slug          TEXT NOT NULL,
  lede          TEXT NOT NULL,
  picks         TEXT NOT NULL,          -- JSON [{"id": "<record id>", "why": "<=25 words"}]
  members_hash  TEXT NOT NULL,          -- sha256 of sorted hub record ids at generation time
  generated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);
