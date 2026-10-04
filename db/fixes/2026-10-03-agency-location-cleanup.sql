-- 2026-10-03 SEO/data audit: duplicate agency names and location typos showed up
-- raw in the Archive filters and doc pages (hubs/map already merged them via
-- aliases). Canonical agency = the short code ingest's short_agency() writes
-- (DoW/CIA/DoS; the long name stays in agency_full) — the long-form rows are all
-- one 2026-07-24 06:55 import. Locations: war.gov source typos ("Westen",
-- "Bhutam"), Ladakh is in India (title: "Ladakh, Nepal, Sikkim and Bhutan"),
-- DOW-UAP-D098 is two films (Montana 1950, Utah 1952), not a place "Montana, Utah";
-- multi-place values use "; " like "Northeastern U.S.; Afghanistan".
-- Ingest is INSERT OR IGNORE, so re-ingest never reverts these. Apply:
--   cd crawler && python3 ../db/fixes/2026-10-03-agency-location-cleanup.py --apply
-- (applies this file, then re-stamps record_tldr.input_hash so TL;DRs/cards are not regenerated)
-- Revert: run the commented UPDATEs at the bottom.

UPDATE records SET agency='DoW' WHERE id IN ('DOW-UAP-D003','DOW-UAP-D004','DOW-UAP-D005','DOW-UAP-D006','DOW-UAP-D007','DOW-UAP-D008','DOW-UAP-D010','DOW-UAP-D012','DOW-UAP-D014','DOW-UAP-D016','DOW-UAP-D017','DOW-UAP-D018','DOW-UAP-D019','DOW-UAP-D020','DOW-UAP-D023','DOW-UAP-D025','DOW-UAP-D027','DOW-UAP-D028','DOW-UAP-D032','DOW-UAP-D033','DOW-UAP-D035','DOW-UAP-D038','DOW-UAP-D042','DOW-UAP-D044','DOW-UAP-D048','DOW-UAP-D049','DOW-UAP-D050','DOW-UAP-D051','DOW-UAP-D052','DOW-UAP-D054','DOW-UAP-D055','DOW-UAP-D056','DOW-UAP-D057','DOW-UAP-D058','DOW-UAP-D060','DOW-UAP-D061','DOW-UAP-D062','DOW-UAP-D063','DOW-UAP-D064','DOW-UAP-D065','DOW-UAP-D074','DOW-UAP-D075','DOW-UAP-D077','DOW-UAP-D078','DOW-UAP-D079','DOW-UAP-D080','DOW-UAP-D081','DOW-UAP-D082','DOW-UAP-D083','DOW-UAP-D085','DOW-UAP-D086','DOW-UAP-D087','DOW-UAP-D088','DOW-UAP-D089','DOW-UAP-D090','DOW-UAP-D091','DOW-UAP-D092','DOW-UAP-D093','DOW-UAP-D094','DOW-UAP-D095','DOW-UAP-D096','DOW-UAP-D097','DOW-UAP-PR019','DOW-UAP-PR020','DOW-UAP-PR021','DOW-UAP-PR022','DOW-UAP-PR023','DOW-UAP-PR026','DOW-UAP-PR027','DOW-UAP-PR031','DOW-UAP-PR032','DOW-UAP-PR033','DOW-UAP-PR034','DOW-UAP-PR035','DOW-UAP-PR036','western-us-event-slides-5-08-2026');
UPDATE records SET agency='CIA' WHERE id IN ('CIA-UAP-D001');
UPDATE records SET agency='DoS' WHERE id IN ('059uap00011','059uap00012','059uap00013','DOS-UAP-D001','DOS-UAP-D002','dos-uap-d1-cable-1-papua-new-guinea-january-1985','dos-uap-d2-cable-2-kazakhstan-january-1994');
UPDATE records SET location='Western United States' WHERE id IN ('DOW-UAP-D078','DOW-UAP-D079','DOW-UAP-D080','DOW-UAP-D081','DOW-UAP-D082','DOW-UAP-D083','WARGOV-FBI-UAP-D014_Digital-Rendering_Incident-1-1_Western-US-Ev');
UPDATE records SET location='Ladakh, India; Nepal; Sikkim, India; Bhutan' WHERE id IN ('CIA-UAP-016');
UPDATE records SET location='Montana; Utah' WHERE id IN ('DOW-UAP-D098');
UPDATE records SET location='Colorado Springs, Colorado' WHERE id IN ('FBI-UAP-D001','FBI-UAP-D002','FBI-UAP-D003','ICA-UAP-D001');
UPDATE records SET location='Low Earth Orbit' WHERE id IN ('NASA-UAP-D030','NASA-UAP-D031','NASA-UAP-D032');

