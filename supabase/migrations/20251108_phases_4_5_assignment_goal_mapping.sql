-- Migration: Assignment-Goal Mapping and Progress Automation (Phases 4-5)
-- Date: 2025-11-08
-- Description: Adds assignment_goal_map table and RPC for automated progress from submissions

-- ============================================================================
-- A) Create assignment_goal_map table
-- ============================================================================
-- Maps assignments to goals for automated progress tracking
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

-- ============================================================================
-- B) Enable RLS on assignment_goal_map table
-- ============================================================================
alter table public.assignment_goal_map enable row level security;

-- For development: allow all authenticated users full access
create policy if not exists "Allow all for authenticated users"
  on public.assignment_goal_map
  for all
  using (true)
  with check (true);

-- ============================================================================
-- C) Create RPC function to record progress from submission
-- ============================================================================
-- Called after submission to automatically create goal_progress entries
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

-- Migration complete
