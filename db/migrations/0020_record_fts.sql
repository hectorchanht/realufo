-- Search inside documents: one FTS5 row per OCR'd PDF page from
-- record_text.pages ([{"n":1,"text":"..."}]). Archive `q` matches it alongside
-- the title/summary LIKE (worker/routes/records.ts).
--
-- Kept in sync by triggers, so crawler/ingest needs no change. The insert
-- trigger clears the file's rows first because ingest writes with
-- INSERT OR REPLACE, which doesn't fire delete triggers.
--
-- BACKUPS: `wrangler d1 export` refuses databases with virtual tables. Drop
-- record_fts (and its triggers), export, then re-run this file.
CREATE VIRTUAL TABLE record_fts USING fts5(record_id UNINDEXED, page UNINDEXED, body, tokenize = 'porter unicode61');

INSERT INTO record_fts(record_id, page, body)
  SELECT t.record_id, json_extract(p.value, '$.n'), json_extract(p.value, '$.text')
  FROM record_text t, json_each(CASE WHEN json_valid(t.pages) THEN t.pages ELSE '[]' END) p
  WHERE coalesce(json_extract(p.value, '$.text'), '') <> '';

CREATE TRIGGER record_fts_ai AFTER INSERT ON record_text BEGIN
  DELETE FROM record_fts WHERE record_id = new.record_id;
  INSERT INTO record_fts(record_id, page, body)
    SELECT new.record_id, json_extract(p.value, '$.n'), json_extract(p.value, '$.text')
    FROM json_each(CASE WHEN json_valid(new.pages) THEN new.pages ELSE '[]' END) p
    WHERE coalesce(json_extract(p.value, '$.text'), '') <> '';
END;

CREATE TRIGGER record_fts_au AFTER UPDATE OF pages ON record_text BEGIN
  DELETE FROM record_fts WHERE record_id = old.record_id;
  INSERT INTO record_fts(record_id, page, body)
    SELECT new.record_id, json_extract(p.value, '$.n'), json_extract(p.value, '$.text')
    FROM json_each(CASE WHEN json_valid(new.pages) THEN new.pages ELSE '[]' END) p
    WHERE coalesce(json_extract(p.value, '$.text'), '') <> '';
END;

CREATE TRIGGER record_fts_ad AFTER DELETE ON record_text BEGIN
  DELETE FROM record_fts WHERE record_id = old.record_id;
END;
