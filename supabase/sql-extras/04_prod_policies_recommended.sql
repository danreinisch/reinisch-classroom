-- Production RLS Policies (RECOMMENDED FOR PRODUCTION)
-- These policies implement role-based access control for teachers and students
-- Customize these policies based on your specific requirements

-- ================================================
-- Prerequisites
-- ================================================

-- Assumptions:
-- 1. User authentication is enabled (Supabase Auth)
-- 2. Users have a 'role' field in auth.users metadata (teacher/student)
-- 3. Students table has a 'user_id' column linking to auth.users
-- 4. Assignments/Classes may have a 'teacher_id' or 'created_by' column

-- ================================================
-- Helper Functions
-- ================================================

-- Get current user's role from auth.users metadata
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role')::text,
    'anonymous'
  );
$$ LANGUAGE sql STABLE;

-- Check if current user is a teacher
CREATE OR REPLACE FUNCTION is_teacher()
RETURNS boolean AS $$
  SELECT get_user_role() = 'teacher';
$$ LANGUAGE sql STABLE;

-- Check if current user is a student
CREATE OR REPLACE FUNCTION is_student()
RETURNS boolean AS $$
  SELECT get_user_role() = 'student';
$$ LANGUAGE sql STABLE;

-- ================================================
-- Enable RLS on All Tables
-- ================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- ================================================
-- Drop Existing Production Policies (if any)
-- ================================================

DROP POLICY IF EXISTS "teachers_read_all_students" ON students;
DROP POLICY IF EXISTS "students_read_own" ON students;
DROP POLICY IF EXISTS "teachers_manage_students" ON students;

DROP POLICY IF EXISTS "teachers_read_all_goals" ON goals;
DROP POLICY IF EXISTS "students_read_own_goals" ON goals;
DROP POLICY IF EXISTS "teachers_manage_goals" ON goals;

DROP POLICY IF EXISTS "teachers_read_all_progress" ON progress_entries;
DROP POLICY IF EXISTS "students_read_own_progress" ON progress_entries;
DROP POLICY IF EXISTS "teachers_manage_progress" ON progress_entries;

DROP POLICY IF EXISTS "teachers_read_all_events" ON events;
DROP POLICY IF EXISTS "students_read_own_events" ON events;
DROP POLICY IF EXISTS "teachers_manage_events" ON events;

DROP POLICY IF EXISTS "teachers_read_all_assignments" ON assignments;
DROP POLICY IF EXISTS "students_read_published_assignments" ON assignments;
DROP POLICY IF EXISTS "teachers_manage_own_assignments" ON assignments;

DROP POLICY IF EXISTS "teachers_read_all_instances" ON assignment_instances;
DROP POLICY IF EXISTS "students_read_own_instances" ON assignment_instances;
DROP POLICY IF EXISTS "teachers_manage_instances" ON assignment_instances;

DROP POLICY IF EXISTS "teachers_read_all_submissions" ON submissions;
DROP POLICY IF EXISTS "students_read_own_submissions" ON submissions;
DROP POLICY IF EXISTS "teachers_manage_submissions" ON submissions;
DROP POLICY IF EXISTS "students_create_own_submissions" ON submissions;

DROP POLICY IF EXISTS "teachers_read_all_classes" ON classes;
DROP POLICY IF EXISTS "students_read_enrolled_classes" ON classes;
DROP POLICY IF EXISTS "teachers_manage_classes" ON classes;

DROP POLICY IF EXISTS "teachers_read_all_enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "students_read_own_enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "teachers_manage_enrollments" ON class_enrollments;

-- ================================================
-- Students Table Policies
-- ================================================

-- Teachers can read all students
CREATE POLICY "teachers_read_all_students" ON students
  FOR SELECT
  USING (is_teacher());

-- Students can read their own data
CREATE POLICY "students_read_own" ON students
  FOR SELECT
  USING (is_student() AND auth.uid() = user_id);

-- Teachers can insert/update/delete students
CREATE POLICY "teachers_manage_students" ON students
  FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- ================================================
-- Goals Table Policies
-- ================================================

-- Teachers can read all goals
CREATE POLICY "teachers_read_all_goals" ON goals
  FOR SELECT
  USING (is_teacher());

