-- Optional Bulk RPC Functions for High-Volume Operations
-- These functions enable efficient batch operations for importing/syncing large datasets

-- ================================================
-- Bulk Upsert Students
-- ================================================

CREATE OR REPLACE FUNCTION bulk_upsert_students(students_data JSONB)
RETURNS TABLE(inserted_count INT, updated_count INT) AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
BEGIN
  -- Insert or update students from JSONB array
  WITH upsert_result AS (
    INSERT INTO students (code, name, class_id)
    SELECT 
      (student->>'code')::text,
      (student->>'name')::text,
      CASE 
        WHEN student->>'class_id' IS NOT NULL 
        THEN (student->>'class_id')::uuid 
        ELSE NULL 
      END
    FROM jsonb_array_elements(students_data) AS student
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      class_id = EXCLUDED.class_id,
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted
  )
  SELECT 
    COUNT(*) FILTER (WHERE inserted) INTO v_inserted,
    COUNT(*) FILTER (WHERE NOT inserted) INTO v_updated
  FROM upsert_result;
  
  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT * FROM bulk_upsert_students('[
--   {"code": "S001", "name": "Alice Johnson", "class_id": "uuid-here"},
--   {"code": "S002", "name": "Bob Smith", "class_id": "uuid-here"}
-- ]'::jsonb);

-- ================================================
-- Bulk Upsert Goals
-- ================================================

CREATE OR REPLACE FUNCTION bulk_upsert_goals(goals_data JSONB)
RETURNS TABLE(inserted_count INT, updated_count INT) AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
BEGIN
  -- Insert or update goals from JSONB array
  WITH upsert_result AS (
    INSERT INTO goals (student_id, code, desc, target, status)
    SELECT 
      (goal->>'student_id')::uuid,
      (goal->>'code')::text,
      (goal->>'desc')::text,
      (goal->>'target')::text,
      COALESCE((goal->>'status')::text, 'Open')
    FROM jsonb_array_elements(goals_data) AS goal
    ON CONFLICT (student_id, code) DO UPDATE SET
      desc = EXCLUDED.desc,
      target = EXCLUDED.target,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted
  )
  SELECT 
    COUNT(*) FILTER (WHERE inserted) INTO v_inserted,
    COUNT(*) FILTER (WHERE NOT inserted) INTO v_updated
  FROM upsert_result;
  
  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT * FROM bulk_upsert_goals('[
--   {"student_id": "uuid-here", "code": "S001.11.1", "desc": "Reading comprehension", "target": "80%", "status": "Open"},
--   {"student_id": "uuid-here", "code": "S001.12.2", "desc": "Math facts fluency", "target": "90%", "status": "Open"}
-- ]'::jsonb);

-- ================================================
-- Bulk Insert Progress Entries
-- ================================================

CREATE OR REPLACE FUNCTION bulk_insert_progress(progress_data JSONB)
RETURNS INT AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  -- Bulk insert progress entries
  INSERT INTO progress_entries (student_id, goal_id, date, points, percent, method, by_name, via, notes)
  SELECT 
    (entry->>'student_id')::uuid,
    (entry->>'goal_id')::uuid,
    COALESCE((entry->>'date')::date, CURRENT_DATE),
    (entry->>'points')::text,
    (entry->>'percent')::int,
    (entry->>'method')::text,
    COALESCE((entry->>'by_name')::text, 'Teacher'),
    COALESCE((entry->>'via')::text, 'manual'),
    (entry->>'notes')::text
  FROM jsonb_array_elements(progress_data) AS entry;
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT bulk_insert_progress('[
--   {"student_id": "uuid-here", "goal_id": "uuid-here", "date": "2024-01-15", "percent": 85, "method": "quiz", "notes": "Great progress"},
--   {"student_id": "uuid-here", "goal_id": "uuid-here", "date": "2024-01-15", "percent": 90, "method": "observation"}
-- ]'::jsonb);

-- ================================================
-- Bulk Issue Assignments (Create Assignment Instances)
-- ================================================

