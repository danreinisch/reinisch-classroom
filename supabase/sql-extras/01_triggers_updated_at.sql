-- Triggers to automatically maintain updated_at timestamps
-- This enables optimistic sync and change tracking

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Class Enrollments table (if it has updated_at)
-- Uncomment if your schema includes updated_at on class_enrollments
-- DROP TRIGGER IF EXISTS update_class_enrollments_updated_at ON class_enrollments;
-- CREATE TRIGGER update_class_enrollments_updated_at
--     BEFORE UPDATE ON class_enrollments
--     FOR EACH ROW
--     EXECUTE FUNCTION update_updated_at_column();
