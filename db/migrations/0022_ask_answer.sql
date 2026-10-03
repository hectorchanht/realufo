-- Frozen answer for shared pages (Spec 8): JSON {answer, sources}, written on
-- every ask. NULL on rows logged before this column; those never get a page.
ALTER TABLE ask_log ADD COLUMN answer TEXT;
