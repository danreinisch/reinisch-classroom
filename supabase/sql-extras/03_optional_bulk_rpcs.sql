-- Optional: Bulk upsert helpers for server-side use
-- These functions use SECURITY DEFINER to bypass RLS
-- Call from service role or authenticated context only

-- Bulk upsert students from JSON array
-- Example usage:
-- select public.bulk_upsert_students('[
--   {"code": "S001", "name": "Alice", "class_id": "uuid-here"},
--   {"code": "S002", "name": "Bob", "class_id": "uuid-here"}
-- ]'::jsonb);
create or replace function public.bulk_upsert_students(p_items jsonb)
returns jsonb
language plpgsql
security definer
as $$
begin
  insert into public.students(id, code, name, class_id)
  select
    coalesce((item->>'id')::uuid, gen_random_uuid()),
    item->>'code',
    nullif(item->>'name', ''),
    nullif(item->>'class_id', '')::uuid
  from jsonb_array_elements(p_items) as item
  on conflict (code) do update 
    set name = excluded.name, 
        class_id = excluded.class_id;
  
  return jsonb_build_object('status', 'ok', 'count', jsonb_array_length(p_items));
end $$;

-- Bulk upsert goals from JSON array
-- Example usage:
-- select public.bulk_upsert_goals('[
--   {"student_id": "uuid-here", "code": "G1", "desc": "Goal 1", "status": "Open"},
--   {"student_id": "uuid-here", "code": "G2", "desc": "Goal 2", "status": "Open"}
-- ]'::jsonb);
create or replace function public.bulk_upsert_goals(p_items jsonb)
returns jsonb
language plpgsql
security definer
as $$
begin
  insert into public.goals(id, student_id, code, desc, target, status)
  select
    coalesce((item->>'id')::uuid, gen_random_uuid()),
    (item->>'student_id')::uuid,
    item->>'code',
    item->>'desc',
    nullif(item->>'target', ''),
    coalesce(item->>'status', 'Open')
  from jsonb_array_elements(p_items) as item
  on conflict (student_id, code) do update 
    set desc = excluded.desc,
        target = excluded.target,
        status = excluded.status;
  
  return jsonb_build_object('status', 'ok', 'count', jsonb_array_length(p_items));
end $$;

-- Bulk insert progress entries from JSON array
-- Example usage:
-- select public.bulk_insert_progress('[
--   {"student_id": "uuid-here", "goal_id": "uuid-here", "date": "2024-01-15", "points": "3/5", "percent": 60},
--   {"student_id": "uuid-here", "goal_id": "uuid-here", "date": "2024-01-16", "points": "4/5", "percent": 80}
-- ]'::jsonb);
create or replace function public.bulk_insert_progress(p_items jsonb)
returns jsonb
language plpgsql
security definer
as $$
begin
  insert into public.progress_entries(student_id, goal_id, date, points, percent, method, by_name, via, notes)
  select
    (item->>'student_id')::uuid,
    nullif(item->>'goal_id', '')::uuid,
    (item->>'date')::date,
    coalesce(item->>'points', ''),
    (item->>'percent')::int,
    coalesce(item->>'method', ''),
    coalesce(item->>'by_name', 'Teacher'),
    coalesce(item->>'via', 'bulk-import'),
    coalesce(item->>'notes', '')
  from jsonb_array_elements(p_items) as item;
  
  return jsonb_build_object('status', 'ok', 'count', jsonb_array_length(p_items));
end $$;

-- Note: These functions should be called from server-side code or via service role
-- They bypass RLS, so ensure proper authorization before calling them
