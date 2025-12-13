-- Student Manager Extensions: Operation Chooser & Goal Versioning
-- Adds columns for student active status, goal versioning, and goal lifecycle management

-- Extend students table with active status
DO $$ 
BEGIN
  -- Add active if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'active'
  ) THEN
    ALTER TABLE students ADD COLUMN active boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Add index for active status filtering
CREATE INDEX IF NOT EXISTS idx_students_active ON students(active);

-- Extend goals table with versioning and lifecycle fields
DO $$ 
BEGIN
  -- Add version if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'version'
  ) THEN
    ALTER TABLE goals ADD COLUMN version integer DEFAULT 1 NOT NULL;
  END IF;
  
  -- Add replaced_by if not exists (points to new version)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'replaced_by'
  ) THEN
    ALTER TABLE goals ADD COLUMN replaced_by uuid REFERENCES goals(id) ON DELETE SET NULL;
  END IF;
  
  -- Add start_date if not exists (when goal became active)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE goals ADD COLUMN start_date date;
  END IF;
END $$;

-- Add indexes for goal versioning queries
CREATE INDEX IF NOT EXISTS idx_goals_active ON goals(active);
CREATE INDEX IF NOT EXISTS idx_goals_replaced_by ON goals(replaced_by);
CREATE INDEX IF NOT EXISTS idx_goals_student_version ON goals(student_id, version);

-- Update existing goals to have start_date if null (use created_at date)
UPDATE goals SET start_date = created_at::date WHERE start_date IS NULL;

