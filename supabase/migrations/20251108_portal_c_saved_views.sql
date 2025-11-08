-- Migration: Saved Views for Student Portal (Portal C)
-- Date: 2025-11-08
-- Description: Add table for storing saved filter/sort configurations per student for the Assignments dashboard

-- ============================================================================
-- Create portal_saved_views table
-- ============================================================================
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

-- ============================================================================
-- Enable RLS on portal_saved_views table
-- ============================================================================
alter table public.portal_saved_views enable row level security;

-- Policy: Students can only access their own saved views
create policy if not exists "Students can view their own saved views"
  on public.portal_saved_views
  for select
  using (user_code = current_user);

create policy if not exists "Students can insert their own saved views"
  on public.portal_saved_views
  for insert
  with check (user_code = current_user);

create policy if not exists "Students can update their own saved views"
  on public.portal_saved_views
  for update
  using (user_code = current_user)
  with check (user_code = current_user);

create policy if not exists "Students can delete their own saved views"
  on public.portal_saved_views
  for delete
  using (user_code = current_user);

-- ============================================================================
-- Updated_at trigger (reuse existing function)
-- ============================================================================
drop trigger if exists update_portal_saved_views_updated_at on public.portal_saved_views;
create trigger update_portal_saved_views_updated_at
  before update on public.portal_saved_views
  for each row
  execute function public.update_updated_at_column();

-- Migration complete
