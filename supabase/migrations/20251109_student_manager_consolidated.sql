-- Migration: Student Manager Consolidated - Enrollment Fix and Goal Versioning
-- Date: 2025-11-09
-- Description: Consolidates all Student Manager features into a single idempotent migration:
--              - Creates enrollments table (or view aliasing class_enrollments for compatibility)
--              - Ensures assignment_items, assignment_item_mappings, submission_answers exist
--              - Adds rollup views for goals and standards
--              - Extends students table with active status
--              - Extends goals table with versioning (version, active, replaced_by, start_date)
--              - Creates all Student Manager RPC functions
--              - Adds proper indexes for performance

-- ============================================================================
-- A) Create enrollments table (compatible with class_enrollments)
-- ============================================================================
-- The schema uses class_enrollments, but some scripts reference enrollments
-- Create enrollments as an alias/view or rename if needed

-- First ensure class_enrollments exists (from 003_class_enrollments.sql)
CREATE TABLE IF NOT EXISTS class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

-- Add start_date column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'class_enrollments' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE class_enrollments ADD COLUMN start_date date DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Create enrollments table that mirrors class_enrollments for compatibility
-- Use student_code instead of student_id for the primary key as specified
CREATE TABLE IF NOT EXISTS enrollments (
  student_code text NOT NULL,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (student_code, class_id)
);

-- Add index for class_id lookups
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments(class_id);

COMMENT ON TABLE enrollments IS 'Student enrollments using student code as identifier (compatible alternative to class_enrollments)';

-- Enable RLS on enrollments
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'enrollments' 
    AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users"
      ON public.enrollments
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- B) Ensure assignment tables exist (from 20251108_assignment_mapping_phase_1.sql)
-- ============================================================================

-- B1) Extend assignments table
ALTER TABLE public.assignments
ADD COLUMN IF NOT EXISTS first_submission_at timestamptz,
ADD COLUMN IF NOT EXISTS version_locked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'portal' CHECK (source_type IN ('portal', 'google_form', 'import'));

-- B2) Create assignment_items table
CREATE TABLE IF NOT EXISTS public.assignment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  item_ref text NOT NULL,
  answer_type text NOT NULL CHECK (answer_type IN ('mcq', 'multi', 'boolean', 'constructed')),
  points numeric NOT NULL DEFAULT 1 CHECK (points >= 0),
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, item_ref)
);

CREATE INDEX IF NOT EXISTS idx_assignment_items_assignment ON public.assignment_items(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_items_ref ON public.assignment_items(assignment_id, item_ref);

-- B3) Create assignment_item_mappings table
CREATE TABLE IF NOT EXISTS public.assignment_item_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.assignment_items(id) ON DELETE CASCADE,
  dese_codes text[] DEFAULT array[]::text[],
  goal_codes text[] DEFAULT array[]::text[],
  weight numeric DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_item_mappings_item ON public.assignment_item_mappings(item_id);

-- B4) Extend submissions table
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'portal' CHECK (source_type IN ('portal', 'google_form', 'import'));

-- B5) Create submission_answers table
CREATE TABLE IF NOT EXISTS public.submission_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.assignment_items(id) ON DELETE CASCADE,
  raw_answer jsonb,
  is_correct boolean,
  earned_points numeric DEFAULT 0 CHECK (earned_points >= 0),
  max_points numeric DEFAULT 0 CHECK (max_points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_answers_submission ON public.submission_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_item ON public.submission_answers(item_id);

-- Enable RLS on assignment tables
ALTER TABLE public.assignment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;

-- Create policies for assignment tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'assignment_items' 
    AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users"
      ON public.assignment_items FOR ALL
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'assignment_item_mappings' 
    AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users"
      ON public.assignment_item_mappings FOR ALL
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'submission_answers' 
    AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users"
      ON public.submission_answers FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- C) Create rollup views
-- ============================================================================

