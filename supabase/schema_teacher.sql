-- 1) Base classes (seed per your needs)
create table if not exists public.classes (
  id bigserial primary key,
  name text not null unique
);

-- Suggested seed:
-- insert into public.classes (name) values
-- ('Life Skills Language Arts'), ('Language Arts 1'), ('Language Arts 2'),
-- ('Language Arts 3'), ('Language Arts 4'), ('Life Skills')
-- on conflict do nothing;

-- 2) Students and roster
create table if not exists public.students (
  id bigserial primary key,
  name text not null,
  class_id bigint references public.classes(id) on delete set null
);

-- 3) Assignments (HTML stored in Supabase Storage)
alter table if exists public.assignments
  add column if not exists storage_path text,
  add column if not exists public_url text,
  add column if not exists section text;

-- 4) Map assignments to classes (targets)
create table if not exists public.assignment_targets (
  assignment_id bigint references public.assignments(id) on delete cascade,
  class_id bigint references public.classes(id) on delete cascade,
  primary key (assignment_id, class_id)
);

-- 5) Standards (DESE) and IEP goals
create table if not exists public.standards (
  code text primary key,
  description text
);

create table if not exists public.iep_goals (
  id bigserial primary key,
  student_id bigint references public.students(id) on delete cascade,
  code text not null,
  description text
);

-- 6) Questions per assignment, tagged to standards and optionally IEP codes
create table if not exists public.assignment_questions (
  id bigserial primary key,
  assignment_id bigint references public.assignments(id) on delete cascade,
  text text not null,
  standard_code text references public.standards(code),
  iep_codes text[]   -- optional array of goal codes like {'IEP-READ-1'}
);

-- 7) Submissions, with optional per-question answers
alter table if exists public.submissions
  add column if not exists student_id bigint references public.students(id) on delete set null;

create table if not exists public.submission_answers (
  id bigserial primary key,
  submission_id bigint references public.submissions(id) on delete cascade,
  question_id bigint references public.assignment_questions(id) on delete cascade,
  answer_text text,
  correct boolean
);

-- Helpful indexes
create index if not exists idx_students_class on public.students(class_id);
create index if not exists idx_targets_class on public.assignment_targets(class_id);
create index if not exists idx_questions_assignment on public.assignment_questions(assignment_id);
create index if not exists idx_subs_assignment on public.submissions(assignment_id);

-- PostgREST: ensure REST sees new schema
notify pgrst, 'reload schema';
