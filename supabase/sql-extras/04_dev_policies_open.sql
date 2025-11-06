-- Development-Only Permissive RLS Policies
-- ⚠️ WARNING: These policies are INSECURE and should ONLY be used in development
-- DO NOT apply these policies in production environments

-- These policies allow the anon role (used with anon key) to perform all operations
-- This is useful for rapid development but bypasses security controls

-- Enable RLS on all tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- Students: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_students_select ON students;
CREATE POLICY dev_anon_students_select ON students FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_students_insert ON students;
CREATE POLICY dev_anon_students_insert ON students FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_students_update ON students;
CREATE POLICY dev_anon_students_update ON students FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_students_delete ON students;
CREATE POLICY dev_anon_students_delete ON students FOR DELETE TO anon USING (true);

-- Goals: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_goals_select ON goals;
CREATE POLICY dev_anon_goals_select ON goals FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_goals_insert ON goals;
CREATE POLICY dev_anon_goals_insert ON goals FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_goals_update ON goals;
CREATE POLICY dev_anon_goals_update ON goals FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_goals_delete ON goals;
CREATE POLICY dev_anon_goals_delete ON goals FOR DELETE TO anon USING (true);

-- Progress Entries: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_progress_entries_select ON progress_entries;
CREATE POLICY dev_anon_progress_entries_select ON progress_entries FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_progress_entries_insert ON progress_entries;
CREATE POLICY dev_anon_progress_entries_insert ON progress_entries FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_progress_entries_update ON progress_entries;
CREATE POLICY dev_anon_progress_entries_update ON progress_entries FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_progress_entries_delete ON progress_entries;
CREATE POLICY dev_anon_progress_entries_delete ON progress_entries FOR DELETE TO anon USING (true);

-- Events: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_events_select ON events;
CREATE POLICY dev_anon_events_select ON events FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_events_insert ON events;
CREATE POLICY dev_anon_events_insert ON events FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_events_update ON events;
CREATE POLICY dev_anon_events_update ON events FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_events_delete ON events;
CREATE POLICY dev_anon_events_delete ON events FOR DELETE TO anon USING (true);

-- Assignments: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_assignments_select ON assignments;
CREATE POLICY dev_anon_assignments_select ON assignments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_assignments_insert ON assignments;
CREATE POLICY dev_anon_assignments_insert ON assignments FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_assignments_update ON assignments;
CREATE POLICY dev_anon_assignments_update ON assignments FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_assignments_delete ON assignments;
CREATE POLICY dev_anon_assignments_delete ON assignments FOR DELETE TO anon USING (true);

-- Assignment Instances: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_assignment_instances_select ON assignment_instances;
CREATE POLICY dev_anon_assignment_instances_select ON assignment_instances FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_assignment_instances_insert ON assignment_instances;
CREATE POLICY dev_anon_assignment_instances_insert ON assignment_instances FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_assignment_instances_update ON assignment_instances;
CREATE POLICY dev_anon_assignment_instances_update ON assignment_instances FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_assignment_instances_delete ON assignment_instances;
CREATE POLICY dev_anon_assignment_instances_delete ON assignment_instances FOR DELETE TO anon USING (true);

-- Submissions: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_submissions_select ON submissions;
CREATE POLICY dev_anon_submissions_select ON submissions FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_submissions_insert ON submissions;
CREATE POLICY dev_anon_submissions_insert ON submissions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_submissions_update ON submissions;
CREATE POLICY dev_anon_submissions_update ON submissions FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_submissions_delete ON submissions;
CREATE POLICY dev_anon_submissions_delete ON submissions FOR DELETE TO anon USING (true);

-- Classes: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_classes_select ON classes;
CREATE POLICY dev_anon_classes_select ON classes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_classes_insert ON classes;
CREATE POLICY dev_anon_classes_insert ON classes FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_classes_update ON classes;
CREATE POLICY dev_anon_classes_update ON classes FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_classes_delete ON classes;
CREATE POLICY dev_anon_classes_delete ON classes FOR DELETE TO anon USING (true);

-- Class Enrollments: Allow all operations for anon
DROP POLICY IF EXISTS dev_anon_class_enrollments_select ON class_enrollments;
CREATE POLICY dev_anon_class_enrollments_select ON class_enrollments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_class_enrollments_insert ON class_enrollments;
CREATE POLICY dev_anon_class_enrollments_insert ON class_enrollments FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS dev_anon_class_enrollments_update ON class_enrollments;
CREATE POLICY dev_anon_class_enrollments_update ON class_enrollments FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS dev_anon_class_enrollments_delete ON class_enrollments;
CREATE POLICY dev_anon_class_enrollments_delete ON class_enrollments FOR DELETE TO anon USING (true);
