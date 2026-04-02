-- Migration: 20260402_hub_submissions
-- Purpose: Create hub_submissions table for the assignment hub simple submission flow.
-- The assignment hub at /language-arts/assignment-hub/ collects student work (name +
-- optional written response + optional Drive link) outside the full student-portal flow.
-- The submissions-create Netlify function inserts into this table.

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.hub_submissions (
  id            uuid        primary key default gen_random_uuid(),
  assignment_id bigint      not null references public.assignments(id) on delete cascade,
  student_name  text        not null,
  content       text,
  content_url   text,
  school_year   integer,
  submitted_at  timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.hub_submissions enable row level security;

-- Service-role key (used by the submissions-create Netlify function) bypasses RLS,
-- so this insert policy is for completeness / future authenticated student access.
create policy "hub_submissions_service_insert"
  on public.hub_submissions
  for insert
  with check (true);

-- Teachers / staff can read all hub submissions.
create policy "hub_submissions_staff_select"
  on public.hub_submissions
  for select
  using (public.is_staff());

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_hub_submissions_assignment_id
  on public.hub_submissions (assignment_id);

create index if not exists idx_hub_submissions_school_year
  on public.hub_submissions (school_year);

create index if not exists idx_hub_submissions_student_name
  on public.hub_submissions (student_name);
