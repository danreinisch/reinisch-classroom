-- RC-SEC-02B4
-- Make public.goal_progress and its quarterly aggregate view server-only.
--
-- Browser and external workflows must use authenticated Netlify Functions.
-- Student submission, Student Portal progress, external token entry,
-- teacher recall, close-year, and teacher goal-progress endpoints retain
-- access through the service role.

ALTER TABLE public.goal_progress
  ADD COLUMN IF NOT EXISTS notes text;

-- Restore the canonical quarterly aggregate expected by the
-- authenticated teacher goal-progress endpoint. Production drifted
-- without this historical view even though the server contract retained it.
create or replace view public.goal_progress_quarter_avg as
select
  gp.goal_id,
  gp.student_id,
  -- Determine school year: if month >= 7, year stays same; else year - 1
  case
    when extract(month from gp.date) >= 7 then extract(year from gp.date)
    else extract(year from gp.date) - 1
  end as school_year,
  -- Determine quarter based on month
  case
    when extract(month from gp.date) in (7, 8, 9) then 'Q1'
    when extract(month from gp.date) in (10, 11, 12) then 'Q2'
    when extract(month from gp.date) in (1, 2, 3) then 'Q3'
    when extract(month from gp.date) in (4, 5, 6) then 'Q4'
    else 'Unknown'
  end as quarter,
  round(avg(gp.value), 1) as avg_value,
  count(*) as measurement_count,
  min(gp.date) as first_date,
  max(gp.date) as last_date
from public.goal_progress gp
group by gp.goal_id, gp.student_id, 3, 4;

COMMENT ON VIEW public.goal_progress_quarter_avg IS
  'Quarterly averages of goal progress. Quarter logic: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun (school year basis)';

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
