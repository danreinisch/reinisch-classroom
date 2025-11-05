-- Migration: App Users and Sub Plans
-- Date: 2025-11-05
-- Description: Introduce app_users table for unified authentication with bcrypt hashing,
--              sub_plans table for daily substitute instructions, and related RPCs.

-- Enable pgcrypto extension for bcrypt hashing
create extension if not exists pgcrypto;

-- ============================================================================
-- A) App Users Table
-- ============================================================================
-- Unified user table for students, teachers, substitutes, and admins
create table if not exists public.app_users (
  id bigserial primary key,
  username text not null unique,
  role text not null check (role in ('student', 'teacher', 'substitute', 'admin')),
  student_id bigint references public.students(id) on delete set null,
  password_hash text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for faster username lookups
create index if not exists idx_app_users_username on public.app_users(username);
create index if not exists idx_app_users_role on public.app_users(role);

-- ============================================================================
-- B) Sub Plans Table
-- ============================================================================
-- Daily substitute teacher instructions
create table if not exists public.sub_plans (
  id bigserial primary key,
  plan_date date not null unique,
  la_lesson text,
  la_book text,
  la_presentations text[], -- Array of presentation URLs/paths
  life_skills_topic text,
  life_skills_presentations text[], -- Array of presentation URLs/paths
  notes text,
  published boolean default false,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for faster date lookups
create index if not exists idx_sub_plans_date on public.sub_plans(plan_date);
create index if not exists idx_sub_plans_published on public.sub_plans(published);

-- ============================================================================
-- C) RPC: Set User Password (with bcrypt hashing)
-- ============================================================================
-- Upserts a user with a hashed password using bcrypt (pgcrypto)
-- Usage: select set_user_password('substitute', 'Winfield2025*', 'substitute');
create or replace function public.set_user_password(
  p_username text,
  p_password text,
  p_role text default 'student',
  p_student_id bigint default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id bigint;
  v_password_hash text;
begin
  -- Validate role
  if p_role not in ('student', 'teacher', 'substitute', 'admin') then
    raise exception 'Invalid role: %', p_role;
  end if;
  
  -- Generate bcrypt hash with cost factor 8 (adjustable)
  v_password_hash := crypt(p_password, gen_salt('bf', 8));
  
  -- Upsert user
  insert into public.app_users (username, role, student_id, password_hash)
  values (p_username, p_role, p_student_id, v_password_hash)
  on conflict (username) do update
  set 
    password_hash = excluded.password_hash,
    role = excluded.role,
    student_id = excluded.student_id,
    updated_at = now()
  returning id into v_user_id;
  
  return json_build_object(
    'success', true,
    'user_id', v_user_id,
    'username', p_username,
    'role', p_role
  );
end;
$$;

-- ============================================================================
-- D) RPC: Verify User Password
-- ============================================================================
-- Verifies username and password, returns user info on success
-- Usage: select * from verify_user_password('substitute', 'Winfield2025*');
create or replace function public.verify_user_password(
  p_username text,
  p_password text
)
returns table(
  username text,
  role text,
  student_id bigint,
  user_id bigint
)
language plpgsql
security definer
as $$
declare
  v_user record;
begin
  -- Find user by username
  select * into v_user
  from public.app_users
  where app_users.username = p_username;
  
  -- Check if user exists
  if not found then
    -- Return empty result
    return;
  end if;
  
  -- Verify password using bcrypt
  if v_user.password_hash = crypt(p_password, v_user.password_hash) then
    -- Password correct - return user info
    return query
    select 
      v_user.username,
      v_user.role,
      v_user.student_id,
      v_user.id as user_id;
  else
    -- Password incorrect - return empty result
    return;
  end if;
end;
$$;

-- ============================================================================
-- E) RPC: Sync App Users from Students (Optional Helper)
-- ============================================================================
-- Backfills app_users from existing students table
-- Default password is student code followed by exclamation mark (e.g., "S001!")
-- Usage: select sync_app_users_from_students();
create or replace function public.sync_app_users_from_students()
returns json
language plpgsql
security definer
as $$
declare
  v_student record;
  v_count integer := 0;
  v_password_hash text;
begin
  for v_student in select * from public.students loop
    -- Generate default password: student code + "!"
    v_password_hash := crypt(v_student.code || '!', gen_salt('bf', 8));
    
    -- Insert if not exists
    insert into public.app_users (username, role, student_id, password_hash)
    values (v_student.code, 'student', v_student.id, v_password_hash)
    on conflict (username) do nothing;
    
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  
  return json_build_object(
    'success', true,
    'synced_count', v_count,
    'message', format('Synced %s students to app_users', v_count)
  );
end;
$$;

-- ============================================================================
-- F) Seed Initial Users
-- ============================================================================
-- Seed substitute user with password Winfield2025*
select set_user_password('substitute', 'Winfield2025*', 'substitute', null);

-- Seed teacher user with placeholder password ChangeMe123!
select set_user_password('teacher', 'ChangeMe123!', 'teacher', null);

-- ============================================================================
-- G) Comments and Documentation
-- ============================================================================
comment on table public.app_users is 'Unified user authentication table for students, teachers, substitutes, and admins';
comment on column public.app_users.username is 'Unique username (student code for students)';
comment on column public.app_users.role is 'User role: student, teacher, substitute, or admin';
comment on column public.app_users.student_id is 'Foreign key to students table (for student role only)';
comment on column public.app_users.password_hash is 'Bcrypt password hash (never store plaintext)';

comment on table public.sub_plans is 'Daily substitute teacher instructions and lesson plans';
comment on column public.sub_plans.plan_date is 'Date for this substitute plan (unique)';
comment on column public.sub_plans.la_presentations is 'Array of Language Arts presentation URLs/paths';
comment on column public.sub_plans.life_skills_presentations is 'Array of Life Skills presentation URLs/paths';
comment on column public.sub_plans.published is 'Whether this plan is visible to substitutes';

comment on function public.set_user_password is 'Upserts a user with bcrypt-hashed password';
comment on function public.verify_user_password is 'Verifies username and password, returns user info on success';
comment on function public.sync_app_users_from_students is 'Backfills app_users from students table with default passwords';

-- Migration complete
