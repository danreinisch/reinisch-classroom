-- Migration: Backfill missing goal_progress rows for submissions since go-live
-- Date: 2026-03-25
-- Fixes: GitHub issue #880 — IEP goal progress not generated for assignments since 2026-03-23
--
-- Root cause: student-submit-answer.js read goal_codes from assignment_items directly
-- (often [] since PR #703 moved them to assignment_item_mappings), so auto-upsert
-- produced no goal_progress rows. Teacher finalization via handleSaveGrade() also
-- did not call triggerGoalProgressUpdates().
--
-- This script is IDEMPOTENT: it only inserts rows where none already exist for a
-- given (assignment_instance_id, goal_id) pair. It never modifies existing rows.
-- Safe to run multiple times.

-- ============================================================================
-- Backfill goal_progress for all qualifying submissions since go-live
-- ============================================================================

WITH latest_submissions AS (
  -- Use the most recent submission per instance (handles resubmissions correctly)
  SELECT DISTINCT ON (instance_id)
    id             AS submission_id,
    instance_id,
    submitted_at,
    review_status,
    score_auto
  FROM public.submissions
  WHERE submitted_at >= '2026-03-23 00:00:00+00'
  ORDER BY instance_id, submitted_at DESC NULLS LAST
),

target_submissions AS (
  -- Only include submissions that are fully graded (reviewed/finalized) or
  -- auto-scored MCQ assignments (instance status Submitted + score_auto set)
  -- AND have no goal_progress rows at all for the instance yet.
  SELECT
    ls.submission_id,
    ls.instance_id,
    ls.submitted_at,
    ai.student_id
  FROM latest_submissions ls
  JOIN public.assignment_instances ai ON ai.id = ls.instance_id
  WHERE (
    ls.review_status IN ('finalized', 'reviewed')
    OR (ai.status = 'Submitted' AND ls.score_auto IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.goal_progress gp
    WHERE gp.assignment_instance_id = ls.instance_id
  )
),

rollups AS (
  -- Use the assignment_goal_rollups view which correctly joins via
  -- assignment_item_mappings (the authoritative source of goal_codes since PR #703)
  SELECT
    ts.instance_id,
    ts.submitted_at,
    ts.student_id,
    agr.goal_code,
    agr.percent_correct
  FROM target_submissions ts
  JOIN public.assignment_goal_rollups agr ON agr.submission_id = ts.submission_id
  WHERE agr.percent_correct IS NOT NULL
)

INSERT INTO public.goal_progress (
  goal_id,
  student_id,
  date,
  value,
  source,
  collected_by,
  assignment_instance_id,
  school_year
)
SELECT
  g.id                                           AS goal_id,
  r.student_id,
  COALESCE(r.submitted_at::date, CURRENT_DATE)   AS date,
  r.percent_correct                              AS value,
  'assignment'                                   AS source,
  'backfill'                                     AS collected_by,
  r.instance_id                                  AS assignment_instance_id,
  CASE
    WHEN EXTRACT(MONTH FROM COALESCE(r.submitted_at, NOW())) >= 8
      THEN EXTRACT(YEAR FROM COALESCE(r.submitted_at, NOW()))::integer
    ELSE (EXTRACT(YEAR FROM COALESCE(r.submitted_at, NOW())) - 1)::integer
  END                                            AS school_year
FROM rollups r
JOIN public.goals g ON g.student_id = r.student_id
                   AND g.code = r.goal_code
-- Final idempotency guard: skip if a row for this instance+goal already exists
WHERE NOT EXISTS (
  SELECT 1
  FROM public.goal_progress gp
  WHERE gp.assignment_instance_id = r.instance_id
    AND gp.goal_id = g.id
);
