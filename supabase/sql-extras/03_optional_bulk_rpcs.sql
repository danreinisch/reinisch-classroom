-- Optional Bulk RPC Functions
-- These functions use SECURITY DEFINER to bypass RLS when needed
-- Review carefully and customize for your security requirements

-- Bulk upsert students
-- This function allows batch creation/update of students
-- SECURITY DEFINER: runs with owner privileges, bypassing RLS
CREATE OR REPLACE FUNCTION bulk_upsert_students(students_json JSONB)
RETURNS TABLE(inserted_count INT, updated_count INT, errors TEXT[]) 
SECURITY DEFINER
AS $$
DECLARE
    inserted INT := 0;
    updated INT := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    student_record JSONB;
    existing_student students%ROWTYPE;
BEGIN
    -- Iterate through the JSON array of students
    FOR student_record IN SELECT * FROM jsonb_array_elements(students_json)
    LOOP
        BEGIN
            -- Check if student exists
            SELECT * INTO existing_student
            FROM students
            WHERE code = (student_record->>'code');
            
            IF FOUND THEN
                -- Update existing student
                UPDATE students
                SET 
                    name = COALESCE(student_record->>'name', name),
                    class_id = COALESCE(student_record->>'class_id', class_id)
                WHERE code = (student_record->>'code');
                updated := updated + 1;
            ELSE
                -- Insert new student
                INSERT INTO students (code, name, class_id)
                VALUES (
                    student_record->>'code',
                    student_record->>'name',
                    student_record->>'class_id'
                );
                inserted := inserted + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Capture errors but continue processing
            error_list := array_append(error_list, 
                format('Error processing student %s: %s', 
                    student_record->>'code', SQLERRM));
        END;
    END LOOP;
    
    RETURN QUERY SELECT inserted, updated, error_list;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT * FROM bulk_upsert_students('[
--   {"code": "STU001", "name": "John Doe", "class_id": "CLS-A"},
--   {"code": "STU002", "name": "Jane Smith", "class_id": "CLS-A"}
-- ]'::jsonb);

-- Grant execute to authenticated users (adjust as needed)
GRANT EXECUTE ON FUNCTION bulk_upsert_students TO authenticated;

-- Optionally grant to anon for development only (REMOVE IN PRODUCTION)
-- GRANT EXECUTE ON FUNCTION bulk_upsert_students TO anon;