-- C1) Assignment goal rollups view
CREATE OR REPLACE VIEW public.assignment_goal_rollups AS
SELECT
  sa.submission_id,
  unnest(aim.goal_codes) AS goal_code,
  round(
    (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
    1
  ) AS percent_correct,
  sum(sa.earned_points) AS total_earned,
  sum(sa.max_points) AS total_possible,
  count(*) AS item_count
FROM public.submission_answers sa
JOIN public.assignment_items ai ON ai.id = sa.item_id
JOIN public.assignment_item_mappings aim ON aim.item_id = ai.id
WHERE cardinality(aim.goal_codes) > 0
GROUP BY sa.submission_id, goal_code;

-- C2) Assignment standard rollups view
CREATE OR REPLACE VIEW public.assignment_standard_rollups AS
SELECT
  sa.submission_id,
  unnest(aim.dese_codes) AS dese_code,
  round(
    (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
    1
  ) AS percent_correct,
  sum(sa.earned_points) AS total_earned,
  sum(sa.max_points) AS total_possible,
  count(*) AS item_count
FROM public.submission_answers sa
JOIN public.assignment_items ai ON ai.id = sa.item_id
JOIN public.assignment_item_mappings aim ON aim.item_id = ai.id
WHERE cardinality(aim.dese_codes) > 0
GROUP BY sa.submission_id, dese_code;

-- C3) Assignment instance rollups view
CREATE OR REPLACE VIEW public.assignment_instance_rollups AS
SELECT
  ai.id AS instance_id,
  ai.assignment_id,
  ai.student_id,
  s.id AS submission_id,
  s.submitted_at,
  round(
    (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
    1
  ) AS percent_correct,
  sum(sa.earned_points) AS total_earned,
  sum(sa.max_points) AS total_possible,
  count(*) AS item_count
FROM public.assignment_instances ai
LEFT JOIN public.submissions s ON s.assignment_id = ai.assignment_id AND s.student_id = ai.student_id
LEFT JOIN public.submission_answers sa ON sa.submission_id = s.id
GROUP BY ai.id, ai.assignment_id, ai.student_id, s.id, s.submitted_at;

-- C4) Assignment instance averages view (per student across all assignments)
CREATE OR REPLACE VIEW public.assignment_instance_averages AS
SELECT
  student_id,
  round(avg(percent_correct), 1) AS average_percent,
  count(*) AS assignment_count,
  sum(total_earned) AS total_earned,
  sum(total_possible) AS total_possible
FROM public.assignment_instance_rollups
WHERE percent_correct IS NOT NULL
GROUP BY student_id;

COMMENT ON VIEW public.assignment_goal_rollups IS 'Per-goal percent_correct rollup for each submission';
COMMENT ON VIEW public.assignment_standard_rollups IS 'Per-DESE-standard percent_correct rollup for each submission';
COMMENT ON VIEW public.assignment_instance_rollups IS 'Rollup of submission scores per assignment instance';
COMMENT ON VIEW public.assignment_instance_averages IS 'Average scores across all assignments per student';

-- ============================================================================
-- D) Extend students table
-- ============================================================================

-- Add active column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'active'
  ) THEN
    ALTER TABLE students ADD COLUMN active boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Add index for active status filtering
CREATE INDEX IF NOT EXISTS idx_students_active ON students(active);

-- Ensure unique index on students.code exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_code_unique ON students(code);

COMMENT ON COLUMN students.active IS 'Whether student account is active. Inactive students cannot log in and are filtered from default views.';

-- ============================================================================
-- E) Extend goals table with versioning
-- ============================================================================

DO $$ 
BEGIN
  -- Add version if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'version'
  ) THEN
    ALTER TABLE goals ADD COLUMN version integer DEFAULT 1 NOT NULL;
  END IF;
  
  -- Add active if not exists (different from status)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'active'
  ) THEN
    ALTER TABLE goals ADD COLUMN active boolean DEFAULT true NOT NULL;
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
END $$;

-- Add indexes for goal versioning queries
CREATE INDEX IF NOT EXISTS idx_goals_active ON goals(active);
CREATE INDEX IF NOT EXISTS idx_goals_replaced_by ON goals(replaced_by);
CREATE INDEX IF NOT EXISTS idx_goals_student_version ON goals(student_id, version);

-- Update existing goals to have start_date if null (use created_at date if available)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'goals' AND column_name = 'created_at'
  ) THEN
    UPDATE goals SET start_date = created_at::date WHERE start_date IS NULL AND created_at IS NOT NULL;
  END IF;
END $$;

-- Add foreign key constraint name for goals.replaced_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'goals_replaced_by_fkey' 
    AND table_name = 'goals'
  ) THEN
    -- The column already has the reference, just ensuring the constraint name is known
    -- If the FK exists without this name, we keep it as-is (idempotent)
    NULL;
  END IF;
END $$;