-- UPDATE records SET agency='Department of War' WHERE id IN ('DOW-UAP-D003','DOW-UAP-D004','DOW-UAP-D005','DOW-UAP-D006','DOW-UAP-D007','DOW-UAP-D008','DOW-UAP-D010','DOW-UAP-D012','DOW-UAP-D014','DOW-UAP-D016','DOW-UAP-D017','DOW-UAP-D018','DOW-UAP-D019','DOW-UAP-D020','DOW-UAP-D023','DOW-UAP-D025','DOW-UAP-D027','DOW-UAP-D028','DOW-UAP-D032','DOW-UAP-D033','DOW-UAP-D035','DOW-UAP-D038','DOW-UAP-D042','DOW-UAP-D044','DOW-UAP-D048','DOW-UAP-D049','DOW-UAP-D050','DOW-UAP-D051','DOW-UAP-D052','DOW-UAP-D054','DOW-UAP-D055','DOW-UAP-D056','DOW-UAP-D057','DOW-UAP-D058','DOW-UAP-D060','DOW-UAP-D061','DOW-UAP-D062','DOW-UAP-D063','DOW-UAP-D064','DOW-UAP-D065','DOW-UAP-D074','DOW-UAP-D075','DOW-UAP-D077','DOW-UAP-D078','DOW-UAP-D079','DOW-UAP-D080','DOW-UAP-D081','DOW-UAP-D082','DOW-UAP-D083','DOW-UAP-D085','DOW-UAP-D086','DOW-UAP-D087','DOW-UAP-D088','DOW-UAP-D089','DOW-UAP-D090','DOW-UAP-D091','DOW-UAP-D092','DOW-UAP-D093','DOW-UAP-D094','DOW-UAP-D095','DOW-UAP-D096','DOW-UAP-D097','DOW-UAP-PR019','DOW-UAP-PR020','DOW-UAP-PR021','DOW-UAP-PR022','DOW-UAP-PR023','DOW-UAP-PR026','DOW-UAP-PR027','DOW-UAP-PR031','DOW-UAP-PR032','DOW-UAP-PR033','DOW-UAP-PR034','DOW-UAP-PR035','DOW-UAP-PR036','western-us-event-slides-5-08-2026');
-- UPDATE records SET agency='Central Intelligence Agency' WHERE id IN ('CIA-UAP-D001');
-- UPDATE records SET agency='Department of State' WHERE id IN ('059uap00011','059uap00012','059uap00013','DOS-UAP-D001','DOS-UAP-D002','dos-uap-d1-cable-1-papua-new-guinea-january-1985','dos-uap-d2-cable-2-kazakhstan-january-1994');
-- UPDATE records SET location='Westen United States' WHERE id IN ('DOW-UAP-D078','DOW-UAP-D079','DOW-UAP-D080','DOW-UAP-D081','DOW-UAP-D082','DOW-UAP-D083','WARGOV-FBI-UAP-D014_Digital-Rendering_Incident-1-1_Western-US-Ev');
-- UPDATE records SET location='Ladakh, Nepal | Sikkim, India | Bhutam' WHERE id IN ('CIA-UAP-016');
-- UPDATE records SET location='Montana, Utah' WHERE id IN ('DOW-UAP-D098');
-- UPDATE records SET location='Colorado Springs, Colorado, U.S.' WHERE id IN ('FBI-UAP-D001','FBI-UAP-D002','FBI-UAP-D003','ICA-UAP-D001');
-- UPDATE records SET location='Low-Earth Orbit' WHERE id IN ('NASA-UAP-D030','NASA-UAP-D031','NASA-UAP-D032');
