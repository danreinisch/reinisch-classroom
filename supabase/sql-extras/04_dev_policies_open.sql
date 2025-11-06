-- Development ONLY: Open RLS policies for quick testing with anon key
-- WARNING: These policies allow unrestricted read/write access
-- Use ONLY in development/testing environments
-- Never use in production!

-- Enable RLS on all tables
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.goals enable row level security;
alter table public.progress_entries enable row level security;
alter table public.events enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_instances enable row level security;
alter table public.submissions enable row level security;

-- Classes: full access
create policy dev_all_select_classes on public.classes 
  for select using (true);
create policy dev_all_modify_classes on public.classes 
  for all using (true) with check (true);

-- Students: full access
create policy dev_all_select_students on public.students 
  for select using (true);
create policy dev_all_modify_students on public.students 
  for all using (true) with check (true);

-- Goals: full access
create policy dev_all_select_goals on public.goals 
  for select using (true);
create policy dev_all_modify_goals on public.goals 
  for all using (true) with check (true);

-- Progress entries: full access
create policy dev_all_select_progress on public.progress_entries 
  for select using (true);
create policy dev_all_modify_progress on public.progress_entries 
  for all using (true) with check (true);

-- Events: full access
create policy dev_all_select_events on public.events 
  for select using (true);
create policy dev_all_modify_events on public.events 
  for all using (true) with check (true);

-- Assignments: full access
create policy dev_all_select_assignments on public.assignments 
  for select using (true);
create policy dev_all_modify_assignments on public.assignments 
  for all using (true) with check (true);

-- Assignment instances: full access
create policy dev_all_select_instances on public.assignment_instances 
  for select using (true);
create policy dev_all_modify_instances on public.assignment_instances 
  for all using (true) with check (true);

-- Submissions: full access
create policy dev_all_select_submissions on public.submissions 
  for select using (true);
create policy dev_all_modify_submissions on public.submissions 
  for all using (true) with check (true);

-- Optional: Class enrollments (if using the table)
-- Uncomment if you've implemented the class_enrollments table
-- alter table public.class_enrollments enable row level security;
-- create policy dev_all_select_enrollments on public.class_enrollments 
--   for select using (true);
-- create policy dev_all_modify_enrollments on public.class_enrollments 
--   for all using (true) with check (true);

-- To remove these policies and switch to production policies:
-- Run 04_prod_policies_recommended.sql or drop policies individually:
-- drop policy dev_all_select_classes on public.classes;
-- drop policy dev_all_modify_classes on public.classes;
-- (repeat for all tables)
