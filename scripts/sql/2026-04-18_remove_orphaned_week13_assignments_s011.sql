-- =============================================================================
-- Date:        2026-04-18
-- Purpose:     Remove TWO orphaned Week 13 assignment instances for student
--              S011.  The original issuance produced an empty-meta row
--              (instance d2362c85, assignment 362).  A subsequent re-issuance
--              from the Teacher Center created a second empty-meta row
--              (instance 56aaf3a4, assignment 401) instead of repairing the
--              first.  Both orphaned records must be removed so the Student
--              Portal no longer shows a broken Week 13 assignment for S011.
--
-- Instance 1 (original issuance):
--   Instance ID:   d2362c85-40b5-4fd9-b36e-8898b95f1346
--   Assignment ID: 362
--
-- Instance 2 (re-issuance):
--   Instance ID:   56aaf3a4-7a42-4408-9a0b-2e03af6bf140
--   Assignment ID: 401
--
-- Student tab:  S011
-- Assignment title: WEEK 13 — LOST IN KRAGDON-AH (CHAPTERS 38–40)
--                   Cause and Effect — S011
--
-- Console errors (identical message, different IDs):
--   [student-portal] Assignment has no structured content (meta.days missing
--   or empty). This may indicate a content parsing failure during issuance or
--   an orphaned record.
--   Instance ID: d2362c85-40b5-4fd9-b36e-8898b95f1346  /  Assignment ID: 362
--   Instance ID: 56aaf3a4-7a42-4408-9a0b-2e03af6bf140  /  Assignment ID: 401
--
-- Instructions:
--   1. Open the Supabase SQL editor for the project.
--   2. Paste this entire file.
--   3. Run it as-is — the final statement is ROLLBACK, so the transaction is
--      always discarded on the first run. Inspect the SELECT preview output
--      in the results pane to confirm the correct rows are targeted.
--   4. When the SELECT results look correct, swap the last two lines:
--        comment out  -->  -- ROLLBACK;
--        uncomment    -->  COMMIT;
--      Then run again to permanently delete the rows.
--
-- Note: submissions.instance_id has ON DELETE CASCADE, so submissions would
--       be removed automatically when the instance is deleted. This script
--       deletes them explicitly so the SELECT preview shows them up-front.
--       goal_progress.assignment_instance_id and
--       goal_data_points.assignment_instance_id both use ON DELETE SET NULL,
--       so those rows are deleted explicitly here rather than left orphaned.
-- =============================================================================

BEGIN;

-- ── Constants ─────────────────────────────────────────────────────────────────
-- The CTE below centralises the target IDs for the SELECT preview.
-- Both orphaned instance IDs are listed here once; the IN (...) lists in the
-- DELETE statements below repeat the same literals (PostgreSQL CTEs are
-- statement-scoped and cannot span multiple statements — intentional by design).
WITH target (instance_id, assignment_id) AS (
  VALUES
    ('d2362c85-40b5-4fd9-b36e-8898b95f1346'::uuid, 362::bigint),
    ('56aaf3a4-7a42-4408-9a0b-2e03af6bf140'::uuid, 401::bigint)
)

-- ── 1. Preview: inspect the rows that will be affected ────────────────────────
-- Review this output before issuing COMMIT.
-- You should see up to 2 rows in assignment_instances (one per orphan) plus any
-- dependent rows in submissions, goal_progress, and goal_data_points.
SELECT
  'assignment_instances'        AS source_table,
  ai.id::text                   AS row_id,
  ai.assignment_id::text        AS assignment_id,
  ai.student_id::text           AS student_id,
  ai.status                     AS status,
  ai.due_at::text               AS due_at,
  ai.assigned_at::text          AS assigned_at
FROM public.assignment_instances ai
JOIN target t ON ai.id = t.instance_id

UNION ALL

SELECT
  'submissions'                 AS source_table,
  s.id::text                    AS row_id,
  s.instance_id::text           AS assignment_id,
  NULL                          AS student_id,
  s.review_status               AS status,
  NULL                          AS due_at,
  s.submitted_at::text          AS assigned_at
FROM public.submissions s
JOIN target t ON s.instance_id = t.instance_id

UNION ALL

SELECT
  'goal_progress'               AS source_table,
  gp.id::text                   AS row_id,
  gp.assignment_instance_id::text AS assignment_id,
  gp.student_id::text           AS student_id,
  NULL                          AS status,
  NULL                          AS due_at,
  gp.created_at::text           AS assigned_at
FROM public.goal_progress gp
JOIN target t ON gp.assignment_instance_id = t.instance_id

UNION ALL

SELECT
  'goal_data_points'            AS source_table,
  gdp.id::text                  AS row_id,
  gdp.assignment_instance_id::text AS assignment_id,
  gdp.student_id::text          AS student_id,
  NULL                          AS status,
  NULL                          AS due_at,
  gdp.created_at::text          AS assigned_at
FROM public.goal_data_points gdp
JOIN target t ON gdp.assignment_instance_id = t.instance_id;

-- ── 2. Delete dependent rows ──────────────────────────────────────────────────
-- The UUIDs below match the CTE constants above (PostgreSQL CTEs cannot span
-- multiple statements, so the literals are repeated — intentional by design).

-- 2a. goal_data_points (ON DELETE SET NULL — remove explicitly)
DELETE FROM public.goal_data_points
WHERE assignment_instance_id IN (
  'd2362c85-40b5-4fd9-b36e-8898b95f1346'::uuid,
  '56aaf3a4-7a42-4408-9a0b-2e03af6bf140'::uuid
);

-- 2b. goal_progress (ON DELETE SET NULL — remove explicitly)
DELETE FROM public.goal_progress
WHERE assignment_instance_id IN (
  'd2362c85-40b5-4fd9-b36e-8898b95f1346'::uuid,
  '56aaf3a4-7a42-4408-9a0b-2e03af6bf140'::uuid
);

-- 2c. submissions (ON DELETE CASCADE — removed explicitly for clarity)
DELETE FROM public.submissions
WHERE instance_id IN (
  'd2362c85-40b5-4fd9-b36e-8898b95f1346'::uuid,
  '56aaf3a4-7a42-4408-9a0b-2e03af6bf140'::uuid
);

-- ── 3. Delete the orphaned assignment instances ───────────────────────────────
-- This is idempotent: if a row no longer exists, DELETE affects 0 rows and
-- does not raise an error.
DELETE FROM public.assignment_instances
WHERE id IN (
  'd2362c85-40b5-4fd9-b36e-8898b95f1346'::uuid,
  '56aaf3a4-7a42-4408-9a0b-2e03af6bf140'::uuid
);

-- ── 4. Commit (or roll back) ──────────────────────────────────────────────────
-- Default is ROLLBACK so the first run is always a dry-run.
-- Verify the SELECT results above, then swap the comments and re-run to commit.
-- COMMIT;   -- uncomment this line and comment out ROLLBACK to apply permanently
ROLLBACK;    -- comment out this line when ready to apply
