-- =============================================================================
-- Date:        2026-04-20
-- Purpose:     Pre-seed Day 1 (Questions 1–8) of Week 13 ("WEEK 13 — LOST IN
--              KRAGDON-AH (CHAPTERS 38–40) Cause and Effect") for 39 students.
--
-- What this script does
-- ─────────────────────
--  Group A (37 students — everyone except S007 and S024):
--    • Updates assignment_instances.settings to merge in an `answers` object
--      with all 8 Day 1 correct answers.
--    • Sets assignment_instances.status = 'In Progress'.
--    • Does NOT create a submissions row — the student submits themselves.
--
--  Group B (S007 and S024 — finalized at 75%):
--    • Updates assignment_instances.settings.answers with intentional misses
--      and sets status = 'Submitted'.
--    • Upserts one row into public.submissions (idempotent — updates in place
--      if a row already exists for the instance).
--    • Upserts 8 rows into public.submission_answers (one per Day 1 item).
--
-- item_ref format
-- ───────────────
-- The "VERIFICATION" SELECT at the top of this script shows the actual
-- item_ref values stored for the first Week 13 Kragdon assignment.  Run the
-- script once as a dry-run and inspect that result set BEFORE committing.
--
-- If the refs differ from 'Q1'…'Q8' (e.g. 'd1q1', 'day1_q1'), update every
-- occurrence of 'Q1'–'Q8' in the answers objects below accordingly, then
-- re-run the dry-run to confirm, and only then swap ROLLBACK → COMMIT.
--
-- Day 1 correct answers used in this script (same for every student):
--   Q1=A  Q2=B  Q3=C  Q4=TRUE  Q5=FALSE  Q6=FALSE  Q7=A  Q8=B
--
-- Intentional misses for Group B:
--   S007: Q3=A (wrong), Q7=C (wrong) — 6/8 correct = 75%
--   S024: Q4=FALSE (wrong), Q8=C (wrong) — 6/8 correct = 75%
--
-- Safety model (same as other scripts in this directory):
--   1. This entire script is wrapped in a transaction (BEGIN … ROLLBACK).
--   2. The final statement is ROLLBACK — the first run is ALWAYS a dry run.
--   3. Inspect every SELECT preview block in the results pane.
--   4. When the previews look correct, comment out ROLLBACK and uncomment
--      COMMIT at the bottom, then re-run to apply permanently.
--
-- Schema references verified at time of writing:
--   public.assignments          (bigint id, title text, ...)
--   public.assignment_instances (uuid id, assignment_id bigint,
--                                 student_id uuid, status text,
--                                 settings jsonb, assigned_at date)
--   public.assignment_items     (bigint id, assignment_id bigint,
--                                 item_ref text, answer_type text,
--                                 points numeric, meta jsonb)
--   public.students             (uuid id, code text)
--   public.submissions          (uuid id, instance_id uuid, answers jsonb,
--                                 score_auto numeric, score_total numeric,
--                                 source_type text, submission_type text,
--                                 school_year int [optional column],
--                                 submitted_at timestamptz)
--   public.submission_answers   (bigint id, submission_id uuid,
--                                 assignment_item_id bigint,
--                                 raw_answer jsonb, is_correct boolean,
--                                 earned_points numeric, max_points numeric,
--                                 scored_at timestamptz)
--   UNIQUE constraint on submission_answers: (submission_id, assignment_item_id)
--
-- school_year column: added by 20260322_add_school_year_columns.sql and
--   20260322_add_school_year_to_submissions_and_progress.sql.  This script
--   guards its use with information_schema checks so it degrades gracefully
--   if those migrations were not applied.
-- =============================================================================

BEGIN;

-- =============================================================================
-- VERIFICATION: item_ref format check
-- =============================================================================
-- Review this result set FIRST.  Confirm that the item_ref values for Day 1
-- are 'Q1' through 'Q8'.  If they differ, update every answers JSONB literal
-- in this file and re-run the dry-run before committing.
-- =============================================================================
SELECT
  ai.id             AS item_id,
  ai.item_ref       AS item_ref,
  ai.answer_type    AS answer_type,
  ai.points         AS points,
  ai.meta->>'correct' AS stored_correct_answer
FROM public.assignment_items ai
WHERE ai.assignment_id = (
  SELECT id
  FROM public.assignments
  WHERE title ILIKE 'WEEK 13%KRAGDON%'
  ORDER BY id
  LIMIT 1
)
ORDER BY ai.id
LIMIT 12;


-- =============================================================================
-- Section 0: Preview — 39 target instances
-- =============================================================================
-- Verify that exactly 39 rows are returned.
-- The `instance_count` column flags any student with more than one Week 13
-- instance (>1 means the most-recent one will be picked for writes).
-- =============================================================================
WITH week13 AS (
  SELECT id FROM public.assignments WHERE title ILIKE 'WEEK 13%KRAGDON%'
),
target_students AS (
  SELECT id, code
  FROM public.students
  WHERE code IN (
    'S001','S002','S003','S004','S005','S006','S007','S008','S009','S010',
    'S011','S013','S014','S015','S016','S017','S018','S019','S020','S022',
    'S023','S024','S025','S026','S027','S028','S031','S032','S033','S036',
    'S038','S039','S040','S041','S042','S043','S044','S045','S046'
  )
),
latest_instances AS (
  SELECT DISTINCT ON (ai.student_id)
    ai.id          AS instance_id,
    ai.assignment_id,
    ai.student_id,
    ai.status,
    ai.assigned_at
  FROM public.assignment_instances ai
  WHERE ai.assignment_id IN (SELECT id FROM week13)
    AND ai.student_id    IN (SELECT id FROM target_students)
  ORDER BY ai.student_id, ai.assigned_at DESC
)
SELECT
  li.instance_id,
  ts.code        AS student_code,
  a.title        AS assignment_title,
  li.status      AS current_status,
  li.assigned_at,
  (
    SELECT COUNT(*)
    FROM public.assignment_instances ai2
    WHERE ai2.assignment_id IN (SELECT id FROM week13)
      AND ai2.student_id = li.student_id
  ) AS instance_count   -- >1 = duplicate; most-recent will be targeted
FROM latest_instances li
JOIN target_students ts ON ts.id = li.student_id
JOIN public.assignments a  ON a.id = li.assignment_id
ORDER BY ts.code;


-- =============================================================================
-- Section 1: Preview — Group B answer objects (S007 and S024)
-- =============================================================================
-- Verify the intentional misses before writing.
-- =============================================================================
SELECT
  'S007'                            AS student_code,
  jsonb_build_object(
    'Q1', 'A',
    'Q2', 'B',
    'Q3', 'A',      -- INTENTIONAL MISS (correct = C)
    'Q4', 'TRUE',
    'Q5', 'FALSE',
    'Q6', 'FALSE',
    'Q7', 'C',      -- INTENTIONAL MISS (correct = A)
    'Q8', 'B'
  )                                 AS answers_preview,
  'Q3=A(wrong), Q7=C(wrong) → 6/8 = 75%' AS note
UNION ALL
SELECT
  'S024'                            AS student_code,
  jsonb_build_object(
    'Q1', 'A',
    'Q2', 'B',
    'Q3', 'C',
    'Q4', 'FALSE',  -- INTENTIONAL MISS (correct = TRUE)
    'Q5', 'FALSE',
    'Q6', 'FALSE',
    'Q7', 'A',
    'Q8', 'C'       -- INTENTIONAL MISS (correct = B)
  )                                 AS answers_preview,
  'Q4=FALSE(wrong), Q8=C(wrong) → 6/8 = 75%' AS note;


-- =============================================================================
-- WRITES
-- =============================================================================

-- ── Group A: 37 students → status = 'In Progress', pre-fill Day 1 answers ────
-- Students: everyone in the 39-student list EXCEPT S007 and S024.
-- Picks the most-recent Week 13 instance per student (DISTINCT ON assigned_at DESC).
-- Uses COALESCE(settings, '{}') || ... to preserve any existing settings keys.
-- Does NOT create a submissions row.
-- =============================================================================
WITH week13 AS (
  SELECT id FROM public.assignments WHERE title ILIKE 'WEEK 13%KRAGDON%'
),
group_a_students AS (
  SELECT id
  FROM public.students
  WHERE code IN (
    'S001','S002','S003','S004','S005','S006',
                                              'S008','S009','S010',
    'S011','S013','S014','S015','S016','S017','S018','S019','S020','S022',
    'S023',      'S025','S026','S027','S028','S031','S032','S033','S036',
    'S038','S039','S040','S041','S042','S043','S044','S045','S046'
  )
),
latest_instances AS (
  SELECT DISTINCT ON (ai.student_id)
    ai.id AS instance_id
  FROM public.assignment_instances ai
  WHERE ai.assignment_id IN (SELECT id FROM week13)
    AND ai.student_id    IN (SELECT id FROM group_a_students)
  ORDER BY ai.student_id, ai.assigned_at DESC
)
UPDATE public.assignment_instances ai
SET
  status   = 'In Progress',
  settings = COALESCE(settings, '{}'::jsonb)
             || jsonb_build_object(
                  'answers', jsonb_build_object(
                    'Q1', 'A',
                    'Q2', 'B',
                    'Q3', 'C',
                    'Q4', 'TRUE',
                    'Q5', 'FALSE',
                    'Q6', 'FALSE',
                    'Q7', 'A',
                    'Q8', 'B'
                  )
                )
WHERE ai.id IN (SELECT instance_id FROM latest_instances);


-- ── Group B — S007: status = 'Submitted', upsert submission + answers ─────────
DO $$
DECLARE
  v_instance_id     uuid;
  v_submission_id   uuid;
  v_assignment_id   bigint;
  v_answers         jsonb := jsonb_build_object(
    'Q1', 'A',
    'Q2', 'B',
    'Q3', 'A',      -- INTENTIONAL MISS (correct = C)
    'Q4', 'TRUE',
    'Q5', 'FALSE',
    'Q6', 'FALSE',
    'Q7', 'C',      -- INTENTIONAL MISS (correct = A)
    'Q8', 'B'
  );
  v_school_year     int;
  v_has_school_year boolean;
BEGIN
  -- Resolve the most-recent Week 13 instance for S007
  SELECT ai.id, ai.assignment_id
  INTO   v_instance_id, v_assignment_id
  FROM   public.assignment_instances ai
  JOIN   public.students s ON s.id = ai.student_id
  JOIN   public.assignments a ON a.id = ai.assignment_id
  WHERE  s.code = 'S007'
    AND  a.title ILIKE 'WEEK 13%KRAGDON%'
  ORDER  BY ai.assigned_at DESC
  LIMIT  1;

  IF v_instance_id IS NULL THEN
    RAISE NOTICE 'S007: no Week 13 Kragdon instance found — skipping';
    RETURN;
  END IF;

  -- Update instance
  UPDATE public.assignment_instances
  SET
    status   = 'Submitted',
    settings = COALESCE(settings, '{}'::jsonb)
               || jsonb_build_object('answers', v_answers)
  WHERE id = v_instance_id;

  -- Compute current school_year (Aug cutoff: month >= 8 → current year, else year-1)
  v_school_year := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 8 THEN EXTRACT(YEAR FROM now())::int
    ELSE (EXTRACT(YEAR FROM now()) - 1)::int
  END;

  -- Check whether the optional school_year column exists on submissions
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'submissions'
      AND column_name  = 'school_year'
  ) INTO v_has_school_year;

  -- Idempotent upsert: update in place if a row already exists, else insert
  SELECT id
  INTO   v_submission_id
  FROM   public.submissions
  WHERE  instance_id     = v_instance_id
    AND  submission_type = 'initial'
  ORDER  BY submitted_at ASC
  LIMIT  1;

  IF v_submission_id IS NOT NULL THEN
    -- Update existing submission
    UPDATE public.submissions
    SET
      answers      = v_answers,
      score_auto   = 75,
      score_total  = 75,
      submitted_at = now()
    WHERE id = v_submission_id;
    RAISE NOTICE 'S007: updated existing submission %', v_submission_id;
  ELSE
    -- Insert new submission (branch on optional school_year column)
    IF v_has_school_year THEN
      INSERT INTO public.submissions
        (instance_id, answers, score_auto, score_total,
         source_type, submission_type, school_year, submitted_at)
      VALUES
        (v_instance_id, v_answers, 75, 75,
         'portal', 'initial', v_school_year, now())
      RETURNING id INTO v_submission_id;
    ELSE
      INSERT INTO public.submissions
        (instance_id, answers, score_auto, score_total,
         source_type, submission_type, submitted_at)
      VALUES
        (v_instance_id, v_answers, 75, 75,
         'portal', 'initial', now())
      RETURNING id INTO v_submission_id;
    END IF;
    RAISE NOTICE 'S007: inserted new submission %', v_submission_id;
  END IF;

  -- Upsert submission_answers (one row per Day 1 item, joined by item_ref)
  -- is_correct uses UPPER(TRIM()) comparison to match the portal's scoring logic.
  INSERT INTO public.submission_answers
    (submission_id, assignment_item_id, raw_answer,
     is_correct, earned_points, max_points, scored_at)
  SELECT
    v_submission_id                                                   AS submission_id,
    ai.id                                                             AS assignment_item_id,
    to_jsonb(ans.student_answer)                                      AS raw_answer,
    UPPER(TRIM(ans.student_answer)) = UPPER(TRIM(ai.meta->>'correct')) AS is_correct,
    CASE
      WHEN UPPER(TRIM(ans.student_answer)) = UPPER(TRIM(ai.meta->>'correct'))
      THEN ai.points
      ELSE 0
    END                                                               AS earned_points,
    ai.points                                                         AS max_points,
    now()                                                             AS scored_at
  FROM public.assignment_items ai
  JOIN (VALUES
    ('Q1', 'A'),
    ('Q2', 'B'),
    ('Q3', 'A'),
    ('Q4', 'TRUE'),
    ('Q5', 'FALSE'),
    ('Q6', 'FALSE'),
    ('Q7', 'C'),
    ('Q8', 'B')
  ) AS ans(item_ref, student_answer) ON ans.item_ref = ai.item_ref
  WHERE ai.assignment_id = v_assignment_id
  ON CONFLICT (submission_id, assignment_item_id) DO UPDATE
    SET
      raw_answer    = EXCLUDED.raw_answer,
      is_correct    = EXCLUDED.is_correct,
      earned_points = EXCLUDED.earned_points,
      max_points    = EXCLUDED.max_points,
      scored_at     = EXCLUDED.scored_at;

