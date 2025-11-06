-- Performance Indexes for Common Query Patterns
-- Run these in Supabase SQL Editor to optimize query performance
-- Trade-off: Faster reads, slightly slower writes

-- ================================================
-- Students Table Indexes
-- ================================================

-- Index on student code (used frequently in lookups and joins)
CREATE INDEX IF NOT EXISTS idx_students_code 
ON students(code);

-- Index on class_id for filtering students by class
CREATE INDEX IF NOT EXISTS idx_students_class_id 
ON students(class_id);

-- Composite index for class-based student queries
CREATE INDEX IF NOT EXISTS idx_students_class_code 
ON students(class_id, code);

-- ================================================
-- Goals Table Indexes
-- ================================================

-- Index on student_id for goal lookups by student
CREATE INDEX IF NOT EXISTS idx_goals_student_id 
ON goals(student_id);

-- Index on goal code for fast lookups
CREATE INDEX IF NOT EXISTS idx_goals_code 
ON goals(code);

-- Index on status for filtering open/closed goals
CREATE INDEX IF NOT EXISTS idx_goals_status 
ON goals(status);

-- Composite index for student-specific goal queries
CREATE INDEX IF NOT EXISTS idx_goals_student_status 
ON goals(student_id, status);

-- ================================================
-- Progress Entries Table Indexes
-- ================================================

-- Index on student_id for progress history
CREATE INDEX IF NOT EXISTS idx_progress_student_id 
ON progress_entries(student_id);

-- Index on goal_id for goal-specific progress
CREATE INDEX IF NOT EXISTS idx_progress_goal_id 
ON progress_entries(goal_id);

-- Index on date for chronological queries
CREATE INDEX IF NOT EXISTS idx_progress_date 
ON progress_entries(date DESC);

-- Composite index for student progress over time
CREATE INDEX IF NOT EXISTS idx_progress_student_date 
ON progress_entries(student_id, date DESC);

-- Composite index for goal progress over time
CREATE INDEX IF NOT EXISTS idx_progress_goal_date 
ON progress_entries(goal_id, date DESC);

-- ================================================
-- Events Table Indexes
-- ================================================

-- Index on student_id for student event history
CREATE INDEX IF NOT EXISTS idx_events_student_id 
ON events(student_id);

-- Index on event type for filtering
CREATE INDEX IF NOT EXISTS idx_events_type 
ON events(type);

-- Index on date for chronological queries
CREATE INDEX IF NOT EXISTS idx_events_date 
ON events(date DESC);

-- Index on due date for upcoming events
CREATE INDEX IF NOT EXISTS idx_events_due 
ON events(due) WHERE due IS NOT NULL;

-- Composite index for student events over time
CREATE INDEX IF NOT EXISTS idx_events_student_date 
ON events(student_id, date DESC);

-- ================================================
-- Assignments Table Indexes
-- ================================================

-- Index on assignment type
CREATE INDEX IF NOT EXISTS idx_assignments_type 
ON assignments(type);

-- Index on series for filtering by series
CREATE INDEX IF NOT EXISTS idx_assignments_series 
ON assignments(series) WHERE series IS NOT NULL;

-- Index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_assignments_created_at 
ON assignments(created_at DESC);

-- Index on created_by for teacher filtering
CREATE INDEX IF NOT EXISTS idx_assignments_created_by 
ON assignments(created_by) WHERE created_by IS NOT NULL;

-- ================================================
-- Assignment Instances Table Indexes
-- ================================================

-- Index on assignment_id for assignment-specific queries
CREATE INDEX IF NOT EXISTS idx_assignment_instances_assignment_id 
ON assignment_instances(assignment_id);

-- Index on student_id for student-specific queries
CREATE INDEX IF NOT EXISTS idx_assignment_instances_student_id 
ON assignment_instances(student_id);

-- Index on status for filtering by status
CREATE INDEX IF NOT EXISTS idx_assignment_instances_status 
ON assignment_instances(status);

-- Index on assigned_at for sorting
CREATE INDEX IF NOT EXISTS idx_assignment_instances_assigned_at 
ON assignment_instances(assigned_at DESC);

-- Index on due_at for upcoming assignments
CREATE INDEX IF NOT EXISTS idx_assignment_instances_due_at 
ON assignment_instances(due_at) WHERE due_at IS NOT NULL;

-- Composite index for student assignment queries
CREATE INDEX IF NOT EXISTS idx_assignment_instances_student_status 
ON assignment_instances(student_id, status);

-- Composite index for assignment distribution queries
CREATE INDEX IF NOT EXISTS idx_assignment_instances_assignment_status 
ON assignment_instances(assignment_id, status);

-- ================================================
-- Submissions Table Indexes
-- ================================================

-- Index on instance_id for submission lookups
CREATE INDEX IF NOT EXISTS idx_submissions_instance_id 
ON submissions(instance_id);

-- Index on submitted_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at 
ON submissions(submitted_at DESC);

-- ================================================
-- Classes Table Indexes
-- ================================================

-- Index on class code for lookups
CREATE INDEX IF NOT EXISTS idx_classes_code 
ON classes(code);

-- Index on class name for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_classes_name 
ON classes(name);

-- ================================================
-- Class Enrollments Table Indexes
-- ================================================

-- Index on class_id for class member queries
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id 
ON class_enrollments(class_id);

-- Index on student_id for student class membership
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id 
ON class_enrollments(student_id);

-- ================================================
-- GIN Indexes for JSONB Columns (Advanced)
-- ================================================

-- GIN index on assignments.meta for metadata searches
-- Useful for filtering by metadata fields like question count, version, etc.
CREATE INDEX IF NOT EXISTS idx_assignments_meta_gin 
ON assignments USING GIN (meta);

-- GIN index on assignment_instances.settings for settings searches
CREATE INDEX IF NOT EXISTS idx_assignment_instances_settings_gin 
ON assignment_instances USING GIN (settings);

-- GIN index on submissions.answers for answer searches
CREATE INDEX IF NOT EXISTS idx_submissions_answers_gin 
ON submissions USING GIN (answers);

-- GIN index on submissions.detail for detail searches
CREATE INDEX IF NOT EXISTS idx_submissions_detail_gin 
ON submissions USING GIN (detail);

-- ================================================
-- Verification Query
-- ================================================

-- Run this to verify all indexes were created successfully:
SELECT 
  tablename, 
  indexname, 
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ================================================
-- Notes
-- ================================================

-- 1. Run these indexes AFTER your schema is fully migrated
-- 2. Monitor query performance in Supabase Dashboard → Database → Query Performance
-- 3. Add/remove indexes based on your actual query patterns
-- 4. GIN indexes are powerful but use more disk space - use selectively
-- 5. Too many indexes can slow down writes - balance based on read/write ratio
