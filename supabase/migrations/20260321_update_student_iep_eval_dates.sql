-- Migration: 20260321_update_student_iep_eval_dates
-- Purpose: Update students.iep_due and students.eval_due to match the master IEP CSV
--          (source of truth). Uses the earliest IEP Due and Eval Due dates across all
--          goal rows for each student per the authoritative CSV data.
--          Only updates students S001–S012 for which authoritative CSV dates are provided.

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
