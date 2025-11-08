-- Student Manager Schema Extensions
-- Adds fields needed for Student Manager feature and RPC function

-- Extend students table with additional fields
DO $$ 
BEGIN
  -- Add first_name if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE students ADD COLUMN first_name text;
  END IF;
  
  -- Add last_name if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE students ADD COLUMN last_name text;
  END IF;
  
  -- Add preferred_name if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'preferred_name'
  ) THEN
    ALTER TABLE students ADD COLUMN preferred_name text;
  END IF;
  
  -- Add grade if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'grade'
  ) THEN
    ALTER TABLE students ADD COLUMN grade text;
  END IF;
  
  -- Add dob if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'dob'
  ) THEN
    ALTER TABLE students ADD COLUMN dob date;
  END IF;
  
  -- Add email if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'email'
  ) THEN
    ALTER TABLE students ADD COLUMN email text;
  END IF;
  
  -- Add guardians if not exists (JSONB array)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'guardians'
  ) THEN
    ALTER TABLE students ADD COLUMN guardians jsonb DEFAULT '[]'::jsonb;
  END IF;
  
  -- Add notes if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'notes'
  ) THEN
    ALTER TABLE students ADD COLUMN notes text;
  END IF;
END $$;

-- Extend goals table with additional fields
DO $$ 
BEGIN
  -- Add goal_area if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'goal_area'
  ) THEN
    ALTER TABLE goals ADD COLUMN goal_area text;
  END IF;
  
  -- Add baseline if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'baseline'
  ) THEN
    ALTER TABLE goals ADD COLUMN baseline integer CHECK (baseline BETWEEN 0 AND 100);
  END IF;
  
  -- Add case_manager if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'case_manager'
  ) THEN
    ALTER TABLE goals ADD COLUMN case_manager text;
  END IF;
  
  -- Add active if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'active'
  ) THEN
    ALTER TABLE goals ADD COLUMN active boolean DEFAULT true;
  END IF;
  
  -- Modify target to be integer instead of text if needed
  -- Note: This is optional, left as text for backward compatibility
END $$;

-- Add class_enrollments start_date if not exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_enrollments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'class_enrollments' AND column_name = 'start_date'
    ) THEN
      ALTER TABLE class_enrollments ADD COLUMN start_date date DEFAULT CURRENT_DATE;
    END IF;
  END IF;
END $$;

-- RPC function to create student with enrollments and goals atomically
CREATE OR REPLACE FUNCTION create_student_with_enrollments_and_goals(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
  v_student_code text;
  v_enrollment jsonb;
  v_goal jsonb;
  v_result jsonb;
  v_class_id uuid;
  v_enrollments_count int := 0;
  v_goals_count int := 0;
BEGIN
  -- Extract student data
  v_student_code := payload->'student'->>'code';
  
  -- Check if student code already exists
  IF EXISTS (SELECT 1 FROM students WHERE code = v_student_code) THEN
    RAISE EXCEPTION 'Student code % already exists', v_student_code;
  END IF;
  
  -- Insert student (code-only identity - do not write to PII columns)
  INSERT INTO students (
    code,
    name
  )
  VALUES (
    v_student_code,
    v_student_code  -- Use code as name for backward compatibility
  )
  RETURNING id INTO v_student_id;
  
  -- Set password if provided
  IF payload->'student'->>'password_hash' IS NOT NULL THEN
    -- Use the set_student_password RPC if it exists, otherwise insert directly
    BEGIN
      PERFORM set_student_password(v_student_code, payload->'student'->>'password_hash');
    EXCEPTION WHEN undefined_function THEN
      -- Fallback: insert password directly (bcrypt hash expected)
      INSERT INTO student_passwords (student_id, password_hash)
      VALUES (v_student_id, payload->'student'->>'password_hash')
      ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    END;
  END IF;
  
  -- Insert enrollments
  IF payload->'enrollments' IS NOT NULL THEN
    FOR v_enrollment IN SELECT * FROM jsonb_array_elements(payload->'enrollments')
    LOOP
      -- Get class UUID from class_id (could be UUID or lookup needed)
      v_class_id := (v_enrollment->>'class_id')::uuid;
      
      INSERT INTO class_enrollments (
        class_id,
        student_id,
        start_date,
        active
      )
      VALUES (
        v_class_id,
        v_student_id,
        COALESCE((v_enrollment->>'start_date')::date, CURRENT_DATE),
        true
      )
      ON CONFLICT (class_id, student_id) DO NOTHING;
      
      v_enrollments_count := v_enrollments_count + 1;
    END LOOP;
  END IF;
  
  -- Insert goals
  IF payload->'goals' IS NOT NULL THEN
    FOR v_goal IN SELECT * FROM jsonb_array_elements(payload->'goals')
    LOOP
      INSERT INTO goals (
        student_id,
        code,
        desc,
        goal_area,
        baseline,
        target,
        case_manager,
        active,
        status
      )
      VALUES (
        v_student_id,
        v_goal->>'goal_code',
        v_goal->>'goal_text',
        v_goal->>'goal_area',
        (v_goal->>'baseline')::integer,
        v_goal->>'target',
        v_goal->>'case_manager',
        COALESCE((v_goal->>'active')::boolean, true),
        'Open'
      );
      
      v_goals_count := v_goals_count + 1;
    END LOOP;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'student_id', v_student_id,
    'student_code', v_student_code,
    'enrollments_count', v_enrollments_count,
    'goals_count', v_goals_count
  );
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_student_with_enrollments_and_goals(jsonb) TO authenticated;

-- Comments
COMMENT ON FUNCTION create_student_with_enrollments_and_goals(jsonb) IS 
  'Atomically creates a student with optional class enrollments and IEP goals. ' ||
  'Payload format: {student: {...}, enrollments: [...], goals: [...]}';