-- Students can read their own goals
CREATE POLICY "students_read_own_goals" ON goals
  FOR SELECT
  USING (
    is_student() AND 
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers can manage goals
CREATE POLICY "teachers_manage_goals" ON goals
  FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- ================================================
-- Progress Entries Table Policies
-- ================================================

-- Teachers can read all progress
CREATE POLICY "teachers_read_all_progress" ON progress_entries
  FOR SELECT
  USING (is_teacher());

-- Students can read their own progress
CREATE POLICY "students_read_own_progress" ON progress_entries
  FOR SELECT
  USING (
    is_student() AND 
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers can manage progress
CREATE POLICY "teachers_manage_progress" ON progress_entries
  FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- ================================================
-- Events Table Policies
-- ================================================

-- Teachers can read all events
CREATE POLICY "teachers_read_all_events" ON events
  FOR SELECT
  USING (is_teacher());

-- Students can read their own events
CREATE POLICY "students_read_own_events" ON events
  FOR SELECT
  USING (
    is_student() AND 
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers can manage events
CREATE POLICY "teachers_manage_events" ON events
  FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- ================================================
-- Assignments Table Policies
-- ================================================

-- Teachers can read all assignments
CREATE POLICY "teachers_read_all_assignments" ON assignments
  FOR SELECT
  USING (is_teacher());

-- Students can read published assignments (or use custom field like 'published')
CREATE POLICY "students_read_published_assignments" ON assignments
  FOR SELECT
  USING (is_student());
  -- Add condition if you have a published flag:
  -- USING (is_student() AND (meta->>'published')::boolean = true);

-- Teachers can manage their own assignments
CREATE POLICY "teachers_manage_own_assignments" ON assignments
  FOR ALL
  USING (is_teacher() AND (created_by IS NULL OR created_by = (auth.jwt() -> 'user_metadata' ->> 'name')))
  WITH CHECK (is_teacher());

-- ================================================
-- Assignment Instances Table Policies
-- ================================================

-- Teachers can read all instances
CREATE POLICY "teachers_read_all_instances" ON assignment_instances
  FOR SELECT
  USING (is_teacher());

-- Students can read their own instances
CREATE POLICY "students_read_own_instances" ON assignment_instances
  FOR SELECT
  USING (
    is_student() AND 
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers can manage instances
CREATE POLICY "teachers_manage_instances" ON assignment_instances
  FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- ================================================
-- Submissions Table Policies
-- ================================================

-- Teachers can read all submissions
CREATE POLICY "teachers_read_all_submissions" ON submissions
  FOR SELECT
  USING (is_teacher());

-- Students can read their own submissions
CREATE POLICY "students_read_own_submissions" ON submissions
  FOR SELECT
  USING (
    is_student() AND 
    instance_id IN (
      SELECT id FROM assignment_instances 
      WHERE student_id IN (
        SELECT id FROM students WHERE user_id = auth.uid()
      )
    )
  );

-- Teachers can manage submissions (update scores, etc.)
CREATE POLICY "teachers_manage_submissions" ON submissions
  FOR UPDATE
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- Students can create their own submissions
CREATE POLICY "students_create_own_submissions" ON submissions
  FOR INSERT
  WITH CHECK (
    is_student() AND 
    instance_id IN (
      SELECT id FROM assignment_instances 
      WHERE student_id IN (
        SELECT id FROM students WHERE user_id = auth.uid()
      )
    )
  );

-- ================================================
-- Classes Table Policies
-- ================================================

-- Teachers can read all classes
CREATE POLICY "teachers_read_all_classes" ON classes
  FOR SELECT
  USING (is_teacher());

-- Students can read classes they're enrolled in
CREATE POLICY "students_read_enrolled_classes" ON classes
  FOR SELECT
  USING (
    is_student() AND 
    id IN (
      SELECT class_id FROM class_enrollments
      WHERE student_id IN (
        SELECT id FROM students WHERE user_id = auth.uid()
      )
    )
  );

-- Teachers can manage classes
CREATE POLICY "teachers_manage_classes" ON classes
  FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- ================================================
-- Class Enrollments Table Policies
-- ================================================

-- Teachers can read all enrollments
CREATE POLICY "teachers_read_all_enrollments" ON class_enrollments
  FOR SELECT
  USING (is_teacher());

-- Students can read their own enrollments
CREATE POLICY "students_read_own_enrollments" ON class_enrollments
  FOR SELECT
  USING (
    is_student() AND 
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers can manage enrollments
CREATE POLICY "teachers_manage_enrollments" ON class_enrollments
  FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- ================================================
-- Verification Query
-- ================================================

-- Verify all policies are active:
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ================================================
-- Testing Production Policies
-- ================================================

-- 1. Create test users with different roles:
--    - Teacher: user_metadata: { role: 'teacher', name: 'Ms. Johnson' }
--    - Student: user_metadata: { role: 'student' }

-- 2. Link students to auth users:
--    UPDATE students SET user_id = 'auth-user-id' WHERE code = 'S001';

-- 3. Test as teacher (use teacher's JWT):
--    - Can read all students, goals, progress
--    - Can create/update assignments
--    - Can manage enrollments

-- 4. Test as student (use student's JWT):
--    - Can only read own student record
--    - Can only read own goals and progress
--    - Can read assigned instances
--    - Can create own submissions

-- 5. Test as anonymous (no auth):
--    - Should not be able to access any data
--    - Verify 403 Forbidden responses

-- ================================================
-- Customization Notes
-- ================================================

-- 1. Adjust role checks based on your auth setup:
--    - If using custom claims, update get_user_role()
--    - If using a separate roles table, join appropriately

-- 2. Add teacher-specific student filtering:
--    - If teachers should only see their students:
--      CREATE POLICY ... USING (
--        is_teacher() AND student_id IN (
--          SELECT id FROM students WHERE teacher_id = auth.uid()
--        )
--      );

-- 3. Add class-based restrictions:
--    - If teachers should only see students in their classes:
--      USING (
--        is_teacher() AND class_id IN (
--          SELECT class_id FROM teacher_classes WHERE teacher_id = auth.uid()
--        )
--      );

-- 4. Add time-based restrictions:
--    - Prevent students from submitting after due date:
--      WITH CHECK (
--        is_student() AND (
--          SELECT due_at FROM assignment_instances WHERE id = instance_id
--        ) > NOW()
--      );

-- ================================================
-- Security Best Practices
-- ================================================

-- 1. Always test policies with real user accounts
-- 2. Use least privilege principle (grant minimum necessary access)
-- 3. Enable RLS on ALL tables (no exceptions)
-- 4. Monitor policy violations in Supabase logs
-- 5. Regularly audit policies as requirements change
-- 6. Use WITH CHECK to control what users can insert/update
-- 7. Combine policies with CHECK constraints for data validation
-- 8. Document any custom policies added for specific use cases
