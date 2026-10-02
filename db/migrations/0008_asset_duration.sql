-- Video length (seconds) on the `full` asset, shown as a m:ss badge on cards.
-- Backfilled with ffprobe against cdn_url; NULL = unknown (badge hidden).
ALTER TABLE assets ADD COLUMN duration REAL;