COMMENT ON COLUMN goals.version IS 'Version number of this goal. Increments when goal is replaced.';
COMMENT ON COLUMN goals.active IS 'Whether this goal version is currently active. False when replaced or archived.';
COMMENT ON COLUMN goals.replaced_by IS 'Points to the newer version of this goal if it has been replaced.';
COMMENT ON COLUMN goals.start_date IS 'Date when this goal version became active.';

-- ============================================================================
-- F) Create RPC: create_student_with_enrollments_and_goals
-- ============================================================================

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
    RAISE EXCEPTION 'STUDENT_CODE_EXISTS: Student code % already exists', v_student_code
      USING HINT = 'Use a different student code';
  END IF;
  
  -- Insert student (code-only identity - do not write to PII columns)
  INSERT INTO students (code, name, active)
  VALUES (
    v_student_code,
    v_student_code,  -- Use code as name for backward compatibility
    true
  )
  RETURNING id INTO v_student_id;
  
  -- Set password if provided
  IF payload->'student'->>'password_hash' IS NOT NULL THEN
    INSERT INTO student_passwords (student_id, password_hash)
    VALUES (v_student_id, payload->'student'->>'password_hash')
    ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  END IF;
  
  -- Insert enrollments into both tables for compatibility
  IF payload->'enrollments' IS NOT NULL THEN
    FOR v_enrollment IN SELECT * FROM jsonb_array_elements(payload->'enrollments')
    LOOP
      v_class_id := (v_enrollment->>'class_id')::uuid;
      
      -- Insert into class_enrollments
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
      
      -- Also insert into enrollments table for compatibility
      INSERT INTO enrollments (
        student_code,
        class_id,
        start_date
      )
      VALUES (
        v_student_code,
        v_class_id,
        COALESCE((v_enrollment->>'start_date')::date, CURRENT_DATE)
      )
      ON CONFLICT (student_code, class_id) DO NOTHING;
      
      v_enrollments_count := v_enrollments_count + 1;
    END LOOP;
  END IF;
  
  -- Insert goals
  IF payload->'goals' IS NOT NULL THEN
    FOR v_goal IN SELECT * FROM jsonb_array_elements(payload->'goals')
    LOOP
      -- Check for duplicate goal code
      IF EXISTS (
        SELECT 1 FROM goals 
        WHERE student_id = v_student_id 
        AND code = v_goal->>'goal_code'
      ) THEN
        RAISE EXCEPTION 'GOAL_CODE_EXISTS: Goal code % already exists for student %', 
          v_goal->>'goal_code', v_student_code
          USING HINT = 'Use a different goal code';
      END IF;
      
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
        v_goal->>'goal_code',
        v_goal->>'goal_text',
        v_goal->>'goal_area',
        (v_goal->>'baseline')::integer,
        v_goal->>'target',
        v_goal->>'case_manager',
        COALESCE((v_goal->>'active')::boolean, true),
        1,  -- Initial version
        COALESCE((v_goal->>'start_date')::date, CURRENT_DATE),
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

GRANT EXECUTE ON FUNCTION create_student_with_enrollments_and_goals(jsonb) TO authenticated;

COMMENT ON FUNCTION create_student_with_enrollments_and_goals(jsonb) IS 
  'Atomically creates a student with optional class enrollments and IEP goals. ' ||
  'Raises STUDENT_CODE_EXISTS or GOAL_CODE_EXISTS on duplicates. ' ||
  'Payload format: {student: {code, password_hash?}, enrollments: [{class_id, start_date?}], goals: [{goal_code, goal_text, goal_area?, baseline?, target?, case_manager?, start_date?}]}';

-- ============================================================================
-- G) Create RPC: add_student_goals
-- ============================================================================

CREATE OR REPLACE FUNCTION add_student_goals(p_student_code text, p_goals jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
  v_goal jsonb;
  v_goals_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_goal_code text;
BEGIN
  -- Get student ID
  SELECT id INTO v_student_id FROM students WHERE code = p_student_code;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: Student with code % not found', p_student_code;
  END IF;
  
  -- Return early if no goals provided
  IF p_goals IS NULL OR jsonb_array_length(p_goals) = 0 THEN
    RETURN jsonb_build_object(
      'student_code', p_student_code,
      'goals_added', 0,
      'errors', '[]'::jsonb
    );
  END IF;
  
  -- Insert goals
  FOR v_goal IN SELECT * FROM jsonb_array_elements(p_goals)
  LOOP
    v_goal_code := v_goal->>'goal_code';
    
    BEGIN
      -- Check for duplicate goal code
      IF EXISTS (
        SELECT 1 FROM goals 
        WHERE student_id = v_student_id 
        AND code = v_goal_code
      ) THEN
        v_errors := v_errors || jsonb_build_object(
          'goal_code', v_goal_code,
          'error', 'GOAL_CODE_EXISTS'
        );
        CONTINUE;
      END IF;
      
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
        v_goal_code,
        v_goal->>'goal_text',
        v_goal->>'goal_area',
        (v_goal->>'baseline')::integer,
        v_goal->>'target',
        v_goal->>'case_manager',
        COALESCE((v_goal->>'active')::boolean, true),
        1,  -- Initial version
        COALESCE((v_goal->>'start_date')::date, CURRENT_DATE),
        'Open'
      );
      
      v_goals_count := v_goals_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'goal_code', v_goal_code,
        'error', SQLERRM
      );
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'student_code', p_student_code,
    'goals_added', v_goals_count,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_student_goals(text, jsonb) TO authenticated;

