-- Migration: Saved Views for IEP Progress Grid (Phases 6-8)
-- Date: 2025-11-08
-- Description: Add table for storing saved filter/sort/group configurations per user

-- ============================================================================
-- Create progress_saved_views table
-- ============================================================================
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

-- ============================================================================
-- Enable RLS on progress_saved_views table
-- ============================================================================
alter table public.progress_saved_views enable row level security;

-- Policy: Users can only access their own saved views
create policy if not exists "Users can view their own saved views"
  on public.progress_saved_views
  for select
  using (user_id = current_user);

create policy if not exists "Users can insert their own saved views"
  on public.progress_saved_views
  for insert
  with check (user_id = current_user);

create policy if not exists "Users can update their own saved views"
  on public.progress_saved_views
  for update
  using (user_id = current_user)
  with check (user_id = current_user);

create policy if not exists "Users can delete their own saved views"
  on public.progress_saved_views
  for delete
  using (user_id = current_user);

-- ============================================================================
-- Updated_at trigger
-- ============================================================================
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

-- Migration complete
