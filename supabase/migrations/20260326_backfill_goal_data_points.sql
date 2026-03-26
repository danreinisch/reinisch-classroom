-- Migration: Backfill missing goal_data_points rows for submissions since go-live
-- Date: 2026-03-26
-- Fixes: goal_data_points table was created after existing submissions were processed;
--        this backfills per-question rows from submission_answers + assignment_items +
--        assignment_item_mappings + goals for all qualifying submissions.
--
-- This script is IDEMPOTENT: it only inserts rows where none already exist for a
-- given (assignment_instance_id, goal_id, item_id) triple. Safe to run multiple times.

INSERT INTO public.goal_data_points (
  goal_id,
  student_id,
  assignment_instance_id,
  item_id,
  question_text,
  choices,
  student_answer,
  correct_answer,
  is_correct,
  date,
  source,
  school_year
)
SELECT
  g.id                                                                      AS goal_id,
  ai_inst.student_id,
  s.instance_id                                                             AS assignment_instance_id,
  ai.id                                                                     AS item_id,
  ai.meta->>'text'                                                          AS question_text,
  ai.meta->'choices'                                                        AS choices,
  sa.raw_answer->>'value'                                                   AS student_answer,
  ai.meta->>'correct'                                                       AS correct_answer,
  sa.is_correct,
  COALESCE(s.submitted_at::date, CURRENT_DATE)                             AS date,
  'assignment'                                                              AS source,
  CASE
    WHEN EXTRACT(MONTH FROM COALESCE(s.submitted_at, NOW())) >= 8
      THEN EXTRACT(YEAR FROM COALESCE(s.submitted_at, NOW()))::text
    ELSE (EXTRACT(YEAR FROM COALESCE(s.submitted_at, NOW())) - 1)::text
  END                                                                       AS school_year
FROM public.submission_answers sa
JOIN public.assignment_items ai ON ai.id = sa.item_id
JOIN public.assignment_item_mappings aim ON aim.item_id = ai.id
JOIN public.submissions s ON s.id = sa.submission_id
JOIN public.assignment_instances ai_inst ON ai_inst.id = s.instance_id
JOIN public.goals g
  ON g.student_id = ai_inst.student_id
  AND g.code = ANY(aim.goal_codes)
-- Only process submissions since go-live
WHERE s.submitted_at >= '2026-03-23 00:00:00+00'
-- Only items that have at least one goal code mapped
  AND cardinality(aim.goal_codes) > 0
-- Idempotency: skip rows that already exist for this instance+goal+item
  AND NOT EXISTS (
    SELECT 1
    FROM public.goal_data_points gdp
    WHERE gdp.assignment_instance_id = s.instance_id
      AND gdp.goal_id = g.id
      AND gdp.item_id = ai.id
  );
