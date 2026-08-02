-- RC-SEC-02B4
-- Make public.goal_progress and its quarterly aggregate view server-only.
--
-- Browser and external workflows must use authenticated Netlify Functions.
-- Student submission, Student Portal progress, external token entry,
-- teacher recall, close-year, and teacher goal-progress endpoints retain
-- access through the service role.

ALTER TABLE public.goal_progress
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.goal_progress
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  "Allow all access to goal_progress"
  ON public.goal_progress;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_progress
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_progress
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_progress
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.goal_progress
  TO service_role;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_progress_quarter_avg
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_progress_quarter_avg
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_progress_quarter_avg
  FROM authenticated;

GRANT SELECT
  ON TABLE public.goal_progress_quarter_avg
  TO service_role;

COMMENT ON TABLE public.goal_progress IS
  'Normalized IEP goal progress measurements. Server-only: browser roles have no direct table access.';

COMMENT ON COLUMN public.goal_progress.notes IS
  'Optional teacher-entered context for a progress measurement.';
