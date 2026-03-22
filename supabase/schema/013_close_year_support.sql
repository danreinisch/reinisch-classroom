-- No new tables needed for Close Year — all required infrastructure
-- (school_year columns, submission_archives, recall_library) already exists.
-- This migration adds indexes to speed up the year-end queries.

CREATE INDEX IF NOT EXISTS idx_submissions_school_year
  ON public.submissions(school_year);

CREATE INDEX IF NOT EXISTS idx_assignment_instances_school_year
  ON public.assignment_instances(school_year);

CREATE INDEX IF NOT EXISTS idx_goal_progress_school_year
  ON public.goal_progress(school_year);
