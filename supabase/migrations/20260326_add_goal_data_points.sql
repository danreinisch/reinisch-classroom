-- Migration: Add goal_data_points table for per-question IEP goal data capture
-- This supplements the existing goal_progress rollup table with individual
-- question-level detail (question text, choices, student answer, correct answer).

create table if not exists public.goal_data_points (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  assignment_instance_id uuid references public.assignment_instances(id) on delete set null,
  item_id bigint references public.assignment_items(id) on delete set null,
  question_text text,
  choices jsonb,
  student_answer text,
  correct_answer text,
  is_correct boolean,
  date date not null,
  source text not null default 'assignment' check (source in ('assignment', 'manual')),
  school_year text,
  created_at timestamptz not null default now()
);

-- Indexes for efficient querying
create index if not exists idx_goal_data_points_goal_id on public.goal_data_points(goal_id);
create index if not exists idx_goal_data_points_student_id on public.goal_data_points(student_id);
create index if not exists idx_goal_data_points_instance on public.goal_data_points(assignment_instance_id);
create index if not exists idx_goal_data_points_date on public.goal_data_points(date);
create index if not exists idx_goal_data_points_goal_student on public.goal_data_points(goal_id, student_id);

comment on table public.goal_data_points is 'Per-question IEP goal data points — supplementary detail alongside goal_progress rollups';
comment on column public.goal_data_points.choices is 'JSON array of possible answer choices, e.g. ["A) ...", "B) ...", "C) ..."]';
comment on column public.goal_data_points.student_answer is 'The answer key the student selected (e.g. "A")';
comment on column public.goal_data_points.correct_answer is 'The correct answer key (e.g. "C")';
comment on column public.goal_data_points.is_correct is 'Whether the student answered correctly';

-- RLS: allow service role full access; students may not read (data is surfaced via functions)
alter table public.goal_data_points enable row level security;

-- Allow the service role (used by Netlify functions) to insert and select
create policy "service role full access on goal_data_points"
  on public.goal_data_points
  as permissive
  for all
  to service_role
  using (true)
  with check (true);
