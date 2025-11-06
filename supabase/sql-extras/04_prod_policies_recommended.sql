-- Production-recommended RLS policies: Safer baseline for production use
-- Anon key: READ-only access (public listings)
-- Authenticated users: READ/WRITE access
-- Service role: FULL access (bypasses RLS)

-- Before applying: Drop any existing dev policies if they exist
-- You can run: drop policy if exists dev_all_select_classes on public.classes;
-- (repeat for all dev policies from 04_dev_policies_open.sql)

-- Enable RLS on all tables
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.goals enable row level security;
alter table public.progress_entries enable row level security;
alter table public.events enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_instances enable row level security;
alter table public.submissions enable row level security;

-- Classes: READ for anon, WRITE for authenticated
create policy anon_read_classes on public.classes 
  for select using (true);
create policy auth_write_classes on public.classes 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Students: READ for anon, WRITE for authenticated
create policy anon_read_students on public.students 
  for select using (true);
create policy auth_write_students on public.students 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Goals: READ for anon, WRITE for authenticated
create policy anon_read_goals on public.goals 
  for select using (true);
create policy auth_write_goals on public.goals 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Progress entries: READ for anon, WRITE for authenticated
create policy anon_read_progress on public.progress_entries 
  for select using (true);
create policy auth_write_progress on public.progress_entries 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Events: READ for anon, WRITE for authenticated
create policy anon_read_events on public.events 
  for select using (true);
create policy auth_write_events on public.events 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Assignments: READ for anon, WRITE for authenticated
create policy anon_read_assignments on public.assignments 
  for select using (true);
create policy auth_write_assignments on public.assignments 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Assignment instances: READ for anon, WRITE for authenticated
create policy anon_read_instances on public.assignment_instances 
  for select using (true);
create policy auth_write_instances on public.assignment_instances 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Submissions: READ for anon, WRITE for authenticated
create policy anon_read_submissions on public.submissions 
  for select using (true);
create policy auth_write_submissions on public.submissions 
  for all using (auth.role() = 'authenticated') 
  with check (auth.role() = 'authenticated');

-- Optional: Class enrollments (if using the table)
-- Uncomment if you've implemented the class_enrollments table
-- alter table public.class_enrollments enable row level security;
-- create policy anon_read_enrollments on public.class_enrollments 
--   for select using (true);
-- create policy auth_write_enrollments on public.class_enrollments 
--   for all using (auth.role() = 'authenticated') 
--   with check (auth.role() = 'authenticated');

-- Notes:
-- 1. Service role always bypasses RLS regardless of these policies
-- 2. For student-specific access, implement additional policies based on student_id matching
-- 3. For teacher-specific resources, add policies checking created_by or teacher_id columns
-- 4. These are baseline policies - customize based on your specific security requirements
