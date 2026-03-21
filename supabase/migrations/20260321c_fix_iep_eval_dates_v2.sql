-- Migration: 20260321c_fix_iep_eval_dates_v2
-- Purpose: Update students.iep_due and students.eval_due to match the authoritative
--          master IEP CSV (v2_2025-2026_S2_CODE NAMES_STUDENT IEP GOALS AND CODES
--          (MASTER COPY)) for ALL active students S001–S045.
--          This supersedes 20260321_update_student_iep_eval_dates.sql which only
--          covered S001–S012. Students S029 and S030 are inactive and are skipped.
--
-- S001–S012: authoritative dates from the v2 master copy (as specified in the
--            problem statement; these differ from the legacy student-goals-latest.csv).
-- S013–S045: dates from student-goals-latest.csv (source of truth for these students).

-- S001–S012 (v2 master copy authoritative dates)
UPDATE public.students SET iep_due = '2027-02-05', eval_due = '2027-10-08' WHERE code = 'S001';
UPDATE public.students SET iep_due = '2026-09-18', eval_due = '2027-09-05' WHERE code = 'S002';
UPDATE public.students SET iep_due = '2027-01-22', eval_due = '2027-09-25' WHERE code = 'S003';
UPDATE public.students SET iep_due = '2027-01-19', eval_due = '2027-09-05' WHERE code = 'S004';
UPDATE public.students SET iep_due = '2027-01-14', eval_due = '2029-01-14' WHERE code = 'S005';
UPDATE public.students SET iep_due = '2026-10-19', eval_due = '2028-05-01' WHERE code = 'S006';
UPDATE public.students SET iep_due = '2027-02-11', eval_due = '2027-02-20' WHERE code = 'S007';
UPDATE public.students SET iep_due = '2027-02-04', eval_due = '2028-09-03' WHERE code = 'S008';
UPDATE public.students SET iep_due = '2027-02-18', eval_due = '2028-03-18' WHERE code = 'S009';
UPDATE public.students SET iep_due = '2027-02-16', eval_due = '2026-12-07' WHERE code = 'S010';
UPDATE public.students SET iep_due = '2027-02-18', eval_due = '2028-10-01' WHERE code = 'S011';
UPDATE public.students SET iep_due = '2026-05-22', eval_due = '2028-09-23' WHERE code = 'S012';

-- S013–S045 (student-goals-latest.csv)
UPDATE public.students SET iep_due = '2026-04-03', eval_due = '2027-02-08' WHERE code = 'S013';
UPDATE public.students SET iep_due = '2025-11-18', eval_due = '2027-02-01' WHERE code = 'S014';
UPDATE public.students SET iep_due = '2025-12-08', eval_due = '2026-02-20' WHERE code = 'S015';
UPDATE public.students SET iep_due = '2026-08-06', eval_due = '2028-05-18' WHERE code = 'S016';
UPDATE public.students SET iep_due = '2026-04-06', eval_due = '2027-04-03' WHERE code = 'S017';
UPDATE public.students SET iep_due = '2025-12-15', eval_due = '2026-01-25' WHERE code = 'S018';
UPDATE public.students SET iep_due = '2026-10-06', eval_due = '2027-09-30' WHERE code = 'S019';
UPDATE public.students SET iep_due = '2026-02-10', eval_due = '2028-08-21' WHERE code = 'S020';
UPDATE public.students SET iep_due = '2026-05-07', eval_due = '2028-05-07' WHERE code = 'S022';
UPDATE public.students SET iep_due = '2026-09-18', eval_due = '2027-03-21' WHERE code = 'S023';
UPDATE public.students SET iep_due = '2026-10-15', eval_due = '2028-04-16' WHERE code = 'S024';
UPDATE public.students SET iep_due = '2026-04-15', eval_due = '2026-09-12' WHERE code = 'S025';
UPDATE public.students SET iep_due = '2026-04-27', eval_due = '2026-01-23' WHERE code = 'S026';
UPDATE public.students SET iep_due = '2026-10-05', eval_due = '2027-09-18' WHERE code = 'S027';
UPDATE public.students SET iep_due = '2026-04-26', eval_due = '2027-11-12' WHERE code = 'S028';
UPDATE public.students SET iep_due = '2025-11-07', eval_due = '2026-10-31' WHERE code = 'S031';
UPDATE public.students SET iep_due = '2026-02-14', eval_due = '2027-04-02' WHERE code = 'S032';
UPDATE public.students SET iep_due = '2026-05-05', eval_due = '2028-05-04' WHERE code = 'S033';
UPDATE public.students SET iep_due = '2026-03-11', eval_due = '2026-02-01' WHERE code = 'S035';
UPDATE public.students SET iep_due = '2026-02-25', eval_due = '2027-11-14' WHERE code = 'S036';
UPDATE public.students SET iep_due = '2026-09-29', eval_due = '2026-11-15' WHERE code = 'S038';
UPDATE public.students SET iep_due = '2026-02-23', eval_due = '2026-02-12' WHERE code = 'S039';
UPDATE public.students SET iep_due = '2026-11-30', eval_due = '2028-11-09' WHERE code = 'S040';
UPDATE public.students SET iep_due = '2026-11-04', eval_due = '2028-11-04' WHERE code = 'S041';
UPDATE public.students SET iep_due = '2026-12-08', eval_due = '2026-04-05' WHERE code = 'S042';
UPDATE public.students SET iep_due = '2026-12-18', eval_due = '2028-02-12' WHERE code = 'S043';
UPDATE public.students SET iep_due = '2026-11-10', eval_due = '2027-10-14' WHERE code = 'S044';
UPDATE public.students SET iep_due = '2026-08-21', eval_due = '2029-01-15' WHERE code = 'S045';
