-- Document evidence cites a PDF page (the doc page opens it with ?p=N), like a video's moment (t).
ALTER TABLE article_records ADD COLUMN page INTEGER;
