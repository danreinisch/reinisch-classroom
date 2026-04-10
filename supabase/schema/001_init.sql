-- Enable extensions
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- Storage bucket for uploads (metadata tracked in uploads table)
select storage.create_bucket('uploads', public => false);

-- Core tables
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- e.g., S001
  name text,
  class_id uuid references classes(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Store a bcrypt hash, not plaintext
create table if not exists student_passwords (
  student_id uuid primary key references students(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  code text not null,                      -- e.g., S001.11.1 or short code shown in UI
  desc text,
  target text,
  status text not null default 'Open',
  unique (student_id, code)
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due date,
  resource_url text,                       -- external link
  upload_path text,                        -- storage path in bucket uploads, optional
  goal_codes text[],                       -- optional: goal codes to auto-tie progress
  created_at timestamptz not null default now()
);

create table if not exists assignment_instances (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned','submitted','graded')),
  percent int check (percent between 0 and 100),
  unique (assignment_id, student_id)
);

create table if not exists progress_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  date date not null,
  percent int check (percent between 0 and 100),
  method text,
  by_name text,                            -- who added (Teacher or colleague)
  via text,                                -- system/manual/share
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  type text not null,                      -- IEP Meeting / Evaluation / etc.
  student_id uuid references students(id) on delete set null,
  date date,
  due date,
  notes text,
  created_at timestamptz not null default now()
);

-- Simple app-wide settings (optional, expand later if multi-user)
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Optional: notifications feed, if you want to persist them
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Basic RLS: allow authenticated users full access (we can tighten later)
alter table classes enable row level security;
alter table students enable row level security;
alter table student_passwords enable row level security;
alter table goals enable row level security;
alter table assignments enable row level security;
alter table assignment_instances enable row level security;
alter table progress_entries enable row level security;
alter table events enable row level security;
alter table settings enable row level security;
alter table notifications enable row level security;

-- Policies (bootstrap – refine per-role later)
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'classes','students','student_passwords','goals','assignments',
    'assignment_instances','progress_entries','events','settings','notifications'
  ]) loop
    execute format($f$  
      create policy if not exists %I_auth_sel on %I for select  
      using (auth.role() = 'authenticated');
    $f$, tbl||'_auth_sel', tbl);

    execute format($f$  
      create policy if not exists %I_auth_ins on %I for insert  
      with check (auth.role() = 'authenticated');
    $f$, tbl||'_auth_ins', tbl);

    execute format($f$  
      create policy if not exists %I_auth_upd on %I for update  
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
    $f$, tbl||'_auth_upd', tbl);

    execute format($f$  
      create policy if not exists %I_auth_del on %I for delete  
      using (auth.role() = 'authenticated');
    $f$, tbl||'_auth_del', tbl);
  end loop;
end $$;

-- Helper function to set a student's password (bcrypt)
create or replace function set_student_password(p_code text, p_plain text)
returns void language plpgsql as $$
declare
  sid uuid;
begin
  select id into sid from students where code = p_code;
  if sid is null then
    raise exception 'Student with code % not found', p_code;
  end if;

  insert into student_passwords (student_id, password_hash)
  values (sid, extensions.crypt(p_plain, extensions.gen_salt('bf')))
  on conflict (student_id) do update
    set password_hash = excluded.password_hash,
        updated_at = now();
end $$;

-- Check a student password; returns true/false
create or replace function verify_student_password(p_code text, p_plain text)
returns boolean language plpgsql as $$
declare
  hash text;
begin
  select sp.password_hash
  into hash
  from students s
  join student_passwords sp on sp.student_id = s.id
  where s.code = p_code;

  if hash is null then
    return false;
  end if;

  return hash = extensions.crypt(p_plain, hash);
end $$;