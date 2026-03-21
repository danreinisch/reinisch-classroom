-- Migration: 20260321_quiz_submissions
-- Purpose: Create quiz_submissions table for HTML-based quiz assignments
-- loaded in sandboxed iframes (e.g. assignment 168 — Unit 5 Employment & Career Planning).
-- The iframe submits quiz results directly to Supabase using the anon key,
-- so RLS must allow anon inserts.

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.quiz_submissions (
  id            uuid        primary key default gen_random_uuid(),
  student_name  text        not null,
  unit          integer     not null,
  day           integer     not null,
  day_title     text,
  score         integer     not null,
  total         integer     not null,
  percentage    integer     not null check (percentage between 0 and 100),
  answers       jsonb       not null default '{}'::jsonb,
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.quiz_submissions enable row level security;

-- Allow anonymous inserts (the iframe submits with the anon key)
create policy "quiz_submissions_anon_insert"
  on public.quiz_submissions
  for insert
  to anon
  with check (true);

-- Allow authenticated staff/teachers to read all submissions
create policy "quiz_submissions_staff_select"
  on public.quiz_submissions
  for select
  using (public.is_staff());

-- Allow anon to read submissions (e.g. for in-page result display)
create policy "quiz_submissions_anon_select"
  on public.quiz_submissions
  for select
  to anon
  using (true);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_quiz_submissions_student
  on public.quiz_submissions (student_name);

create index if not exists idx_quiz_submissions_unit_day
  on public.quiz_submissions (unit, day);
