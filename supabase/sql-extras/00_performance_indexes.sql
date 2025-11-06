-- Performance Indexes for Reinisch Classroom
-- Apply these indexes to improve query performance on common access patterns

-- Students: Index on code for fast lookups
CREATE INDEX IF NOT EXISTS idx_students_code ON students(code);

-- Students: Index on class_id for class-based queries
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);

-- Goals: Index on student_id for student-specific goal queries
CREATE INDEX IF NOT EXISTS idx_goals_student_id ON goals(student_id);

-- Goals: Composite index for unique constraint enforcement
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_student_code ON goals(student_id, code);

-- Progress Entries: Index on student_id for student progress history
CREATE INDEX IF NOT EXISTS idx_progress_student_id ON progress_entries(student_id);

-- Progress Entries: Index on goal_id for goal-specific progress
CREATE INDEX IF NOT EXISTS idx_progress_goal_id ON progress_entries(goal_id);

-- Progress Entries: Index on date for chronological queries
CREATE INDEX IF NOT EXISTS idx_progress_date ON progress_entries(date DESC);

-- Events: Index on student_id for student-specific events
CREATE INDEX IF NOT EXISTS idx_events_student_id ON events(student_id);

-- Events: Index on date for chronological queries
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date DESC);

-- Assignment Instances: Index on assignment_id for assignment-based queries
CREATE INDEX IF NOT EXISTS idx_assignment_instances_assignment_id ON assignment_instances(assignment_id);

-- Assignment Instances: Index on student_id for student-based queries
CREATE INDEX IF NOT EXISTS idx_assignment_instances_student_id ON assignment_instances(student_id);

-- Assignment Instances: Index on status for filtering by completion state
CREATE INDEX IF NOT EXISTS idx_assignment_instances_status ON assignment_instances(status);

-- Submissions: Index on instance_id for instance-specific submissions
CREATE INDEX IF NOT EXISTS idx_submissions_instance_id ON submissions(instance_id);

-- Submissions: Index on submitted_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at DESC);

-- Class Enrollments: Index on class_id for class roster queries
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON class_enrollments(class_id);

-- Class Enrollments: Index on student_id for student schedule queries
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id ON class_enrollments(student_id);

-- Assignments: Index on created_at for recent assignments
CREATE INDEX IF NOT EXISTS idx_assignments_created_at ON assignments(created_at DESC);

-- Assignments: Index on type for filtering by assignment type
CREATE INDEX IF NOT EXISTS idx_assignments_type ON assignments(type);
