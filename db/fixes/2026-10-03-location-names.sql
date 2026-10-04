-- 2026-10-03 UI/UX audit (docs/audits/realufo-uiux-audit-2026-10-03.md): the Archive
-- location filter listed "INDOPACOM (1)" and "Indo-PACOM (1)" side by side, and a few
-- values broke the "City, State" / bare-region style the rest use. INDOPACOM matches
-- DOW-UAP-PR048's own title and the CENTCOM/NORTHCOM spelling. "Pacific Time Zone" and
-- "Gulf of America" are kept: they are the war.gov source's words.
-- Ingest is INSERT OR IGNORE, so re-ingest never reverts these. Apply (re-stamps TL;DR hashes):
--   cd crawler && python3 ../db/fixes/2026-10-03-agency-location-cleanup.py --apply ../db/fixes/2026-10-03-location-names.sql
-- Revert: run the commented UPDATEs at the bottom.

UPDATE records SET location='INDOPACOM' WHERE id IN ('DOW-UAP-PR048');
UPDATE records SET location='Detroit, Michigan' WHERE id IN ('65-hs1-101634279-100-de-18221-serial-844');
UPDATE records SET location='New Jersey' WHERE id IN ('FBI-UAP-D012');
UPDATE records SET location='Washington State' WHERE id IN ('FBI-UAP-D013');

-- UPDATE records SET location='Indo-PACOM' WHERE id IN ('DOW-UAP-PR048');
-- UPDATE records SET location='Detroit, MI' WHERE id IN ('65-hs1-101634279-100-de-18221-serial-844');
-- UPDATE records SET location='New Jersey, United States' WHERE id IN ('FBI-UAP-D012');
-- UPDATE records SET location='Washington State, United States' WHERE id IN ('FBI-UAP-D013');
