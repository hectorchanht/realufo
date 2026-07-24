-- Cold cases become discussion surfaces like records: a comment targets either
-- a record (record_id) or a case (case_slug).
ALTER TABLE comments ADD COLUMN case_slug TEXT;
CREATE INDEX idx_comments_case ON comments(case_slug);
