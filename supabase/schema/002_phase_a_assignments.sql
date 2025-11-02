-- Phase A: Assignment Management Schema
-- Prerequisites for Phase B (HTML uploader, Google Forms, etc.)

-- Create enum for assignment types
create type assignment_type as enum ('html', 'google_form');

-- Assignments table (Phase A)
create table if not exists assignments (
  id bigserial primary key,
  title text not null,
  type assignment_type not null default 'html',
  series text,                              -- e.g., "Language Arts"
  page text,                                -- URL or path to assignment page
  hero text,                                -- Hero image URL
  meta jsonb default '{}'::jsonb,           -- Extensible metadata (form_url, answer_key, etc.)
  created_by text,                          -- Teacher name
  created_at timestamptz not null default now()
);

-- Assignment instances (per-student assignments)
create table if not exists assignment_instances (
  id uuid primary key default gen_random_uuid(),
  assignment_id bigint not null references assignments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  due_at date,
  status text not null default 'Assigned' check (status in ('Assigned', 'In Progress', 'Submitted', 'Graded')),
  settings jsonb default '{}'::jsonb,       -- Instance-specific settings
  unique (assignment_id, student_id)
);

-- Submissions table
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references assignment_instances(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  answers jsonb default '{}'::jsonb,        -- Student answers
  score_auto numeric,                       -- Auto-graded score
  score_manual numeric,                     -- Manual score
  score_total numeric,                      -- Total score (computed or manual)
  detail jsonb default '{}'::jsonb,         -- Detailed results including per_goal breakdown
  notes text                                -- Grading notes
);

-- RPC function to process submission and create progress entries
create or replace function process_submission(p_submission_id uuid)
returns void language plpgsql as $$
declare
  v_submission record;
  v_instance record;
  v_student record;
  v_goal record;
  v_goal_code text;
  v_goal_score numeric;
  v_per_goal jsonb;
begin
  -- Fetch submission with instance and student info
  select s.*, ai.assignment_id, ai.student_id, ai.due_at
  into v_submission
  from submissions s
  join assignment_instances ai on ai.id = s.instance_id
  where s.id = p_submission_id;
  
  if not found then
    raise exception 'Submission % not found', p_submission_id;
  end if;
  
  -- Fetch student
  select * into v_student from students where id = v_submission.student_id;
  
  -- Extract per_goal breakdown from detail
  v_per_goal := coalesce(v_submission.detail->'per_goal', '{}'::jsonb);
  
  -- Create progress entries for each goal
  for v_goal_code, v_goal_score in
    select key, value::text::numeric
    from jsonb_each_text(v_per_goal)
  loop
    -- Find goal by code for this student
    select * into v_goal
    from goals
    where student_id = v_submission.student_id
      and code = v_goal_code
    limit 1;
    
    if found then
      -- Insert progress entry
      insert into progress_entries (
        student_id,
        goal_id,
        date,
        percent,
        method,
        by_name,
        via,
        notes
      ) values (
        v_submission.student_id,
        v_goal.id,
        current_date,
        v_goal_score::int,
        'Assignment',
        'System',
        'assignment',
        format('From submission %s', p_submission_id)
      );
    end if;
  end loop;
end $$;

-- Create indexes for performance
create index if not exists idx_assignments_type on assignments(type);
create index if not exists idx_assignments_created_at on assignments(created_at desc);
create index if not exists idx_assignment_instances_student on assignment_instances(student_id);
create index if not exists idx_assignment_instances_assignment on assignment_instances(assignment_id);
create index if not exists idx_assignment_instances_status on assignment_instances(status);
create index if not exists idx_submissions_instance on submissions(instance_id);

-- Enable RLS for new tables
alter table assignments enable row level security;
alter table assignment_instances enable row level security;
alter table submissions enable row level security;

-- RLS policies (authenticated access)
-- NOTE: These are basic policies for Phase A/B. In production, you should:
-- 1. Implement user-based access control (filter by created_by or organization)
-- 2. Add role-based permissions (teacher, admin, student)
-- 3. Restrict student access to only their own instances/submissions
-- Example production policy:
--   create policy assignments_teacher_sel on assignments for select
--     using (auth.uid() = created_by OR auth.jwt() ->> 'role' = 'admin');

create policy assignments_auth_sel on assignments for select
  using (auth.role() = 'authenticated');

create policy assignments_auth_ins on assignments for insert
  with check (auth.role() = 'authenticated');

create policy assignments_auth_upd on assignments for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy assignments_auth_del on assignments for delete
  using (auth.role() = 'authenticated');

create policy assignment_instances_auth_sel on assignment_instances for select
  using (auth.role() = 'authenticated');

create policy assignment_instances_auth_ins on assignment_instances for insert
  with check (auth.role() = 'authenticated');

create policy assignment_instances_auth_upd on assignment_instances for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy assignment_instances_auth_del on assignment_instances for delete
  using (auth.role() = 'authenticated');

create policy submissions_auth_sel on submissions for select
  using (auth.role() = 'authenticated');

create policy submissions_auth_ins on submissions for insert
  with check (auth.role() = 'authenticated');

create policy submissions_auth_upd on submissions for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy submissions_auth_del on submissions for delete
  using (auth.role() = 'authenticated');
