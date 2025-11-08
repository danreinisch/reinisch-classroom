-- Migration: Goal Progress Table and Quarter Averages View
-- Date: 2025-11-08
-- Description: Phase 1 - Add normalized goal_progress table for per-measurement tracking,
--              goal_area column to goals table, and quarterly average view.

-- ============================================================================
-- A) Add goal_area column to goals table
-- ============================================================================
-- Goal area for grouping (e.g., "Reading", "Math", "Social Skills", etc.)
alter table public.goals
add column if not exists goal_area text;

-- Index for faster goal area filtering
create index if not exists idx_goals_goal_area on public.goals(goal_area);

comment on column public.goals.goal_area is 'Goal area category for grouping (e.g., Reading, Math, Social Skills)';

-- ============================================================================
-- B) Create goal_progress table (normalized)
-- ============================================================================
-- Stores individual progress measurements instead of wide columns
create table if not exists public.goal_progress (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  date date not null,
  value numeric not null check (value >= 0 and value <= 100),
  source text not null default 'manual' check (source in ('manual', 'assignment', 'import')),
  assignment_instance_id uuid references public.assignment_instances(id) on delete set null,
  collected_by text,
  created_at timestamptz not null default now()
);

-- Indexes for efficient querying
create index if not exists idx_goal_progress_goal_date on public.goal_progress(goal_id, date);
create index if not exists idx_goal_progress_student_date on public.goal_progress(student_id, date);
create index if not exists idx_goal_progress_assignment_instance on public.goal_progress(assignment_instance_id);
create index if not exists idx_goal_progress_date on public.goal_progress(date);

comment on table public.goal_progress is 'Normalized progress measurements for IEP goals (Phase 1)';
comment on column public.goal_progress.value is 'Progress value as percentage (0-100)';
comment on column public.goal_progress.source is 'Data source: manual, assignment, or import';
comment on column public.goal_progress.collected_by is 'Username or name of person who collected this measurement';

-- ============================================================================
-- C) Create goal_progress_quarter_avg view
-- ============================================================================
-- Computes average progress per goal, student, and quarter
-- Quarter logic (placeholder - easily adjustable):
--   Q1: July-September (Jul=7, Aug=8, Sep=9)
--   Q2: October-December (Oct=10, Nov=11, Dec=12)
--   Q3: January-March (Jan=1, Feb=2, Mar=3)
--   Q4: April-June (Apr=4, May=5, Jun=6)
-- Note: This matches typical school year (starts in July/August)

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
group by gp.goal_id, gp.student_id, school_year, quarter;

comment on view public.goal_progress_quarter_avg is 'Quarterly averages of goal progress. Quarter logic: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun (school year basis)';

-- ============================================================================
-- D) Enable RLS on goal_progress table
-- ============================================================================
alter table public.goal_progress enable row level security;

-- For development: allow all authenticated users full access
-- (Production policies should be more restrictive)
create policy if not exists "Allow all for authenticated users"
  on public.goal_progress
  for all
  using (true)
  with check (true);

-- Migration complete
