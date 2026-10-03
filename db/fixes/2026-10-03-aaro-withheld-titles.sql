-- Two AARO FOIA files titled "AARO release (scanned, no extracted text)" by
-- 2026-10-02-aaro-foia-titles.sql are pages withheld in full: each page is a grey box whose
-- text layer gives only the page number and the FOIA exemption. Titles say so. Applied 2026-10-03:
--   npx wrangler d1 execute realufo-db --remote --env-file /dev/null --file db/fixes/2026-10-03-aaro-withheld-titles.sql
-- Revert: run the commented UPDATEs at the bottom.

UPDATE records SET title='FOIA: Pages 9–11 of 11 withheld in full under exemption (b)(5)' WHERE id='AARO-22-F-1364_3';
UPDATE records SET title='FOIA: Page 5 of 5 withheld in full under exemptions (b)(6) and (b)(3), 10 USC § 130c' WHERE id='AARO-23-F-0949_1';

-- UPDATE records SET title='FOIA: AARO release (scanned, no extracted text)' WHERE id IN ('AARO-22-F-1364_3','AARO-23-F-0949_1');
