-- Migration: Schema Reconciliation - Apply Missing Tables and Functions
-- Date: 2025-12-04
-- Description: Consolidated migration to bring production in sync with repo.
--              Includes tables and functions from pending migrations that have not
--              been applied to production yet.
-- 
-- This migration is IDEMPOTENT: running it multiple times will not cause errors
-- due to the use of "IF NOT EXISTS" and "CREATE OR REPLACE".
--
-- Source migrations included:
--   - 20251108_goal_progress_table.sql
--   - 20251108_phases_4_5_assignment_goal_mapping.sql
--   - 20251108_phase_6_8_saved_views.sql
--   - 20251108_portal_c_saved_views.sql
--   - supabase/schema/004_portal_b_resubmission.sql

-- ============================================================================
-- PART A: Goal Progress Table and Quarter Averages View (Phase 1)
-- ============================================================================

-- A1) Add goal_area column to goals table
alter table public.goals
add column if not exists goal_area text;

-- Index for faster goal area filtering
create index if not exists idx_goals_goal_area on public.goals(goal_area);

comment on column public.goals.goal_area is 'Goal area category for grouping (e.g., Reading, Math, Social Skills)';

-- A2) Create goal_progress table (normalized)
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

-- A3) Create goal_progress_quarter_avg view
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

-- A4) Enable RLS on goal_progress table
alter table public.goal_progress enable row level security;

-- For development: allow all authenticated users full access
create policy if not exists "Allow all for authenticated users"
  on public.goal_progress
  for all
  using (true)
  with check (true);

-- ============================================================================
-- PART B: Assignment-Goal Mapping and Progress Automation (Phases 4-5)
-- ============================================================================

-- B1) Create assignment_goal_map table
create table if not exists public.assignment_goal_map (
  id uuid primary key default gen_random_uuid(),
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  primary_goal boolean default false,
  created_at timestamptz not null default now(),
  unique (assignment_id, goal_id)
);

-- Indexes for efficient querying
create index if not exists idx_assignment_goal_map_assignment on public.assignment_goal_map(assignment_id);
create index if not exists idx_assignment_goal_map_goal on public.assignment_goal_map(goal_id);

comment on table public.assignment_goal_map is 'Maps assignments to IEP goals for automated progress tracking (Phase 4-5)';
comment on column public.assignment_goal_map.primary_goal is 'Indicates if this is the primary goal for this assignment (used for derived metrics)';

-- B2) Enable RLS on assignment_goal_map table
alter table public.assignment_goal_map enable row level security;

create policy if not exists "Allow all for authenticated users on assignment_goal_map"
  on public.assignment_goal_map
  for all
  using (true)
  with check (true);

-- B3) Create RPC function to record progress from submission
create or replace function public.record_progress_for_submission(p_instance_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_instance record;
  v_submission record;
  v_mapping record;
  v_progress_value numeric;
  v_inserted_count integer := 0;
  v_result jsonb;
begin
  -- Fetch assignment instance
  select * into v_instance
  from public.assignment_instances
  where id = p_instance_id;
  
  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Assignment instance not found',
      'inserted_count', 0
    );
  end if;
  
  -- Fetch latest submission for this instance
  select * into v_submission
  from public.submissions
  where instance_id = p_instance_id
  order by submitted_at desc
  limit 1;
  
  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'No submission found for this instance',
      'inserted_count', 0
    );
  end if;
  
  -- Derive progress value from submission scores
  -- Priority: score_auto > score_manual > score_total
  if v_submission.score_auto is not null then
    v_progress_value := v_submission.score_auto;
  elsif v_submission.score_manual is not null then
    v_progress_value := v_submission.score_manual;
  elsif v_submission.score_total is not null then
    v_progress_value := v_submission.score_total;
  else
    -- Try to compute from answers if available
    -- For now, return error if no score available
    return jsonb_build_object(
      'success', false,
      'error', 'No score available for submission',
      'inserted_count', 0
    );
  end if;
  
  -- Ensure value is in 0-100 range
  v_progress_value := greatest(0, least(100, v_progress_value));
  
  -- Loop through mapped goals and insert progress entries
  for v_mapping in
    select goal_id, primary_goal
    from public.assignment_goal_map
    where assignment_id = v_instance.assignment_id
  loop
    -- Insert or update goal_progress entry
    insert into public.goal_progress (
      goal_id,
      student_id,
      date,
      value,
      source,
      assignment_instance_id,
      collected_by
    ) values (
      v_mapping.goal_id,
      v_instance.student_id,
      coalesce(v_submission.submitted_at::date, current_date),
      v_progress_value,
      'assignment',
      p_instance_id,
      'system'
    )
    on conflict do nothing; -- Avoid duplicates if called multiple times
    
    v_inserted_count := v_inserted_count + 1;
  end loop;
  
  return jsonb_build_object(
    'success', true,
    'inserted_count', v_inserted_count,
    'progress_value', v_progress_value
  );
