-- Test Student Manager RPC Functions
-- Run this script to verify all functions work correctly

-- Test 1: Create student with enrollments and goals
DO $$
DECLARE
  v_class_id uuid;
  v_result jsonb;
BEGIN
  -- Create test class
  INSERT INTO classes (name) VALUES ('Test Class A') RETURNING id INTO v_class_id;
  
  -- Create student S100 with 2 enrollments and 3 goals
  SELECT create_student_with_enrollments_and_goals(
    jsonb_build_object(
      'student', jsonb_build_object('code', 'S100', 'password_hash', 'test_hash_123'),
      'enrollments', jsonb_build_array(
        jsonb_build_object('class_id', v_class_id, 'start_date', '2025-01-01')
      ),
      'goals', jsonb_build_array(
        jsonb_build_object('goal_code', 'S100.1', 'goal_text', 'Math Goal 1', 'goal_area', 'Math', 'baseline', 50, 'target', '80'),
        jsonb_build_object('goal_code', 'S100.2', 'goal_text', 'Reading Goal 1', 'goal_area', 'Reading', 'baseline', 40, 'target', '70'),
        jsonb_build_object('goal_code', 'S100.3', 'goal_text', 'Writing Goal 1', 'goal_area', 'Writing', 'baseline', 60, 'target', '85')
      )
    )
  ) INTO v_result;
  
  RAISE NOTICE 'Test 1 PASSED: Created student S100 - %', v_result;
END $$;

-- Test 2: Add additional goals
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT add_student_goals(
    'S100',
    jsonb_build_array(
      jsonb_build_object('goal_code', 'S100.4', 'goal_text', 'Science Goal 1', 'goal_area', 'Science', 'baseline', 55, 'target', '75')
    )
  ) INTO v_result;
  
  RAISE NOTICE 'Test 2 PASSED: Added goals - %', v_result;
END $$;

-- Test 3: Replace goal version
DO $$
DECLARE
  v_old_goal_id uuid;
  v_result jsonb;
BEGIN
  -- Get first goal ID
  SELECT id INTO v_old_goal_id FROM goals WHERE code = 'S100.1' AND active = true LIMIT 1;
  
  -- Replace it
  SELECT replace_goal_version(
    v_old_goal_id,
    jsonb_build_object('goal_text', 'Math Goal 1 - Updated', 'target', '90')
  ) INTO v_result;
  
  RAISE NOTICE 'Test 3 PASSED: Replaced goal version - %', v_result;
  
  -- Verify version incremented
  IF (SELECT version FROM goals WHERE id = (v_result->>'new_goal_id')::uuid) = 2 THEN
    RAISE NOTICE 'Version check PASSED: Version = 2';
  ELSE
    RAISE EXCEPTION 'Version check FAILED';
  END IF;
END $$;

-- Test 4: Replace goal version again (version should be 3)
DO $$
DECLARE
  v_old_goal_id uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_old_goal_id FROM goals WHERE code = 'S100.1' AND active = true AND version = 2 LIMIT 1;
  
  SELECT replace_goal_version(
    v_old_goal_id,
    jsonb_build_object('goal_text', 'Math Goal 1 - Updated Again', 'target', '95')
  ) INTO v_result;
  
  RAISE NOTICE 'Test 4 PASSED: Replaced goal version again - %', v_result;
  
  IF (SELECT version FROM goals WHERE id = (v_result->>'new_goal_id')::uuid) = 3 THEN
    RAISE NOTICE 'Version check PASSED: Version = 3';
  ELSE
    RAISE EXCEPTION 'Version check FAILED';
  END IF;
END $$;

-- Test 5: Archive a goal (version 2 which should already be inactive)
DO $$
DECLARE
  v_goal_id uuid;
BEGIN
  -- Try to archive version 2 (already inactive from replacement)
  SELECT id INTO v_goal_id FROM goals WHERE code = 'S100.1' AND version = 2 LIMIT 1;
  
  BEGIN
    PERFORM archive_goal(v_goal_id);
    RAISE EXCEPTION 'Should have raised GOAL_ALREADY_ARCHIVED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%GOAL_ALREADY_ARCHIVED%' THEN
      RAISE NOTICE 'Test 5 PASSED: Correctly rejected archiving already-inactive goal';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

-- Test 6: Archive an active goal
DO $$
DECLARE
  v_goal_id uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_goal_id FROM goals WHERE code = 'S100.2' AND active = true LIMIT 1;
  
  SELECT archive_goal(v_goal_id) INTO v_result;
  
  RAISE NOTICE 'Test 6 PASSED: Archived active goal - %', v_result;
