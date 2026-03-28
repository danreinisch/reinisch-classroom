-- Migration: Fix backfill column name and add authenticated RLS policy for goal_data_points
-- Date: 2026-03-28
--
-- BACKGROUND
-- ----------
-- The backfill migration 20260326_backfill_goal_data_points.sql was written referencing
-- sa.item_id, but the live submission_answers table uses assignment_item_id (the column
-- was renamed after the Phase 1 migration that originally created it as item_id).
-- The file has been corrected in-place, and this migration re-runs the backfill with the
-- correct column name so it is self-contained and idempotent.
--
-- NOTE: The rollup views in 20251108_assignment_mapping_phase_1.sql and
-- 20251109_student_manager_consolidated.sql also reference sa.item_id in their DDL.
-- Those views are already compiled in the live database against the actual schema and
-- work correctly. If those migrations are ever re-run on a fresh database where the
-- column is already assignment_item_id, they will fail — that is a known limitation of
-- the historical migration files and does not affect the current production database.

-- ── Part 1: Add authenticated SELECT policy ───────────────────────────────────────────
-- The TC data-adapter.js listGoalDataPoints() queries this table via the authenticated
-- Supabase client (not the service role). Without this policy, RLS silently blocks all
-- rows and listGoalDataPoints() returns empty arrays.

CREATE POLICY "authenticated users can read goal_data_points"
  ON public.goal_data_points
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- ── Part 2: Re-run backfill with corrected column name (idempotent) ───────────────────
-- Identical to 20260326_backfill_goal_data_points.sql but uses sa.assignment_item_id.
-- The NOT EXISTS guard makes this safe to re-run; no duplicates will be inserted.

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
JOIN public.assignment_items ai ON ai.id = sa.assignment_item_id
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
