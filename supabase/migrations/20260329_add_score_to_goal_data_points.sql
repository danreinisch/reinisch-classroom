-- Migration: Add score column to goal_data_points for percentage-based dot coloring
-- Date: 2026-03-29
--
-- PURPOSE
-- -------
-- Written response and constructed items are scored on a percentage scale
-- (earned_points / max_points * 100) rather than a binary correct/incorrect.
-- This column stores the computed percentage (0–100) so the frontend can render
-- colored SVG circle dots (red 0–59%, yellow 60–79%, blue 80–99%, green 100%)
-- instead of the binary check/X icons that are appropriate only for MCQ items.
--
-- IDEMPOTENT: uses IF NOT EXISTS / safe UPDATE pattern.

-- ── Part 1: Add score column ─────────────────────────────────────────────────
ALTER TABLE public.goal_data_points
  ADD COLUMN IF NOT EXISTS score numeric;

COMMENT ON COLUMN public.goal_data_points.score IS
  'Percentage score (0–100) computed from earned_points/max_points for constructed/written items; NULL for items scored only as boolean is_correct.';

-- ── Part 2: Backfill score from submission_answers ───────────────────────────
-- Join goal_data_points to submission_answers via (assignment_instance_id, item_id).
-- Only updates rows that have earned_points/max_points available and are not yet scored.
UPDATE public.goal_data_points gdp
SET score = ROUND((sa.earned_points::numeric / sa.max_points) * 100)
FROM public.submission_answers sa
JOIN public.submissions s ON s.id = sa.submission_id
WHERE gdp.assignment_instance_id = s.instance_id
  AND gdp.item_id = sa.assignment_item_id
  AND gdp.score IS NULL
  AND sa.earned_points IS NOT NULL
  AND sa.max_points IS NOT NULL
  AND sa.max_points > 0;
