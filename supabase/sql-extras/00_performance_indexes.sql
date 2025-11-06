-- Performance indexes for classroom-scale traffic
-- Run this in SQL Editor to improve query performance on common lookup patterns

-- Students table: lookup by class
create index if not exists idx_students_class on public.students(class_id);

-- Goals table: lookup by student
create index if not exists idx_goals_student on public.goals(student_id);

-- Progress entries: common queries by student and date
create index if not exists idx_progress_student_date on public.progress_entries(student_id, date desc);
create index if not exists idx_progress_goal on public.progress_entries(goal_id);

-- Events: queries by student and date
create index if not exists idx_events_student_date on public.events(student_id, date desc);

-- Assignment instances: lookup by student and assignment
create index if not exists idx_assign_instances_student on public.assignment_instances(student_id);
create index if not exists idx_assign_instances_assignment on public.assignment_instances(assignment_id);

-- Submissions: lookup by instance
create index if not exists idx_submissions_instance on public.submissions(instance_id);

-- Optional: Class enrollments (if using the table)
-- Uncomment if you've implemented the class_enrollments table
-- create index if not exists idx_class_enrollments_student on public.class_enrollments(student_id);
-- create index if not exists idx_class_enrollments_class on public.class_enrollments(class_id);
