-- Snapshot ingest used a file's publication date as its incident date when it had none
-- (crawler/ingest/sources/snapshot.py, fixed), so reports, laws and hearings sorted as
-- 2023–2025 "incidents" under Archive's Oldest/Newest incident sort. Applied 2026-10-03:
--   npx wrangler d1 execute realufo-db --remote --env-file /dev/null --file db/fixes/2026-10-03-incident-not-pub-date.sql
-- Revert: run the commented UPDATEs at the bottom.

UPDATE records SET incident_date=NULL WHERE id IN (
  'NASA-uap-independent-study-team-final-report', 'NASA-UAPISTTermsofReference_Signed',
  'NASA-public-meeting-agenda-tagged', 'NASA-frn-uapist-public-meeting-tagged',
  'NARA-2024-NDAA-Public-Law-118-31', 'CONGRESS-CHRG-119hhrg61718');

-- UPDATE records SET incident_date='Sep 2023' WHERE id='NASA-uap-independent-study-team-final-report';
-- UPDATE records SET incident_date='Apr 2023' WHERE id='NASA-UAPISTTermsofReference_Signed';
-- UPDATE records SET incident_date='May 2023' WHERE id IN ('NASA-public-meeting-agenda-tagged','NASA-frn-uapist-public-meeting-tagged');
-- UPDATE records SET incident_date='Dec 22, 2023' WHERE id='NARA-2024-NDAA-Public-Law-118-31';
-- UPDATE records SET incident_date='Sep 2025' WHERE id='CONGRESS-CHRG-119hhrg61718';
