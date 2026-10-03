-- Spec 2026-10-03-realufo-uncapped-ai. Section summaries of the map-reduce AI summary
-- (crawler ingest.summaries): JSON [{"from":1,"to":12,"text":"..."}]; NULL for one-section files.
ALTER TABLE record_text ADD COLUMN ai_sections TEXT;

-- Files with a record_ocr row get one FTS row per page straight from R2 text/<id>.json
-- (crawler ingest.ocr). record_text holds only their capped pages, so its triggers must
-- not touch those files' rows — least of all the delete the OCR requeue does.
DROP TRIGGER record_fts_ai;
DROP TRIGGER record_fts_au;
DROP TRIGGER record_fts_ad;

CREATE TRIGGER record_fts_ai AFTER INSERT ON record_text
WHEN NOT EXISTS (SELECT 1 FROM record_ocr WHERE record_id = new.record_id) BEGIN
  DELETE FROM record_fts WHERE record_id = new.record_id;
  INSERT INTO record_fts(record_id, page, body)
    SELECT new.record_id, json_extract(p.value, '$.n'), json_extract(p.value, '$.text')
    FROM json_each(CASE WHEN json_valid(new.pages) THEN new.pages ELSE '[]' END) p
    WHERE coalesce(json_extract(p.value, '$.text'), '') <> '';
END;

CREATE TRIGGER record_fts_au AFTER UPDATE OF pages ON record_text
WHEN NOT EXISTS (SELECT 1 FROM record_ocr WHERE record_id = new.record_id) BEGIN
  DELETE FROM record_fts WHERE record_id = old.record_id;
  INSERT INTO record_fts(record_id, page, body)
    SELECT new.record_id, json_extract(p.value, '$.n'), json_extract(p.value, '$.text')
    FROM json_each(CASE WHEN json_valid(new.pages) THEN new.pages ELSE '[]' END) p
    WHERE coalesce(json_extract(p.value, '$.text'), '') <> '';
END;

CREATE TRIGGER record_fts_ad AFTER DELETE ON record_text
WHEN NOT EXISTS (SELECT 1 FROM record_ocr WHERE record_id = old.record_id) BEGIN
  DELETE FROM record_fts WHERE record_id = old.record_id;
END;