end;
$$;

comment on function public.record_progress_for_submission is 
  'Automatically creates goal_progress entries for all goals mapped to an assignment (Phase 4-5)';

-- ============================================================================
-- PART C: Saved Views for IEP Progress Grid (Phases 6-8)
-- ============================================================================

-- C1) Create progress_saved_views table
create table if not exists public.progress_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  config jsonb not null,
  is_default boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure unique view names per user
  unique (user_id, name)
);

-- Index for efficient querying by user
create index if not exists idx_progress_saved_views_user on public.progress_saved_views(user_id);

comment on table public.progress_saved_views is 'Saved filter/sort/group configurations for IEP Progress grid (Phase 6-8)';
comment on column public.progress_saved_views.config is 'JSONB containing filters, sorting, grouping, columns, and other view configuration';
comment on column public.progress_saved_views.is_default is 'Whether this is the default view to load for this user';

-- C2) Enable RLS on progress_saved_views table
alter table public.progress_saved_views enable row level security;

-- Policy: allow all for now (production should be more restrictive)
create policy if not exists "Allow all for authenticated users on progress_saved_views"
  on public.progress_saved_views
  for all
  using (true)
  with check (true);

-- C3) Updated_at trigger function (reusable)
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_progress_saved_views_updated_at on public.progress_saved_views;
create trigger update_progress_saved_views_updated_at
  before update on public.progress_saved_views
  for each row
  execute function public.update_updated_at_column();

-- ============================================================================
-- PART D: Saved Views for Student Portal (Portal C)
-- ============================================================================

-- D1) Create portal_saved_views table
create table if not exists public.portal_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_code text not null,
  name text not null,
  view_type text not null default 'assignments' check (view_type in ('assignments')),
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure unique view names per user
  unique (user_code, name, view_type)
);

-- Index for efficient querying by user
create index if not exists idx_portal_saved_views_user on public.portal_saved_views(user_code);
create index if not exists idx_portal_saved_views_type on public.portal_saved_views(view_type);

comment on table public.portal_saved_views is 'Saved filter/sort configurations for Student Portal Assignments (Portal C)';
comment on column public.portal_saved_views.config is 'JSONB containing filters (status/class/date range/score range/recency/type), sort order, and visibility toggles';
comment on column public.portal_saved_views.view_type is 'Type of view: assignments (extensible for future views like grades)';

-- D2) Enable RLS on portal_saved_views table
alter table public.portal_saved_views enable row level security;

create policy if not exists "Allow all for authenticated users on portal_saved_views"
  on public.portal_saved_views
  for all
  using (true)
  with check (true);

-- D3) Updated_at trigger
drop trigger if exists update_portal_saved_views_updated_at on public.portal_saved_views;
create trigger update_portal_saved_views_updated_at
  before update on public.portal_saved_views
  for each row
  execute function public.update_updated_at_column();

-- ============================================================================
-- PART E: Portal B Resubmission Support
-- ============================================================================

-- E1) Add resubmission_count to assignment_instances
alter table public.assignment_instances 
add column if not exists resubmission_count int not null default 0;

