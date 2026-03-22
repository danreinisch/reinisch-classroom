-- Add school_year to submissions
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS school_year integer;

-- Backfill submissions from submitted_at
UPDATE public.submissions
SET school_year = CASE
  WHEN EXTRACT(MONTH FROM submitted_at) >= 8 THEN EXTRACT(YEAR FROM submitted_at)::integer
  ELSE (EXTRACT(YEAR FROM submitted_at) - 1)::integer
END
WHERE school_year IS NULL AND submitted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_school_year ON public.submissions(school_year);
COMMENT ON COLUMN public.submissions.school_year IS 'Academic year start (e.g., 2025 for 2025-2026). Derived from submitted_at.';

-- Add school_year to goal_progress
ALTER TABLE public.goal_progress ADD COLUMN IF NOT EXISTS school_year integer;

-- Backfill goal_progress from date column (which is a date, not timestamptz)
UPDATE public.goal_progress
SET school_year = CASE
  WHEN EXTRACT(MONTH FROM date) >= 8 THEN EXTRACT(YEAR FROM date)::integer
  ELSE (EXTRACT(YEAR FROM date) - 1)::integer
END
WHERE school_year IS NULL AND date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goal_progress_school_year ON public.goal_progress(school_year);
COMMENT ON COLUMN public.goal_progress.school_year IS 'Academic year start (e.g., 2025 for 2025-2026). Derived from date.';

-- Add school_year to submission_archives
ALTER TABLE public.submission_archives ADD COLUMN IF NOT EXISTS school_year integer;

-- Backfill submission_archives from submitted_at (or archived_at as fallback)
UPDATE public.submission_archives
SET school_year = CASE
  WHEN EXTRACT(MONTH FROM COALESCE(submitted_at, archived_at)) >= 8
    THEN EXTRACT(YEAR FROM COALESCE(submitted_at, archived_at))::integer
  ELSE (EXTRACT(YEAR FROM COALESCE(submitted_at, archived_at)) - 1)::integer
END
WHERE school_year IS NULL;

CREATE INDEX IF NOT EXISTS idx_submission_archives_school_year ON public.submission_archives(school_year);
COMMENT ON COLUMN public.submission_archives.school_year IS 'Academic year start (e.g., 2025 for 2025-2026). Stamped at archive time.';