END $$;

-- Test 7: Deactivate student
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT set_student_active('S100', false) INTO v_result;
  
  RAISE NOTICE 'Test 7 PASSED: Deactivated student - %', v_result;
  
  IF (SELECT active FROM students WHERE code = 'S100') = false THEN
    RAISE NOTICE 'Active check PASSED: Student is inactive';
  ELSE
    RAISE EXCEPTION 'Active check FAILED';
  END IF;
END $$;

-- Test 8: Reactivate student
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT set_student_active('S100', true) INTO v_result;
  
  RAISE NOTICE 'Test 8 PASSED: Reactivated student - %', v_result;
  
  IF (SELECT active FROM students WHERE code = 'S100') = true THEN
    RAISE NOTICE 'Active check PASSED: Student is active';
  ELSE
    RAISE EXCEPTION 'Active check FAILED';
  END IF;
END $$;

-- Test 9: Update enrollments - add new class
DO $$
DECLARE
  v_class_id uuid;
  v_result jsonb;
BEGIN
  -- Create another test class
  INSERT INTO classes (name) VALUES ('Test Class B') RETURNING id INTO v_class_id;
  
  -- Add enrollment
  SELECT update_student_enrollments(
    'S100',
    jsonb_build_array(jsonb_build_object('class_id', v_class_id)),
    NULL
  ) INTO v_result;
  
  RAISE NOTICE 'Test 9 PASSED: Added enrollment - %', v_result;
END $$;

-- Test 10: Update enrollments - remove class
DO $$
DECLARE
  v_class_id uuid;
  v_result jsonb;
BEGIN
  -- Get the class we just added
  SELECT ce.class_id INTO v_class_id 
  FROM class_enrollments ce
  JOIN students s ON s.id = ce.student_id
  JOIN classes c ON c.id = ce.class_id
  WHERE s.code = 'S100' AND c.name = 'Test Class B'
  LIMIT 1;
  
  -- Remove enrollment
  SELECT update_student_enrollments(
    'S100',
    NULL,
    jsonb_build_array(v_class_id::text::jsonb)
  ) INTO v_result;
  
  RAISE NOTICE 'Test 10 PASSED: Removed enrollment - %', v_result;
END $$;

-- Test 11: Try to create duplicate student (should fail)
DO $$
BEGIN
  PERFORM create_student_with_enrollments_and_goals(
    jsonb_build_object(
      'student', jsonb_build_object('code', 'S100'),
      'enrollments', '[]'::jsonb,
      'goals', '[]'::jsonb
    )
  );
  
  RAISE EXCEPTION 'Should have raised STUDENT_CODE_EXISTS';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%STUDENT_CODE_EXISTS%' THEN
    RAISE NOTICE 'Test 11 PASSED: Correctly rejected duplicate student code';
  ELSE
    RAISE;
  END IF;
END $$;

-- Test 12: Try to add duplicate goal (should return error in result)
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT add_student_goals(
    'S100',
    jsonb_build_array(
      jsonb_build_object('goal_code', 'S100.1', 'goal_text', 'Duplicate goal')
    )
  ) INTO v_result;
  
  IF jsonb_array_length(v_result->'errors') > 0 THEN
    RAISE NOTICE 'Test 12 PASSED: Correctly reported duplicate goal code - %', v_result;
  ELSE
    RAISE EXCEPTION 'Test 12 FAILED: Should have reported error for duplicate goal';
  END IF;
END $$;

-- Summary query
SELECT 
  s.code,
  s.active,
  COUNT(DISTINCT ce.class_id) as classes_count,
  COUNT(g.id) as total_goals,
  COUNT(g.id) FILTER (WHERE g.active) as active_goals,
  COUNT(g.id) FILTER (WHERE NOT g.active) as inactive_goals,
  MAX(g.version) as max_version
FROM students s
LEFT JOIN class_enrollments ce ON ce.student_id = s.id AND ce.active = true
LEFT JOIN goals g ON g.student_id = s.id
WHERE s.code = 'S100'
GROUP BY s.code, s.active;

-- Detailed goal version view
SELECT 
  g.code as goal_code,
  g.version,
  g.active,
  g.desc,
  g.target,
  g.start_date,
  g.replaced_by
FROM students s
JOIN goals g ON g.student_id = s.id
WHERE s.code = 'S100'
ORDER BY g.code, g.version;

-- Cleanup (optional - comment out to keep test data)
-- DELETE FROM students WHERE code = 'S100';
-- DELETE FROM classes WHERE name LIKE 'Test Class%';

SELECT 'All tests completed successfully!' as status;
