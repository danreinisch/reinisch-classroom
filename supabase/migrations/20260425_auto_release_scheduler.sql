-- Migration: Add auto-release scheduler columns to teacher_drafts
-- Adds server-side fields needed for the scheduled auto-release job.
-- All columns are nullable or have defaults so existing rows are unaffected.

ALTER TABLE public.teacher_drafts
  ADD COLUMN IF NOT EXISTS auto_release boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS auto_release_status text NOT NULL DEFAULT 'pending'
    CHECK (auto_release_status IN ('pending', 'issued', 'errored', 'disabled')),
  ADD COLUMN IF NOT EXISTS auto_release_error text NULL,
  ADD COLUMN IF NOT EXISTS auto_release_attempted_at timestamptz NULL;

-- Index to make the scheduler query cheap
CREATE INDEX IF NOT EXISTS idx_teacher_drafts_auto_release_due
  ON public.teacher_drafts (release_at)
  WHERE auto_release = true AND auto_release_status = 'pending' AND issued_at IS NULL;

-- Backfill existing rows: sensible defaults
-- Rows where auto_release = false → status = 'disabled'
-- Rows where auto_release = true (none yet, but future-safe) → leave as 'pending'
UPDATE public.teacher_drafts
  SET auto_release_status = 'disabled'
  WHERE auto_release = false;
