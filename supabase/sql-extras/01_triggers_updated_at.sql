-- Auto-Update updated_at Timestamps
-- These triggers maintain the updated_at column for optimistic sync and change tracking

-- ================================================
-- Trigger Function
-- ================================================

-- Create the trigger function (only needs to be created once)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- ================================================
-- Apply Triggers to Tables
-- ================================================

-- Students table
DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Goals table
DROP TRIGGER IF EXISTS update_goals_updated_at ON goals;
CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Progress Entries table
DROP TRIGGER IF EXISTS update_progress_entries_updated_at ON progress_entries;
CREATE TRIGGER update_progress_entries_updated_at
  BEFORE UPDATE ON progress_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Events table
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Assignments table
DROP TRIGGER IF EXISTS update_assignments_updated_at ON assignments;
CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Assignment Instances table
DROP TRIGGER IF EXISTS update_assignment_instances_updated_at ON assignment_instances;
CREATE TRIGGER update_assignment_instances_updated_at
  BEFORE UPDATE ON assignment_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Submissions table
DROP TRIGGER IF EXISTS update_submissions_updated_at ON submissions;
CREATE TRIGGER update_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Classes table
DROP TRIGGER IF EXISTS update_classes_updated_at ON classes;
CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Class Enrollments table
DROP TRIGGER IF EXISTS update_class_enrollments_updated_at ON class_enrollments;
CREATE TRIGGER update_class_enrollments_updated_at
  BEFORE UPDATE ON class_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- Verification Query
-- ================================================

-- Run this to verify all triggers were created successfully:
SELECT 
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%updated_at%'
ORDER BY event_object_table;

-- ================================================
-- Notes
-- ================================================

-- 1. The updated_at column must exist on each table before applying the trigger
-- 2. Triggers fire on UPDATE but not INSERT - use DEFAULT NOW() for created_at and updated_at
-- 3. This enables optimistic locking: check updated_at before updating to detect conflicts
-- 4. Use updated_at for incremental sync: fetch only records modified since last sync
-- 5. Example incremental sync query:
--    SELECT * FROM students WHERE updated_at > '2024-01-15T10:30:00Z'
