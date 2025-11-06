-- Production-Recommended RLS Policies
-- These policies provide a safer baseline for production deployments
-- Customize based on your specific security requirements

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

-- Students: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_students_select ON students;
CREATE POLICY prod_anon_students_select ON students 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_students_all ON students;
CREATE POLICY prod_authenticated_students_all ON students 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Goals: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_goals_select ON goals;
CREATE POLICY prod_anon_goals_select ON goals 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_goals_all ON goals;
CREATE POLICY prod_authenticated_goals_all ON goals 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Progress Entries: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_progress_entries_select ON progress_entries;
CREATE POLICY prod_anon_progress_entries_select ON progress_entries 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_progress_entries_all ON progress_entries;
CREATE POLICY prod_authenticated_progress_entries_all ON progress_entries 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Events: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_events_select ON events;
CREATE POLICY prod_anon_events_select ON events 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_events_all ON events;
CREATE POLICY prod_authenticated_events_all ON events 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Assignments: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_assignments_select ON assignments;
CREATE POLICY prod_anon_assignments_select ON assignments 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_assignments_all ON assignments;
CREATE POLICY prod_authenticated_assignments_all ON assignments 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Assignment Instances: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_assignment_instances_select ON assignment_instances;
CREATE POLICY prod_anon_assignment_instances_select ON assignment_instances 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_assignment_instances_all ON assignment_instances;
CREATE POLICY prod_authenticated_assignment_instances_all ON assignment_instances 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Submissions: Anon can read own submissions, authenticated can read/write all
-- Note: This assumes you have a way to identify "own" submissions
-- Adjust the USING clause based on your authentication strategy
DROP POLICY IF EXISTS prod_anon_submissions_select ON submissions;
CREATE POLICY prod_anon_submissions_select ON submissions 
    FOR SELECT TO anon 
    USING (true);  -- Adjust: add logic to filter by student if needed

DROP POLICY IF EXISTS prod_authenticated_submissions_all ON submissions;
CREATE POLICY prod_authenticated_submissions_all ON submissions 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Classes: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_classes_select ON classes;
CREATE POLICY prod_anon_classes_select ON classes 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_classes_all ON classes;
CREATE POLICY prod_authenticated_classes_all ON classes 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Class Enrollments: Anon can read, authenticated can read/write
DROP POLICY IF EXISTS prod_anon_class_enrollments_select ON class_enrollments;
CREATE POLICY prod_anon_class_enrollments_select ON class_enrollments 
    FOR SELECT TO anon 
    USING (true);

DROP POLICY IF EXISTS prod_authenticated_class_enrollments_all ON class_enrollments;
CREATE POLICY prod_authenticated_class_enrollments_all ON class_enrollments 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Additional Security Considerations:
-- 1. Consider implementing student-specific policies using auth.uid() or custom claims
-- 2. Use service role key for admin operations in secure server environments
-- 3. Regularly audit RLS policies and access logs
-- 4. Implement rate limiting at the API gateway level
-- 5. Use Supabase Auth for user authentication instead of relying solely on RLS
