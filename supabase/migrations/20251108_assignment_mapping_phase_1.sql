-- Migration: Assignment Mapping Phase 1 - Per-Question Mapping and Scoring
-- Date: 2025-11-08
-- Description: Adds assignment_items, assignment_item_mappings, submission_answers tables
--              and views for goal/standard rollups. Supports HTML Package and TXT Quick Quiz
--              with immediate scoring and progress tracking.

-- ============================================================================
-- A) Extend assignments table with version lock support
-- ============================================================================
-- Add columns to track first submission and prevent mapping edits
alter table public.assignments
add column if not exists first_submission_at timestamptz,
add column if not exists version_locked boolean default false,
add column if not exists source_type text default 'portal' check (source_type in ('portal', 'google_form', 'import'));

comment on column public.assignments.first_submission_at is 'Timestamp of first student submission (locks mapping edits)';
comment on column public.assignments.version_locked is 'True after first submission to prevent mapping changes';
comment on column public.assignments.source_type is 'Assignment source: portal (HTML/TXT), google_form, or import';

-- ============================================================================
-- B) Create assignment_items table
-- ============================================================================
-- Stores per-question items with stable references and answer metadata
create table if not exists public.assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  item_ref text not null,                        -- Stable question reference (e.g., "Q1", "Q2")
  answer_type text not null check (answer_type in ('mcq', 'multi', 'boolean', 'constructed')),
  points numeric not null default 1 check (points >= 0),
  meta jsonb default '{}'::jsonb,                -- Correct answer, keywords, etc.
  created_at timestamptz not null default now(),
  unique (assignment_id, item_ref)
);

create index if not exists idx_assignment_items_assignment on public.assignment_items(assignment_id);
create index if not exists idx_assignment_items_ref on public.assignment_items(assignment_id, item_ref);

comment on table public.assignment_items is 'Per-question items for assignments with answer type and metadata (Phase 1)';
comment on column public.assignment_items.item_ref is 'Stable question reference from manifest (e.g., Q1, Q2)';
comment on column public.assignment_items.answer_type is 'Answer type: mcq, multi, boolean, or constructed';
comment on column public.assignment_items.points is 'Maximum points for this item';
comment on column public.assignment_items.meta is 'Answer metadata: correct answer, keywords, scoring config';

-- ============================================================================
-- C) Create assignment_item_mappings table
-- ============================================================================
-- Maps items to DESE standards and IEP goal codes
create table if not exists public.assignment_item_mappings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.assignment_items(id) on delete cascade,
  dese_codes text[] default array[]::text[],     -- Array of DESE standard codes
  goal_codes text[] default array[]::text[],     -- Array of IEP goal codes
  weight numeric default 1.0 check (weight >= 0 and weight <= 1),  -- Reserved for future; Phase 1 uses 1.0
  created_at timestamptz not null default now(),
  unique (item_id)
);

create index if not exists idx_assignment_item_mappings_item on public.assignment_item_mappings(item_id);

comment on table public.assignment_item_mappings is 'Maps assignment items to DESE standards and IEP goal codes (Phase 1)';
comment on column public.assignment_item_mappings.dese_codes is 'Array of DESE standard codes for this item';
comment on column public.assignment_item_mappings.goal_codes is 'Array of IEP goal codes for this item';
comment on column public.assignment_item_mappings.weight is 'Weight for partial credit (reserved; Phase 1 uses 1.0 for full credit)';

-- ============================================================================
-- D) Extend submissions table
-- ============================================================================
-- Add source_type if not exists
alter table public.submissions
add column if not exists source_type text default 'portal' check (source_type in ('portal', 'google_form', 'import'));

comment on column public.submissions.source_type is 'Submission source: portal, google_form, or import';

-- ============================================================================
-- E) Create submission_answers table
-- ============================================================================
-- Stores per-item answers and scoring results
create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  item_id uuid not null references public.assignment_items(id) on delete cascade,
  raw_answer jsonb,                              -- Student's raw answer (structure depends on answer_type)
  is_correct boolean,                            -- True if answer is correct
  earned_points numeric default 0 check (earned_points >= 0),
  max_points numeric default 0 check (max_points >= 0),
  created_at timestamptz not null default now(),
  unique (submission_id, item_id)
);

create index if not exists idx_submission_answers_submission on public.submission_answers(submission_id);
create index if not exists idx_submission_answers_item on public.submission_answers(item_id);

comment on table public.submission_answers is 'Per-item answers and scoring results for submissions (Phase 1)';
comment on column public.submission_answers.raw_answer is 'Student answer as JSONB (format depends on answer_type)';
comment on column public.submission_answers.is_correct is 'True if answer is correct (for Phase 1 binary scoring)';
comment on column public.submission_answers.earned_points is 'Points earned for this item';
comment on column public.submission_answers.max_points is 'Maximum possible points for this item';

-- ============================================================================
-- F) Create assignment_goal_rollups view
-- ============================================================================
-- Computes percent_correct per (submission, goal_code)
create or replace view public.assignment_goal_rollups as
select
  sa.submission_id,
  unnest(aim.goal_codes) as goal_code,
  round(
    (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
    1
  ) as percent_correct,
  sum(sa.earned_points) as total_earned,
  sum(sa.max_points) as total_possible,
  count(*) as item_count
from public.submission_answers sa
join public.assignment_items ai on ai.id = sa.item_id
join public.assignment_item_mappings aim on aim.item_id = ai.id
where cardinality(aim.goal_codes) > 0
group by sa.submission_id, goal_code;

comment on view public.assignment_goal_rollups is 'Per-goal percent_correct rollup for each submission (Phase 1)';

-- ============================================================================
-- G) Create assignment_standard_rollups view
-- ============================================================================
-- Computes percent_correct per (submission, dese_code)
create or replace view public.assignment_standard_rollups as
select
  sa.submission_id,
  unnest(aim.dese_codes) as dese_code,
  round(
    (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
    1
  ) as percent_correct,
  sum(sa.earned_points) as total_earned,
  sum(sa.max_points) as total_possible,
  count(*) as item_count
from public.submission_answers sa
join public.assignment_items ai on ai.id = sa.item_id
join public.assignment_item_mappings aim on aim.item_id = ai.id
where cardinality(aim.dese_codes) > 0
group by sa.submission_id, dese_code;

comment on view public.assignment_standard_rollups is 'Per-DESE-standard percent_correct rollup for each submission (Phase 1)';

-- ============================================================================
-- H) Enable RLS on new tables
-- ============================================================================
alter table public.assignment_items enable row level security;
alter table public.assignment_item_mappings enable row level security;
alter table public.submission_answers enable row level security;

-- For development: allow all authenticated users full access
create policy if not exists "Allow all for authenticated users"
  on public.assignment_items
  for all
  using (true)
  with check (true);

create policy if not exists "Allow all for authenticated users"
  on public.assignment_item_mappings
  for all
  using (true)
  with check (true);

create policy if not exists "Allow all for authenticated users"
  on public.submission_answers
  for all
  using (true)
  with check (true);

-- Migration complete
