-- Migration: Ensure all goal-level columns exist on the goals table
-- Date: 2026-04-04
--
-- PURPOSE
-- -------
-- The Master Spreadsheet reads baseline, mastery, class_context, goal_area,
-- data_collector, data_collector_email, case_manager, measurement_type,
-- observation_config, and notes directly from the goals table.  If any of
-- these columns were missing (e.g. migrations applied out of order, or the
-- Supabase project was seeded from an older schema snapshot) those columns
-- would silently return NULL and appear blank in the spreadsheet.
--
-- This migration is idempotent: every statement uses ADD COLUMN IF NOT EXISTS,
-- so it is safe to re-run against a database that already has all columns.

-- ── Core IEP goal fields ─────────────────────────────────────────────────────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS goal_area text;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS case_manager text;

-- ── Baseline / mastery (text so values like "60%", "1/5" are preserved) ──────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS baseline text;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS mastery text;

-- ── Data-collection context ───────────────────────────────────────────────────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS class_context text;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS data_collector text;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS data_collector_email text;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS measurement_type text DEFAULT 'percent';

-- ── Observation / automation config ──────────────────────────────────────────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS observation_config jsonb DEFAULT NULL;

-- ── Teacher notes ─────────────────────────────────────────────────────────────
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS notes text;

-- ── Column comments ───────────────────────────────────────────────────────────
COMMENT ON COLUMN public.goals.goal_area          IS 'Goal area category for grouping (e.g., Reading, Math, Social Skills)';
COMMENT ON COLUMN public.goals.case_manager       IS 'Name of the case manager responsible for this goal';
COMMENT ON COLUMN public.goals.baseline           IS 'Baseline value from IEP (e.g., "60%", "1/5", "0/4")';
COMMENT ON COLUMN public.goals.mastery            IS 'Mastery/target value from IEP (e.g., "80%", "3/5", "2/4")';
COMMENT ON COLUMN public.goals.class_context      IS 'Class or setting where this goal is tracked (e.g., "Language Arts 3 SC")';
COMMENT ON COLUMN public.goals.data_collector     IS 'Name of the teacher who collects data for this goal';
COMMENT ON COLUMN public.goals.data_collector_email IS 'Email address of the data-collecting teacher';
COMMENT ON COLUMN public.goals.measurement_type   IS 'How progress is measured: Percent, Fraction, Number, etc.';
COMMENT ON COLUMN public.goals.observation_config IS 'JSON config for automated observation/data-entry integrations';
COMMENT ON COLUMN public.goals.notes              IS 'Teacher notes for this goal row (e.g., IEP meeting notes, context for changes)';