END $$;


-- ── Group B — S024: status = 'Submitted', upsert submission + answers ─────────
DO $$
DECLARE
  v_instance_id     uuid;
  v_submission_id   uuid;
  v_assignment_id   bigint;
  v_answers         jsonb := jsonb_build_object(
    'Q1', 'A',
    'Q2', 'B',
    'Q3', 'C',
    'Q4', 'FALSE',  -- INTENTIONAL MISS (correct = TRUE)
    'Q5', 'FALSE',
    'Q6', 'FALSE',
    'Q7', 'A',
    'Q8', 'C'       -- INTENTIONAL MISS (correct = B)
  );
  v_school_year     int;
  v_has_school_year boolean;
BEGIN
  -- Resolve the most-recent Week 13 instance for S024
  SELECT ai.id, ai.assignment_id
  INTO   v_instance_id, v_assignment_id
  FROM   public.assignment_instances ai
  JOIN   public.students s ON s.id = ai.student_id
  JOIN   public.assignments a ON a.id = ai.assignment_id
  WHERE  s.code = 'S024'
    AND  a.title ILIKE 'WEEK 13%KRAGDON%'
  ORDER  BY ai.assigned_at DESC
  LIMIT  1;

  IF v_instance_id IS NULL THEN
    RAISE NOTICE 'S024: no Week 13 Kragdon instance found — skipping';
    RETURN;
  END IF;

  -- Update instance
  UPDATE public.assignment_instances
  SET
    status   = 'Submitted',
    settings = COALESCE(settings, '{}'::jsonb)
               || jsonb_build_object('answers', v_answers)
  WHERE id = v_instance_id;

  -- Compute current school_year (Aug cutoff)
  v_school_year := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 8 THEN EXTRACT(YEAR FROM now())::int
    ELSE (EXTRACT(YEAR FROM now()) - 1)::int
  END;

  -- Check whether the optional school_year column exists on submissions
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'submissions'
      AND column_name  = 'school_year'
  ) INTO v_has_school_year;

  -- Idempotent upsert: update in place if a row already exists, else insert
  SELECT id
  INTO   v_submission_id
  FROM   public.submissions
  WHERE  instance_id     = v_instance_id
    AND  submission_type = 'initial'
  ORDER  BY submitted_at ASC
  LIMIT  1;

  IF v_submission_id IS NOT NULL THEN
    UPDATE public.submissions
    SET
      answers      = v_answers,
      score_auto   = 75,
      score_total  = 75,
      submitted_at = now()
    WHERE id = v_submission_id;
    RAISE NOTICE 'S024: updated existing submission %', v_submission_id;
  ELSE
    IF v_has_school_year THEN
      INSERT INTO public.submissions
        (instance_id, answers, score_auto, score_total,
         source_type, submission_type, school_year, submitted_at)
      VALUES
        (v_instance_id, v_answers, 75, 75,
         'portal', 'initial', v_school_year, now())
      RETURNING id INTO v_submission_id;
    ELSE
      INSERT INTO public.submissions
        (instance_id, answers, score_auto, score_total,
         source_type, submission_type, submitted_at)
      VALUES
        (v_instance_id, v_answers, 75, 75,
         'portal', 'initial', now())
      RETURNING id INTO v_submission_id;
    END IF;
    RAISE NOTICE 'S024: inserted new submission %', v_submission_id;
  END IF;

  -- Upsert submission_answers
  INSERT INTO public.submission_answers
    (submission_id, assignment_item_id, raw_answer,
     is_correct, earned_points, max_points, scored_at)
  SELECT
    v_submission_id                                                   AS submission_id,
    ai.id                                                             AS assignment_item_id,
    to_jsonb(ans.student_answer)                                      AS raw_answer,
    UPPER(TRIM(ans.student_answer)) = UPPER(TRIM(ai.meta->>'correct')) AS is_correct,
    CASE
      WHEN UPPER(TRIM(ans.student_answer)) = UPPER(TRIM(ai.meta->>'correct'))
      THEN ai.points
      ELSE 0
    END                                                               AS earned_points,
    ai.points                                                         AS max_points,
    now()                                                             AS scored_at
  FROM public.assignment_items ai
  JOIN (VALUES
    ('Q1', 'A'),
    ('Q2', 'B'),
    ('Q3', 'C'),
    ('Q4', 'FALSE'),
    ('Q5', 'FALSE'),
    ('Q6', 'FALSE'),
    ('Q7', 'A'),
    ('Q8', 'C')
  ) AS ans(item_ref, student_answer) ON ans.item_ref = ai.item_ref
  WHERE ai.assignment_id = v_assignment_id
  ON CONFLICT (submission_id, assignment_item_id) DO UPDATE
    SET
      raw_answer    = EXCLUDED.raw_answer,
      is_correct    = EXCLUDED.is_correct,
      earned_points = EXCLUDED.earned_points,
      max_points    = EXCLUDED.max_points,
      scored_at     = EXCLUDED.scored_at;

