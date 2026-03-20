-- Migration: 20260320_fix_goal_desc_alignment
-- Purpose: Authoritatively correct the `desc`, `baseline`, and `mastery` columns
--          in the `goals` table to match the master IEP CSV (source of truth).
--
-- Background: After PR #781 and the earlier 20260320_fix_goal_descriptions migration,
-- goal descriptions are still misaligned in the database — the `desc` text stored
-- against certain goal codes does not match the master CSV. The most visible example
-- is S001 Written Expression subgoals S001.11.3-1 and S001.11.3-3 having their
-- descriptions swapped.
--
-- This migration is idempotent (UPDATE only, no INSERTs) and is safe to re-run.
-- It targets ONLY active goals (active = true) so archived/replaced goal versions
-- are left unchanged.
--
-- Source of truth: master IEP CSV (rows_001_004, rows_005_008, rows_009_012,
--                  rows_013_016 manifest chunks).

BEGIN;

-- ============================================================
-- S001 — 5 goals
-- ============================================================

-- S001.11.1 — Basic Reading
UPDATE public.goals g
SET "desc"   = 'S001 will increase his basic reading skills to read multi-syllabic (3 or more syllables) words with 80% accuracy by the next annual IEP.',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.1'
  AND g.active = true;

-- S001.11.2 — Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S001 will increase his reading comprehension skills by understanding context cues to define unknown words by using clues in the sentence or the surrounding sentences with 75% accuracy by the next annual IEP.',
    baseline = '42%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.2'
  AND g.active = true;

-- S001.11.3-1 — Written Expression (Add 1-2 details)
-- NOTE: This goal and S001.11.3-3 had their descriptions SWAPPED in the database.
--       The correct text for S001.11.3-1 is the "Add 1-2 details" variant.
UPDATE public.goals g
SET "desc"   = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Add 1-2 details to reinforce his topic sentence)',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-1'
  AND g.active = true;

-- S001.11.3-2 — Written Expression (Transition words)
UPDATE public.goals g
SET "desc"   = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Appropriate use and differentiated transition words)',
    baseline = '70%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-2'
  AND g.active = true;

-- S001.11.3-3 — Written Expression (Subject/verb agreement)
-- NOTE: This goal and S001.11.3-1 had their descriptions SWAPPED in the database.
--       The correct text for S001.11.3-3 is the "subject and verb agreement" variant.
UPDATE public.goals g
SET "desc"   = 'S001 will increase his written expression skills by writing two paragraphs using the objectives listed below with 80% accuracy by the next annual IEP. (Use correct subject and verb agreement in his written assignments).',
    baseline = '60%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S001'
  AND g.code = 'S001.11.3-3'
  AND g.active = true;

-- ============================================================
-- S002 — 2 goals
-- ============================================================

-- S002.11.1 — Written Expression
UPDATE public.goals g
SET "desc"   = 'S002 will increase her written expression skills by constructing a response with a claim, adding details, evidence and a conclusion with 80% accuracy.',
    baseline = '40%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S002'
  AND g.code = 'S002.11.1'
  AND g.active = true;

-- S002.11.2 — Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S002 will increase her reading comprehension skills by answering comprehension questions requiring higher order thinking skills ( making inferencing, evaluating information , analyzing text and supporting details) with a 70% accuracy.',
    baseline = '20%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S002'
  AND g.code = 'S002.11.2'
  AND g.active = true;

-- ============================================================
-- S003 — 1 goal
-- ============================================================

-- S003.11.1 — Written Expression
-- NOTE: The "50% accuracy" in the description text refers to the task-level accuracy
--       threshold written into the IEP goal itself. The baseline (65%) and mastery (80%)
--       columns are data-collection measurement values from the master CSV and are correct.
UPDATE public.goals g
SET "desc"   = 'In the area of Written Expression, S003 will increase these skills by including supporting details and conclusion sentence when writing a paragraph with 50% accuracy by the next annual IEP review.',
    baseline = '65%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S003'
  AND g.code = 'S003.11.1'
  AND g.active = true;

-- ============================================================
-- S004 — 4 goals
-- ============================================================

-- S004.11.1 — Behavior
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Behavior skills and will limit loud noises to no more than one occurrence per class period and, during brief teacher check-ins when needed, accept ownership for his behavior without making excuses, in 3 of 5 data collections.',
    baseline = '1/5',
    mastery  = '3/5'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.1'
  AND g.active = true;

-- S004.11.2 — Reading Comprehension
-- NOTE: "questioins" is verbatim from the master IEP CSV — this is the exact wording
--       in the student's IEP document and must not be silently corrected here.
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Reading Comprehension skills and will make an inference, answering WH questioins and predictions adapted text and support it with at least one piece of textual evidence with 70% by the next annual IEP review.',
    baseline = '53%',
    mastery  = '70%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.2'
  AND g.active = true;

-- S004.11.3 — Written Expression
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Written Expression skills and when given a prompt and organizer, S004 will compose a five-sentence paragraph (topic, three details, concluding sentence) that stays on topic, scoring at least 50% by the next annual IEP review.',
    baseline = '30%',
    mastery  = '50%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.3'
  AND g.active = true;

-- S004.11.4 — Math Calculation
UPDATE public.goals g
SET "desc"   = 'S004 will increase his Math Calculation skills by solving multi-step math problems by using the correct operations (addition, subtraction, multiplication, or division) without assistance with 60% accuracy by the next annual IEP review.',
    baseline = '40%',
    mastery  = '60%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S004'
  AND g.code = 'S004.11.4'
  AND g.active = true;

-- ============================================================
-- S005 — 2 goals
-- ============================================================

-- S005.11.1 — Written Expression
UPDATE public.goals g
SET "desc"   = 'S005 will increase his Written Expression skills by constructing a response with a claim, evidence, and a conclusion with 70% accuracy by the next annual IEP review.',
    baseline = '66%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S005'
  AND g.code = 'S005.11.1'
  AND g.active = true;

-- S005.11.2 — Reading Comprehension
UPDATE public.goals g
SET "desc"   = 'S005 will increase his Reading Comprehension by solving comprehension questions requiring higher-order thinking skills (such as inferencing, evaluating, and analyzing) with 80% accuracy by the next annual IEP review.',
    baseline = '67%',
    mastery  = '80%'
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S005'
  AND g.code = 'S005.11.2'
  AND g.active = true;

COMMIT;
