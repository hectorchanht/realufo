-- Black pillar/letterbox bars inside a video's frame (e.g. a phone clip padded to 16:9), as
-- cropdetect's "w:h:x:y" on the `full` asset; '' = probed, no bars; NULL = not probed yet.
-- The Doc player shapes its panel to the crop and covers it, so only the picture shows.
ALTER TABLE assets ADD COLUMN crop TEXT;
