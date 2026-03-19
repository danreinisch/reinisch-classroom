-- fix_goal_codes.sql
-- Manual migration: correct known goal code errors in the goals table.
-- Run this script in the Supabase SQL editor (Dashboard > SQL Editor).
--
-- Background:
--   Several goal codes in the database do not match the current IEP spreadsheet.
--   This script corrects those codes so that the Student Portal and Teacher Center
--   display consistent, accurate goal identifiers.
--
-- IMPORTANT: Review each statement carefully before running.
--   Back up the goals table (or note the affected rows) before executing.
--   This script uses UPDATE statements that can be rolled back within the same
--   transaction if you wrap them in BEGIN / ROLLBACK first to preview.

-- ---------------------------------------------------------------------------
-- 1. S00911.2  →  S009.11.2  (missing dot between student code and IEP year)
-- ---------------------------------------------------------------------------
UPDATE goals
SET code = 'S009.11.2'
WHERE code = 'S00911.2';

-- ---------------------------------------------------------------------------
-- 2. S031.10.  →  two separate goals (trailing dot, split into two codes)
--    Run the first UPDATE, then manually verify/insert the second goal if it
--    does not already exist as a separate row.
-- ---------------------------------------------------------------------------

-- Rename the existing row to the first goal code
UPDATE goals
SET code = 'S031.10.1'
WHERE code = 'S031.10.';

-- If S031.10.2 does not yet exist, insert it (adjust desc/target/status as needed):
-- INSERT INTO goals (student_id, code, desc, target, status, active)
-- SELECT student_id, 'S031.10.2', '<Written Expression goal 2 description>', '<target>', 'Open', true
-- FROM goals WHERE code = 'S031.10.1';

-- ---------------------------------------------------------------------------
-- 3. Duplicate S015.11.4-1  →  second duplicate becomes S015.11.4-2
--    Identify the duplicate by created_at or id (the newer / second row).
-- ---------------------------------------------------------------------------
-- Preview which rows are duplicates:
-- SELECT id, code, desc, created_at FROM goals WHERE code = 'S015.11.4-1' ORDER BY created_at;

-- Update only the second (duplicate) row — replace <DUPLICATE_ROW_ID> with the actual UUID:
-- UPDATE goals SET code = 'S015.11.4-2' WHERE id = '<DUPLICATE_ROW_ID>';

-- ---------------------------------------------------------------------------
-- 4. Duplicate S033.10.4  →  renamed to S033.10.4-1 and S033.10.4-2
--    S033.10.4-1 = synonyms/antonyms goal
--    S033.10.4-2 = homophones goal
--    Identify each row by description before updating.
-- ---------------------------------------------------------------------------
-- Preview which rows are duplicates:
-- SELECT id, code, desc, created_at FROM goals WHERE code = 'S033.10.4' ORDER BY created_at;

-- Update the synonyms/antonyms row — replace <SYNONYMS_ROW_ID> with the actual UUID:
-- UPDATE goals SET code = 'S033.10.4-1' WHERE id = '<SYNONYMS_ROW_ID>';

-- Update the homophones row — replace <HOMOPHONES_ROW_ID> with the actual UUID:
-- UPDATE goals SET code = 'S033.10.4-2' WHERE id = '<HOMOPHONES_ROW_ID>';

-- ---------------------------------------------------------------------------
-- Verification queries (run after making updates):
-- ---------------------------------------------------------------------------
-- SELECT code, desc, status, active FROM goals WHERE code IN
--   ('S009.11.2','S031.10.1','S031.10.2','S015.11.4-1','S015.11.4-2',
--    'S033.10.4-1','S033.10.4-2')
-- ORDER BY code;