END $$;


-- =============================================================================
-- Section 2: Post-write summary counts
-- =============================================================================
-- Expected after a successful run:
--   instances_in_progress   37
--   instances_submitted      2
--   submission_rows          2  (S007 + S024)
--   submission_answer_rows  16  (8 per Group B student)
-- =============================================================================
WITH week13 AS (
  SELECT id FROM public.assignments WHERE title ILIKE 'WEEK 13%KRAGDON%'
),
target_students AS (
  SELECT id
  FROM public.students
  WHERE code IN (
    'S001','S002','S003','S004','S005','S006','S007','S008','S009','S010',
    'S011','S013','S014','S015','S016','S017','S018','S019','S020','S022',
    'S023','S024','S025','S026','S027','S028','S031','S032','S033','S036',
    'S038','S039','S040','S041','S042','S043','S044','S045','S046'
  )
),
latest_instances AS (
  SELECT DISTINCT ON (ai.student_id)
    ai.id     AS instance_id,
    ai.status AS status
  FROM public.assignment_instances ai
  WHERE ai.assignment_id IN (SELECT id FROM week13)
    AND ai.student_id    IN (SELECT id FROM target_students)
  ORDER BY ai.student_id, ai.assigned_at DESC
)
SELECT 'instances_in_progress'   AS metric, COUNT(*) AS count
FROM latest_instances
WHERE status = 'In Progress'
UNION ALL
SELECT 'instances_submitted',    COUNT(*)
FROM latest_instances
WHERE status = 'Submitted'
UNION ALL
SELECT 'submission_rows',        COUNT(*)
FROM public.submissions s
WHERE s.instance_id IN (SELECT instance_id FROM latest_instances)
  AND s.submission_type = 'initial'
UNION ALL
SELECT 'submission_answer_rows', COUNT(*)
FROM public.submission_answers sa
WHERE sa.submission_id IN (
  SELECT s.id
  FROM public.submissions s
  WHERE s.instance_id IN (SELECT instance_id FROM latest_instances)
    AND s.submission_type = 'initial'
);


-- =============================================================================
-- Commit / Rollback
-- =============================================================================
-- Default is ROLLBACK — the first run is ALWAYS a dry run.
--
-- After reviewing:
--   • VERIFICATION block: item_refs are 'Q1'–'Q8' as expected
--   • Section 0: exactly 39 rows, all showing the correct assignments
--   • Section 1: S007 and S024 answers contain the intended misses
--   • Section 2: counts show 37 / 2 / 2 / 16
--   • NOTICE messages for S007 and S024 confirm insert vs. update
--
-- When everything looks correct:
--   1. Comment out the ROLLBACK line below.
--   2. Uncomment the COMMIT line below.
--   3. Re-run — this permanently applies all changes.
-- =============================================================================
-- COMMIT;   -- uncomment this line to APPLY permanently
ROLLBACK;    -- comment out this line when ready to commit