-- E2) Add resubmission fields to submissions table (if not already added)
-- Note: These columns are already in the schema dump, but including for completeness
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'submissions' 
      and column_name = 'original_submission_id'
  ) then
    alter table public.submissions
    add column original_submission_id uuid references submissions(id) on delete set null;
  end if;
  
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'submissions' 
      and column_name = 'submission_type'
  ) then
    alter table public.submissions
    add column submission_type text not null default 'initial' 
      check (submission_type in ('initial', 'resubmission'));
  end if;
end $$;

-- E3) Create indexes for resubmission queries
create index if not exists idx_submissions_original on public.submissions(original_submission_id);
create index if not exists idx_submissions_type on public.submissions(submission_type);
create index if not exists idx_assignment_instances_resubmission on public.assignment_instances(resubmission_count);

-- E4) RPC function to create a resubmission atomically
create or replace function public.create_resubmission(
  p_instance_id uuid,
  p_original_submission_id uuid,
  p_answers jsonb default '{}'::jsonb
)
returns uuid language plpgsql as $$
declare
  v_instance record;
  v_submission_id uuid;
begin
  -- Fetch and lock the instance row
  select * into v_instance
  from public.assignment_instances
  where id = p_instance_id
  for update;
  
  if not found then
    raise exception 'Assignment instance % not found', p_instance_id;
  end if;
  
  -- Check if resubmission is allowed (count < 1)
  if v_instance.resubmission_count >= 1 then
    raise exception 'Resubmission limit reached for instance %', p_instance_id;
  end if;
  
  -- Create new submission
  insert into public.submissions (
    instance_id,
    submission_type,
    original_submission_id,
    answers,
    submitted_at
  ) values (
    p_instance_id,
    'resubmission',
    p_original_submission_id,
    p_answers,
    now()
  )
  returning id into v_submission_id;
  
  -- Increment resubmission count
  update public.assignment_instances
  set 
    resubmission_count = resubmission_count + 1,
    status = 'Submitted'
  where id = p_instance_id;
  
  return v_submission_id;
end $$;

comment on function public.create_resubmission is 
  'Creates a resubmission for an assignment instance. Ensures atomic increment of resubmission_count and enforces limit of 1 resubmission.';

-- E5) Helper function to get latest submission for an instance
create or replace function public.get_latest_submission(p_instance_id uuid)
returns table(
  id uuid,
  instance_id uuid,
  submitted_at timestamptz,
  submission_type text,
  original_submission_id uuid,
  answers jsonb,
  score_auto numeric,
  score_manual numeric,
  score_total numeric,
  detail jsonb,
  notes text
) language sql stable as $$
  select 
    id,
    instance_id,
    submitted_at,
    submission_type,
    original_submission_id,
    answers,
    score_auto,
    score_manual,
    score_total,
    detail,
    notes
  from public.submissions
  where submissions.instance_id = p_instance_id
  order by submitted_at desc
  limit 1;
$$;

comment on function public.get_latest_submission is 
  'Returns the most recent submission (initial or resubmission) for an assignment instance.';

-- ============================================================================
-- PART F: Grant Permissions
-- ============================================================================

-- Grant access to new tables for all roles
grant all on public.goal_progress to anon, authenticated, service_role;
grant all on public.assignment_goal_map to anon, authenticated, service_role;
grant all on public.progress_saved_views to anon, authenticated, service_role;
grant all on public.portal_saved_views to anon, authenticated, service_role;

-- Grant access to new functions
grant execute on function public.record_progress_for_submission(uuid) to anon, authenticated, service_role;
grant execute on function public.create_resubmission(uuid, uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.get_latest_submission(uuid) to anon, authenticated, service_role;
grant execute on function public.update_updated_at_column() to anon, authenticated, service_role;

-- Migration complete
-- To apply: Run this SQL in the Supabase SQL editor or via psql
-- After applying, re-export schema: supabase db dump -f supabase:schema_full_dump.sql
