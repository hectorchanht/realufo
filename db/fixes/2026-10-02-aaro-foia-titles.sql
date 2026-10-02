-- AARO FOIA reading-room files were titled with only their case number ("22 F 0863").
-- Descriptive titles written from each file's AI summary, prefixed "FOIA:"; the case
-- number stays in the record id. Applied 2026-10-02:
--   npx wrangler d1 execute realufo-db --remote --env-file /dev/null --file db/fixes/2026-10-02-aaro-foia-titles.sql
-- Revert: run the commented UPDATEs at the bottom.

UPDATE records SET title='FOIA: DoD emails coordinating the 2021 UAP Task Force report (June 2021)' WHERE id='AARO-22-F-0863';
UPDATE records SET title='FOIA: USD(I&S) goals for standing up AARO, July–December 2022' WHERE id='AARO-22-F-1364_1';
UPDATE records SET title='FOIA: AARO mission, vision and UAP analysis data needs' WHERE id='AARO-22-F-1364_2';
UPDATE records SET title='FOIA: AARO release (scanned, no extracted text)' WHERE id='AARO-22-F-1364_3';
UPDATE records SET title='FOIA: Avi Loeb email and article on Ukraine UAP "Phantoms" (October 2022)' WHERE id='AARO-23-F-0010';
UPDATE records SET title='FOIA: List of AARO UAP case serial numbers (December 2022)' WHERE id='AARO-23-F-0204';
UPDATE records SET title='FOIA: DoD position on the FY2023 NDAA UAP reporting provision (H.R. 7900 §1663)' WHERE id='AARO-23-F-0241';
UPDATE records SET title='FOIA: AARO release (scanned, no extracted text)' WHERE id='AARO-23-F-0740';
UPDATE records SET title='FOIA: Biography of AARO Director Dr. Sean Kirkpatrick' WHERE id='AARO-23-F-0922_1';
UPDATE records SET title='FOIA: AARO analysis of reported UAP altitudes, shapes and radar signatures' WHERE id='AARO-23-F-0922_2';
UPDATE records SET title='FOIA: AARO mission briefing slides (2023)' WHERE id='AARO-23-F-0922_3';
UPDATE records SET title='FOIA: Kirkpatrick statement to the Senate Armed Services subcommittee, 19 April 2023' WHERE id='AARO-23-F-0922_4';
UPDATE records SET title='FOIA: AARO release (scanned, no extracted text)' WHERE id='AARO-23-F-0949_1';
UPDATE records SET title='FOIA: Kirkpatrick email with the agenda for an FVEY UAP meeting (May 2023)' WHERE id='AARO-23-F-0949_2';
UPDATE records SET title='FOIA: Joint Staff GENADMIN message on UAP reporting procedures' WHERE id='AARO-23-F-1423';
UPDATE records SET title='FOIA: AARO release (scanned, no extracted text)' WHERE id='AARO-23-F-1486_1';
UPDATE records SET title='FOIA: Agenda and emails for the 24 May 2023 Pentagon UAP meeting with FVEY partners' WHERE id='AARO-23-F-1486_2';
UPDATE records SET title='FOIA: AARO memo on efforts to interview David Grusch' WHERE id='AARO-24-F-0250';
UPDATE records SET title='FOIA: AARO memo on June–November 2023 attempts to interview David Grusch' WHERE id='AARO-24-F-0266';
UPDATE records SET title='FOIA: AARO organizational chart, August 2024' WHERE id='AARO-24-F-0448';
UPDATE records SET title='FOIA: Media invitation to the embargoed AARO Historical Record Report roundtable (March 2024)' WHERE id='AARO-24-F-0922';
UPDATE records SET title='FOIA: Legal advisory for AARO oral history interviews' WHERE id='AARO-24-F-1138';
UPDATE records SET title='FOIA: Updated agenda for a UAP Caucus working group meeting (May 2023)' WHERE id='AARO-24-F-1426';
UPDATE records SET title='FOIA: AARO organizational chart, August 2024 (2025 release)' WHERE id='AARO-25-F-1218';
UPDATE records SET title='FOIA: Clearance request for AARO UAP reporting trends (November 2023)' WHERE id='AARO-25-F-3452_1';
UPDATE records SET title='FOIA: Clearance request for the AARO UAP self-reporting user guide (December 2023)' WHERE id='AARO-25-F-3452_2';
UPDATE records SET title='FOIA: Clearance request for Timothy Phillips'' biography (November 2023)' WHERE id='AARO-25-F-3452_3';

-- REVERT
-- UPDATE records SET title='22 F 0863' WHERE id='AARO-22-F-0863';
-- UPDATE records SET title='22 F 1364 1' WHERE id='AARO-22-F-1364_1';
-- UPDATE records SET title='22 F 1364 2' WHERE id='AARO-22-F-1364_2';
-- UPDATE records SET title='22 F 1364 3' WHERE id='AARO-22-F-1364_3';
-- UPDATE records SET title='23 F 0010' WHERE id='AARO-23-F-0010';
-- UPDATE records SET title='23 F 0204' WHERE id='AARO-23-F-0204';
-- UPDATE records SET title='23 F 0241' WHERE id='AARO-23-F-0241';
-- UPDATE records SET title='23 F 0740' WHERE id='AARO-23-F-0740';
-- UPDATE records SET title='23 F 0922 1' WHERE id='AARO-23-F-0922_1';
-- UPDATE records SET title='23 F 0922 2' WHERE id='AARO-23-F-0922_2';
-- UPDATE records SET title='23 F 0922 3' WHERE id='AARO-23-F-0922_3';
-- UPDATE records SET title='23 F 0922 4' WHERE id='AARO-23-F-0922_4';
-- UPDATE records SET title='23 F 0949 1' WHERE id='AARO-23-F-0949_1';
-- UPDATE records SET title='23 F 0949 2' WHERE id='AARO-23-F-0949_2';
-- UPDATE records SET title='23 F 1423' WHERE id='AARO-23-F-1423';
-- UPDATE records SET title='23 F 1486 1' WHERE id='AARO-23-F-1486_1';
-- UPDATE records SET title='23 F 1486 2' WHERE id='AARO-23-F-1486_2';
-- UPDATE records SET title='24 F 0250' WHERE id='AARO-24-F-0250';
-- UPDATE records SET title='24 F 0266' WHERE id='AARO-24-F-0266';
-- UPDATE records SET title='24 F 0448' WHERE id='AARO-24-F-0448';
-- UPDATE records SET title='24 F 0922' WHERE id='AARO-24-F-0922';
-- UPDATE records SET title='24 F 1138' WHERE id='AARO-24-F-1138';
-- UPDATE records SET title='24 F 1426' WHERE id='AARO-24-F-1426';
-- UPDATE records SET title='25 F 1218' WHERE id='AARO-25-F-1218';
-- UPDATE records SET title='25 F 3452 1' WHERE id='AARO-25-F-3452_1';
-- UPDATE records SET title='25 F 3452 2' WHERE id='AARO-25-F-3452_2';
-- UPDATE records SET title='25 F 3452 3' WHERE id='AARO-25-F-3452_3';
