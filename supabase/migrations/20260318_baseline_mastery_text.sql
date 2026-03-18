-- Migration: 20260318_baseline_mastery_text
-- Purpose:   1. Change goals.baseline from integer → text (supports "1/5", "60%")
--            2. Add goals.mastery column (text) for the new CSV Mastery field
--            3. Add baseline + mastery to goal_staging and goal_staging_csv
--            4. Rebuild all RPC functions that cast baseline as ::int

-- STEP 1: Alter goals.baseline from integer to text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%baseline%'
      AND constraint_schema = 'public'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.goals DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.check_constraints
      WHERE constraint_name LIKE '%baseline%'
        AND constraint_schema = 'public'
      LIMIT 1
    );
  END IF;
END $$;

DO $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'baseline';
  IF v_type IS NULL THEN
    ALTER TABLE public.goals ADD COLUMN baseline text;
  ELSIF v_type <> 'text' THEN
    ALTER TABLE public.goals ALTER COLUMN baseline TYPE text USING baseline::text;
  END IF;
END $$;

-- STEP 2: Add goals.mastery column
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS mastery text;
COMMENT ON COLUMN public.goals.baseline IS 'Baseline value from IEP (e.g., "60%", "1/5", "0/4")';
COMMENT ON COLUMN public.goals.mastery  IS 'Mastery/target value from IEP (e.g., "80%", "3/5", "2/4")';

-- STEP 3: Backfill mastery from target
DO $$
DECLARE v_count int;
BEGIN
  UPDATE public.goals SET mastery = target WHERE mastery IS NULL AND target IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
END $$;

-- STEP 4: Add baseline + mastery to staging tables
ALTER TABLE public.goal_staging ADD COLUMN IF NOT EXISTS baseline text, ADD COLUMN IF NOT EXISTS mastery text;
ALTER TABLE public.goal_staging_csv ADD COLUMN IF NOT EXISTS "Baseline" text, ADD COLUMN IF NOT EXISTS "Mastery" text, ADD COLUMN IF NOT EXISTS "Student: Active/Inactive" text;

-- STEP 5: Rebuild RPC functions (remove ::int casts, add mastery)
CREATE OR REPLACE FUNCTION public.add_student_goals(p_student_code text, p_goals jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
declare v_created int := 0;
begin
  insert into goals (goal_code, goal_area, goal_text, baseline, mastery, target, case_manager, active, version, start_date)
  select g->>'goal_code', g->>'goal_area', g->>'goal_text',
    nullif(g->>'baseline',''), nullif(g->>'mastery',''), nullif(g->>'target',''),
    g->>'case_manager', true, coalesce(nullif(g->>'version','')::int, 1),
    coalesce((g->>'start_date')::date, current_date)
  from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) g;
  get diagnostics v_created = ROW_COUNT;
  return jsonb_build_object('student_code', p_student_code, 'goals_created', v_created);
end;
$$;

CREATE OR REPLACE FUNCTION public.create_student_with_enrollments_and_goals(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
declare v_code text;
begin
  v_code := (payload->'student'->>'code');
  if v_code is null or length(trim(v_code)) = 0 then raise exception 'STUDENT_CODE_REQUIRED'; end if;
  if exists (select 1 from students where code = v_code) then raise exception 'STUDENT_CODE_EXISTS'; end if;
  insert into students (code, active) values (v_code, true);
  insert into enrollments (student_code, class_id, start_date)
  select v_code, (enr->>'class_id')::uuid, coalesce((enr->>'start_date')::date, current_date)
  from jsonb_array_elements(coalesce(payload->'enrollments','[]'::jsonb)) enr;
  insert into goals (goal_code, goal_area, goal_text, baseline, mastery, target, case_manager, active, version, start_date)
  select g->>'goal_code', g->>'goal_area', g->>'goal_text',
    nullif(g->>'baseline',''), nullif(g->>'mastery',''), nullif(g->>'target',''),
    g->>'case_manager', true, 1, coalesce((g->>'start_date')::date, current_date)
  from jsonb_array_elements(coalesce(payload->'goals','[]'::jsonb)) g;
  return jsonb_build_object('student_code', v_code,
    'enrollments_created', jsonb_array_length(coalesce(payload->'enrollments','[]'::jsonb)),
    'goals_created', jsonb_array_length(coalesce(payload->'goals','[]'::jsonb)));
end;
$$;

CREATE OR REPLACE FUNCTION public.replace_goal_version(old_goal_id uuid, new_goal jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
declare v_old record; v_new_id uuid; v_new_version int; v_new_code text;
begin
  select * into v_old from goals where id = old_goal_id;
  if not found then raise exception 'GOAL_NOT_FOUND'; end if;
  if v_old.active = false then raise exception 'GOAL_ALREADY_ARCHIVED'; end if;
  v_new_version := coalesce(v_old.version,1) + 1;
  v_new_code := coalesce(new_goal->>'goal_code', v_old.goal_code || 'v' || v_new_version);
  if exists (select 1 from goals where goal_code = v_new_code) then raise exception 'GOAL_CODE_EXISTS'; end if;
  update goals set active=false where id = old_goal_id;
  insert into goals (goal_code, goal_area, goal_text, baseline, mastery, target, case_manager, active, version, start_date)
  values (v_new_code, coalesce(new_goal->>'goal_area', v_old.goal_area), new_goal->>'goal_text',
    coalesce(nullif(new_goal->>'baseline',''), v_old.baseline),
    coalesce(nullif(new_goal->>'mastery',''), v_old.mastery),
    coalesce(nullif(new_goal->>'target',''), v_old.target),
    coalesce(new_goal->>'case_manager', v_old.case_manager),
    true, v_new_version, coalesce((new_goal->>'start_date')::date, current_date))
  returning id into v_new_id;
  update goals set replaced_by = v_new_id where id = old_goal_id;
  return jsonb_build_object('old_goal_id', old_goal_id, 'new_goal_id', v_new_id, 'version', v_new_version, 'new_code', v_new_code);
end;
$$;
