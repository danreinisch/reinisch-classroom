-- Migration: Add notes column to goals table
-- Date: 2026-04-04
--
-- PURPOSE
-- -------
-- Teachers need to attach context/notes to individual goal rows
-- (e.g., "parent requested increase," "discussed at IEP meeting 3/12").
-- This column provides a first-class notes field with multi-line support.
--
-- IDEMPOTENT: uses ADD COLUMN IF NOT EXISTS

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.goals.notes IS
  'Teacher notes for this goal row (e.g., IEP meeting notes, context for changes).';
