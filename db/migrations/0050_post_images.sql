-- Multiple attached images per comment/post. The first image keeps the legacy
-- image_r2_key slot (thread thumbs, feeds, social meta all read it); extra
-- images live here as a JSON array of R2 keys, in attach order.
-- Additive + nullable: safe to apply before the code that writes it ships.
ALTER TABLE comments ADD COLUMN extra_images TEXT;
ALTER TABLE posts ADD COLUMN extra_images TEXT;
