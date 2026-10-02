-- Record/case comments can carry one uploaded image, like thread posts
-- (R2 key under uploads/, served via UPLOAD_BASE).
ALTER TABLE comments ADD COLUMN image_r2_key TEXT;
