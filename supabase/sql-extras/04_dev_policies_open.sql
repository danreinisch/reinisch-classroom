-- Development RLS Policies (PERMISSIVE - USE ONLY IN DEVELOPMENT)
-- WARNING: These policies allow unrestricted access to all tables
-- DO NOT use these in production environments

-- ================================================
-- SECURITY WARNING
-- ================================================
-- These policies are intentionally permissive for development/testing
-- They allow ANY authenticated or anonymous user to read/write ALL data
-- Use 04_prod_policies_recommended.sql for production environments

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
-- Drop Existing Development Policies (if any)
-- ================================================

DROP POLICY IF EXISTS "dev_allow_all" ON students;
DROP POLICY IF EXISTS "dev_allow_all" ON goals;
DROP POLICY IF EXISTS "dev_allow_all" ON progress_entries;
DROP POLICY IF EXISTS "dev_allow_all" ON events;
DROP POLICY IF EXISTS "dev_allow_all" ON assignments;
DROP POLICY IF EXISTS "dev_allow_all" ON assignment_instances;
DROP POLICY IF EXISTS "dev_allow_all" ON submissions;
DROP POLICY IF EXISTS "dev_allow_all" ON classes;
DROP POLICY IF EXISTS "dev_allow_all" ON class_enrollments;

-- ================================================
-- Permissive Development Policies
-- ================================================

-- Students: Allow all operations
CREATE POLICY "dev_allow_all" ON students
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Goals: Allow all operations
CREATE POLICY "dev_allow_all" ON goals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Progress Entries: Allow all operations
CREATE POLICY "dev_allow_all" ON progress_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Events: Allow all operations
CREATE POLICY "dev_allow_all" ON events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Assignments: Allow all operations
CREATE POLICY "dev_allow_all" ON assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Assignment Instances: Allow all operations
CREATE POLICY "dev_allow_all" ON assignment_instances
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Submissions: Allow all operations
CREATE POLICY "dev_allow_all" ON submissions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Classes: Allow all operations
CREATE POLICY "dev_allow_all" ON classes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Class Enrollments: Allow all operations
CREATE POLICY "dev_allow_all" ON class_enrollments
  FOR ALL
  USING (true)
  WITH CHECK (true);

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
-- Notes for Development
-- ================================================

-- 1. These policies are suitable for:
--    - Local development
--    - Testing environments
--    - Proof-of-concept demos
--    - Single-user deployments

-- 2. Security considerations:
--    - Anyone with your anon key can access ALL data
--    - No row-level restrictions
--    - No user authentication required
--    - No audit trail of who changed what

-- 3. Before moving to production:
--    - Review and apply 04_prod_policies_recommended.sql
--    - Test with real user accounts
--    - Verify teachers can only see their students
--    - Verify students can only see their own data

-- 4. To test these policies:
--    - Use the anon key from your Supabase project
--    - Make requests from the app
--    - Verify all CRUD operations work
--    - Check that no 403 Forbidden errors occur

-- 5. Monitoring:
--    - Enable Supabase logs to see policy evaluations
--    - Review Dashboard → Database → Logs
--    - Look for policy violations or unexpected access patterns

-- ================================================
-- Transitioning to Production
-- ================================================

-- When ready to switch to production policies:
-- 1. Backup your data
-- 2. Drop all "dev_allow_all" policies
-- 3. Run 04_prod_policies_recommended.sql
-- 4. Test thoroughly with different user roles
-- 5. Monitor logs for any access denied errors
-- 6. Adjust policies as needed for your use case