COMMENT ON FUNCTION add_student_goals(text, jsonb) IS 
  'Add multiple goals to an existing student. Returns count and per-goal errors. ' ||
  'Gracefully continues on individual goal errors. ' ||
  'Parameters: (student_code, goals_array)';

-- ============================================================================
-- H) Create RPC: replace_goal_version
-- ============================================================================

CREATE OR REPLACE FUNCTION replace_goal_version(p_old_goal_id uuid, p_new_goal jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_goal record;
  v_new_goal_id uuid;
  v_next_version int;
BEGIN
  -- Fetch old goal details
  SELECT * INTO v_old_goal FROM goals WHERE id = p_old_goal_id;
  IF v_old_goal IS NULL THEN
    RAISE EXCEPTION 'GOAL_NOT_FOUND: Goal with ID % not found', p_old_goal_id;
  END IF;
  
  -- Check if already replaced
  IF v_old_goal.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'GOAL_ALREADY_REPLACED: Goal has already been replaced';
  END IF;
  
  -- Check if already archived without replacement
  IF v_old_goal.active = false THEN
    RAISE EXCEPTION 'GOAL_ALREADY_ARCHIVED: Goal is already archived and cannot be replaced';
  END IF;
  
  -- Calculate next version number
  v_next_version := COALESCE(v_old_goal.version, 1) + 1;
  
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
    v_old_goal.student_id,
    COALESCE(p_new_goal->>'goal_code', v_old_goal.code),
    p_new_goal->>'goal_text',
    COALESCE(p_new_goal->>'goal_area', v_old_goal.goal_area),
    COALESCE((p_new_goal->>'baseline')::integer, v_old_goal.baseline),
    COALESCE(p_new_goal->>'target', v_old_goal.target),
    COALESCE(p_new_goal->>'case_manager', v_old_goal.case_manager),
    true,
    v_next_version,
    COALESCE((p_new_goal->>'start_date')::date, CURRENT_DATE),
    'Open'
  )
  RETURNING id INTO v_new_goal_id;
  
  -- Archive old goal and link to new version
  UPDATE goals
  SET 
    active = false,
    replaced_by = v_new_goal_id
  WHERE id = p_old_goal_id;
  
  RETURN jsonb_build_object(
    'old_goal_id', p_old_goal_id,
    'new_goal_id', v_new_goal_id,
    'version', v_next_version
  );
END;
$$;

GRANT EXECUTE ON FUNCTION replace_goal_version(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION replace_goal_version(uuid, jsonb) IS 
  'Replace a goal with a new version, archiving the old one. ' ||
  'Raises GOAL_NOT_FOUND, GOAL_ALREADY_REPLACED, or GOAL_ALREADY_ARCHIVED. ' ||
  'Parameters: (old_goal_id, new_goal)';

-- ============================================================================
-- I) Create RPC: archive_goal
-- ============================================================================