-- RPC: Update student enrollments (add/remove classes)
CREATE OR REPLACE FUNCTION update_student_enrollments(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
  v_student_code text;
  v_enrollment jsonb;
  v_class_id uuid;
  v_added int := 0;
  v_removed int := 0;
BEGIN
  -- Get student code
  v_student_code := payload->>'code';
  
  -- Get student ID
  SELECT id INTO v_student_id FROM students WHERE code = v_student_code;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student with code % not found', v_student_code;
  END IF;
  
  -- Add new enrollments
  IF payload->'add' IS NOT NULL THEN
    FOR v_enrollment IN SELECT * FROM jsonb_array_elements(payload->'add')
    LOOP
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
      ON CONFLICT (class_id, student_id) 
      DO UPDATE SET 
        active = true,
        start_date = COALESCE(EXCLUDED.start_date, class_enrollments.start_date);
      
      v_added := v_added + 1;
    END LOOP;
  END IF;
  
  -- Remove enrollments (set inactive)
  IF payload->'remove' IS NOT NULL THEN
    FOR v_enrollment IN SELECT * FROM jsonb_array_elements(payload->'remove')
    LOOP
      v_class_id := v_enrollment::text::uuid;
      
      UPDATE class_enrollments
      SET active = false
      WHERE class_id = v_class_id AND student_id = v_student_id;
      
      v_removed := v_removed + 1;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'student_code', v_student_code,
    'added', v_added,
    'removed', v_removed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_student_enrollments(jsonb) TO authenticated;

COMMENT ON FUNCTION update_student_enrollments(jsonb) IS 
  'Update student class enrollments. ' ||
  'Payload: {code: string, add: [{class_id, start_date}], remove: [class_id]}';

-- RPC: Replace goal with new version
CREATE OR REPLACE FUNCTION replace_goal_version(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_goal_id uuid;
  v_new_goal_id uuid;
  v_old_goal record;
  v_next_version int;
  v_student_id uuid;
BEGIN
  -- Get old goal ID
  v_old_goal_id := (payload->>'old_goal_id')::uuid;
  
  -- Fetch old goal details
  SELECT * INTO v_old_goal FROM goals WHERE id = v_old_goal_id;
  IF v_old_goal IS NULL THEN
    RAISE EXCEPTION 'Goal with ID % not found', v_old_goal_id;
  END IF;
  
  -- Check if already replaced
  IF v_old_goal.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'Goal has already been replaced';
  END IF;
  
  -- Check if already archived without replacement
  IF v_old_goal.active = false THEN
    RAISE EXCEPTION 'Goal is already archived and cannot be replaced';
  END IF;
  
  -- Calculate next version number
  v_next_version := COALESCE(v_old_goal.version, 1) + 1;
  v_student_id := v_old_goal.student_id;
  
  -- Create new goal version
  INSERT INTO goals (
    student_id,
    code,
    desc,
    goal_area,
    baseline,
    target,
    case_manager,
    active,
    version,
    start_date,
    status
  )
  VALUES (
    v_student_id,
    COALESCE(payload->'new_goal'->>'goal_code', v_old_goal.code),
    payload->'new_goal'->>'goal_text',
    COALESCE(payload->'new_goal'->>'goal_area', v_old_goal.goal_area),
    COALESCE((payload->'new_goal'->>'baseline')::integer, v_old_goal.baseline),
    COALESCE(payload->'new_goal'->>'target', v_old_goal.target),
    COALESCE(payload->'new_goal'->>'case_manager', v_old_goal.case_manager),
    true,
    v_next_version,
    COALESCE((payload->'new_goal'->>'start_date')::date, CURRENT_DATE),
    'Open'
  )
  RETURNING id INTO v_new_goal_id;
  
  -- Archive old goal and link to new version
  UPDATE goals
  SET 
    active = false,
    replaced_by = v_new_goal_id
  WHERE id = v_old_goal_id;
  
  RETURN jsonb_build_object(
    'old_goal_id', v_old_goal_id,
    'new_goal_id', v_new_goal_id,
    'version', v_next_version
  );
END;
$$;

GRANT EXECUTE ON FUNCTION replace_goal_version(jsonb) TO authenticated;

COMMENT ON FUNCTION replace_goal_version(jsonb) IS 
  'Replace a goal with a new version, archiving the old one. ' ||
  'Payload: {old_goal_id: uuid, new_goal: {goal_code?, goal_text, goal_area?, baseline?, target?, case_manager?, start_date?}}';

-- RPC: Archive goal (without replacement)
CREATE OR REPLACE FUNCTION archive_goal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal_id uuid;
  v_goal record;
BEGIN
  v_goal_id := (payload->>'goal_id')::uuid;
  
  -- Fetch goal
  SELECT * INTO v_goal FROM goals WHERE id = v_goal_id;
  IF v_goal IS NULL THEN
    RAISE EXCEPTION 'Goal with ID % not found', v_goal_id;
  END IF;
  
  -- Check if already inactive
  IF v_goal.active = false THEN
    RAISE EXCEPTION 'Goal is already archived';
  END IF;
  
  -- Archive the goal
  UPDATE goals
  SET active = false
  WHERE id = v_goal_id;
  
  RETURN jsonb_build_object(
    'goal_id', v_goal_id,
    'archived', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION archive_goal(jsonb) TO authenticated;

COMMENT ON FUNCTION archive_goal(jsonb) IS 
  'Archive a goal without replacement. Payload: {goal_id: uuid}';

-- RPC: Set student active status
CREATE OR REPLACE FUNCTION set_student_active(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_code text;
  v_active boolean;
  v_student_id uuid;
BEGIN
  v_student_code := payload->>'code';
  v_active := (payload->>'active')::boolean;
  
  -- Get student ID
  SELECT id INTO v_student_id FROM students WHERE code = v_student_code;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student with code % not found', v_student_code;
  END IF;
  
  -- Update active status
  UPDATE students
  SET active = v_active
  WHERE code = v_student_code;
  
  RETURN jsonb_build_object(
    'student_code', v_student_code,
    'active', v_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION set_student_active(jsonb) TO authenticated;

COMMENT ON FUNCTION set_student_active(jsonb) IS 
  'Set student active status. Payload: {code: string, active: boolean}';

-- Update verify_student_password to check active status
CREATE OR REPLACE FUNCTION verify_student_password(p_code text, p_plain text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  hash text;
  is_active boolean;
BEGIN
  -- Get password hash and active status
  SELECT sp.password_hash, s.active
  INTO hash, is_active
  FROM students s
  JOIN student_passwords sp ON sp.student_id = s.id
  WHERE s.code = p_code;

  IF hash IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if student is inactive
  IF is_active = false THEN
    RAISE EXCEPTION 'Account inactive. Please contact teacher.';
  END IF;

  RETURN hash = extensions.crypt(p_plain, hash);
END $$;

-- Comments
COMMENT ON COLUMN students.active IS 'Whether student account is active. Inactive students cannot log in and are filtered from default views.';
COMMENT ON COLUMN goals.version IS 'Version number of this goal. Increments when goal is replaced.';
COMMENT ON COLUMN goals.replaced_by IS 'Points to the newer version of this goal if it has been replaced.';
COMMENT ON COLUMN goals.start_date IS 'Date when this goal version became active.';