CREATE OR REPLACE FUNCTION bulk_issue_assignment(
  p_assignment_id uuid,
  p_student_ids uuid[],
  p_due_at timestamp DEFAULT NULL,
  p_status text DEFAULT 'Assigned'
)
RETURNS INT AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  -- Bulk create assignment instances
  INSERT INTO assignment_instances (assignment_id, student_id, due_at, status, settings)
  SELECT 
    p_assignment_id,
    unnest(p_student_ids),
    p_due_at,
    p_status,
    '{}'::jsonb
  ON CONFLICT (assignment_id, student_id) DO UPDATE SET
    due_at = EXCLUDED.due_at,
    status = EXCLUDED.status,
    updated_at = NOW();
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT bulk_issue_assignment(
--   'assignment-uuid-here'::uuid,
--   ARRAY['student1-uuid', 'student2-uuid', 'student3-uuid']::uuid[],
--   '2024-02-01 23:59:59'::timestamp,
--   'Assigned'
-- );

-- ================================================
-- Bulk Upsert Classes
-- ================================================

CREATE OR REPLACE FUNCTION bulk_upsert_classes(classes_data JSONB)
RETURNS TABLE(inserted_count INT, updated_count INT) AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
BEGIN
  WITH upsert_result AS (
    INSERT INTO classes (name, code)
    SELECT 
      (class->>'name')::text,
      (class->>'code')::text
    FROM jsonb_array_elements(classes_data) AS class
    ON CONFLICT (name) DO UPDATE SET
      code = EXCLUDED.code,
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted
  )
  SELECT 
    COUNT(*) FILTER (WHERE inserted) INTO v_inserted,
    COUNT(*) FILTER (WHERE NOT inserted) INTO v_updated
  FROM upsert_result;
  
  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT * FROM bulk_upsert_classes('[
--   {"name": "Math 101", "code": "MATH101"},
--   {"name": "English 201", "code": "ENG201"}
-- ]'::jsonb);

-- ================================================
-- Bulk Upsert Class Enrollments
-- ================================================

CREATE OR REPLACE FUNCTION bulk_upsert_enrollments(enrollments_data JSONB)
RETURNS TABLE(inserted_count INT, updated_count INT) AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
BEGIN
  WITH upsert_result AS (
    INSERT INTO class_enrollments (class_id, student_id)
    SELECT 
      (enrollment->>'class_id')::uuid,
      (enrollment->>'student_id')::uuid
    FROM jsonb_array_elements(enrollments_data) AS enrollment
    ON CONFLICT (class_id, student_id) DO NOTHING
    RETURNING true AS inserted
  )
  SELECT 
    COUNT(*) FILTER (WHERE inserted) INTO v_inserted
  FROM upsert_result;
  
  -- Updated count is always 0 because we DO NOTHING on conflict
  v_updated := 0;
  
  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT * FROM bulk_upsert_enrollments('[
--   {"class_id": "class-uuid-here", "student_id": "student1-uuid"},
--   {"class_id": "class-uuid-here", "student_id": "student2-uuid"}
-- ]'::jsonb);

-- ================================================
-- Performance Tips
-- ================================================

-- 1. Use bulk operations for importing 100+ records at once
-- 2. Wrap bulk operations in transactions for consistency
-- 3. For very large batches (10,000+), chunk into smaller batches (1,000-5,000)
-- 4. Consider using COPY for even larger imports (100,000+)
-- 5. Disable triggers temporarily for bulk imports if safe:
--    ALTER TABLE students DISABLE TRIGGER ALL;
--    -- perform bulk operation
--    ALTER TABLE students ENABLE TRIGGER ALL;

-- ================================================
-- Usage from JavaScript
-- ================================================

-- Example: Bulk upsert students from JavaScript
-- const studentsData = [
--   { code: 'S001', name: 'Alice Johnson', class_id: 'uuid-here' },
--   { code: 'S002', name: 'Bob Smith', class_id: 'uuid-here' }
-- ];
-- 
-- const { data, error } = await supabase.rpc('bulk_upsert_students', {
--   students_data: studentsData
-- });
-- 
-- console.log(`Inserted: ${data[0].inserted_count}, Updated: ${data[0].updated_count}`);