CREATE OR REPLACE FUNCTION archive_goal(p_goal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_goal record;
BEGIN
  -- Fetch goal
  SELECT * INTO v_goal FROM goals WHERE id = p_goal_id;
  IF v_goal IS NULL THEN
    RAISE EXCEPTION 'GOAL_NOT_FOUND: Goal with ID % not found', p_goal_id;
  END IF;
  
  -- Check if already inactive
  IF v_goal.active = false THEN
    RAISE EXCEPTION 'GOAL_ALREADY_ARCHIVED: Goal is already archived';
  END IF;
  
  -- Archive the goal
  UPDATE goals
  SET active = false
  WHERE id = p_goal_id;
  
  RETURN jsonb_build_object(
    'goal_id', p_goal_id,
    'archived', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION archive_goal(uuid) TO authenticated;

COMMENT ON FUNCTION archive_goal(uuid) IS 
  'Archive a goal without replacement. ' ||
  'Raises GOAL_NOT_FOUND or GOAL_ALREADY_ARCHIVED. ' ||
  'Parameter: goal_id';

-- ============================================================================
-- J) Create RPC: set_student_active
-- ============================================================================

CREATE OR REPLACE FUNCTION set_student_active(p_code text, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  -- Get student ID
  SELECT id INTO v_student_id FROM students WHERE code = p_code;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: Student with code % not found', p_code;
  END IF;
  
  -- Update active status
  UPDATE students
  SET active = p_active
  WHERE code = p_code;
  
  RETURN jsonb_build_object(
    'student_code', p_code,
    'active', p_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION set_student_active(text, boolean) TO authenticated;

COMMENT ON FUNCTION set_student_active(text, boolean) IS 
  'Set student active status. ' ||
  'Raises STUDENT_NOT_FOUND if student does not exist. ' ||
  'Parameters: (code, active)';

-- ============================================================================
-- K) Create RPC: update_student_enrollments
-- ============================================================================

CREATE OR REPLACE FUNCTION update_student_enrollments(p_code text, p_add jsonb, p_remove jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
  v_enrollment jsonb;
  v_class_id uuid;
  v_added int := 0;
  v_removed int := 0;
BEGIN
  -- Get student ID
  SELECT id INTO v_student_id FROM students WHERE code = p_code;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: Student with code % not found', p_code;
  END IF;
  
  -- Add new enrollments (no-op if p_add is null or empty)
  IF p_add IS NOT NULL AND jsonb_array_length(p_add) > 0 THEN
    FOR v_enrollment IN SELECT * FROM jsonb_array_elements(p_add)
    LOOP
      v_class_id := (v_enrollment->>'class_id')::uuid;
      
      -- Insert into class_enrollments
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
      
      -- Also insert into enrollments table
      INSERT INTO enrollments (
        student_code,
        class_id,
        start_date
      )
      VALUES (
        p_code,
        v_class_id,
        COALESCE((v_enrollment->>'start_date')::date, CURRENT_DATE)
      )
      ON CONFLICT (student_code, class_id) DO NOTHING;
      
      v_added := v_added + 1;
    END LOOP;
  END IF;
  
  -- Remove enrollments (set inactive) (no-op if p_remove is null or empty)
  IF p_remove IS NOT NULL AND jsonb_array_length(p_remove) > 0 THEN
    FOR v_enrollment IN SELECT * FROM jsonb_array_elements(p_remove)
    LOOP
      v_class_id := v_enrollment::text::uuid;
      
      -- Update class_enrollments
      UPDATE class_enrollments
      SET active = false
      WHERE class_id = v_class_id AND student_id = v_student_id;
      
      -- Delete from enrollments table (or could keep for history)
      DELETE FROM enrollments
      WHERE class_id = v_class_id AND student_code = p_code;
      
      v_removed := v_removed + 1;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'student_code', p_code,
    'added', v_added,
    'removed', v_removed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_student_enrollments(text, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION update_student_enrollments(text, jsonb, jsonb) IS 
  'Update student class enrollments. ' ||
  'Gracefully handles null or empty add/remove arrays. ' ||
  'Raises STUDENT_NOT_FOUND if student does not exist. ' ||
  'Parameters: (code, add_array, remove_array)';

-- ============================================================================
-- L) Enable RLS on class_enrollments if not already enabled
-- ============================================================================

ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- Create policies for class_enrollments if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'class_enrollments' 
    AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users"
      ON public.class_enrollments
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- M) Add performance indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_active ON class_enrollments(active);

-- ============================================================================
-- Migration complete
-- ============================================================================

-- Summary of changes:
-- 1. Created enrollments table (student_code based) for compatibility
-- 2. Ensured assignment_items, assignment_item_mappings, submission_answers tables exist
-- 3. Created rollup views for goals, standards, and instances
-- 4. Extended students table with active column
-- 5. Extended goals table with version, active, replaced_by, start_date columns
-- 6. Created 6 RPC functions: create_student_with_enrollments_and_goals, add_student_goals,
--    replace_goal_version, archive_goal, set_student_active, update_student_enrollments
-- 7. Added proper indexes for performance
-- 8. All operations are idempotent and safe to run multiple times
