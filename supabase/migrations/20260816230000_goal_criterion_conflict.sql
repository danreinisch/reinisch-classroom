-- RC-GOALS-04C3A
-- Persist an explicit, source-verified criterion-conflict flag.
--
-- IMPORTANT:
-- - A conflict is never inferred merely because mastery and target differ.
-- - Existing and ordinary goals default to false.
-- - Detailed source context remains in goals.notes.
-- - This migration does not mark any current goal as conflicted.
-- - Production application is a later, separately authorized step.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS
    criterion_conflict boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.goals.criterion_conflict IS
  'True only when official source review confirms competing goal criteria; automatic target/mastery judgments must be suppressed.';

-- Rebuild the three canonical goal-writing RPCs so the explicit
-- flag survives creation and goal-version replacement.

-- 1. add_student_goals(p_student_code text, p_goals jsonb)
CREATE OR REPLACE FUNCTION public.add_student_goals(p_student_code text, p_goals jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
  v_created    int := 0;
BEGIN
  SELECT id INTO v_student_id
  FROM public.students
  WHERE code = p_student_code;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND';
  END IF;

  INSERT INTO public.goals (
    student_id,
    code,
    "desc",
    goal_area,
    baseline,
    mastery,
    target,
    criterion_conflict,
    case_manager,
    active,
    version,
    start_date,
    class_context,
    data_collector,
    data_collector_email,
    measurement_type,
    notes,
    observation_config,
    addressed_in_class,
    individual_delivery
  )
  SELECT
    v_student_id,
    coalesce(g->>'code',                 g->>'goal_code'),
    coalesce(g->>'desc',                 g->>'goal_text'),
    g->>'goal_area',
    nullif(g->>'baseline',          ''),
    nullif(g->>'mastery',           ''),
    nullif(g->>'target',            ''),
    coalesce(
      nullif(g->>'criterion_conflict', '')::boolean,
      false
    ),
    g->>'case_manager',
    true,
    coalesce(nullif(g->>'version',  '')::int, 1),
    coalesce((g->>'start_date')::date, current_date),
    g->>'class_context',
    g->>'data_collector',
    g->>'data_collector_email',
    coalesce(nullif(g->>'measurement_type', ''), 'percent'),
    g->>'notes',
    g->'observation_config',
    coalesce((g->>'addressed_in_class')::boolean, true),
    coalesce((g->>'individual_delivery')::boolean, false)
  FROM jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) g;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN jsonb_build_object('student_code', p_student_code, 'goals_created', v_created);
END;
$$;

-- 2. create_student_with_enrollments_and_goals(payload jsonb)
CREATE OR REPLACE FUNCTION public.create_student_with_enrollments_and_goals(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code       text;
  v_student_id uuid;
BEGIN
  v_code := (payload->'student'->>'code');
  IF v_code IS NULL OR length(trim(v_code)) = 0 THEN
    RAISE EXCEPTION 'STUDENT_CODE_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.students WHERE code = v_code) THEN
    RAISE EXCEPTION 'STUDENT_CODE_EXISTS';
  END IF;

  INSERT INTO public.students (code, active)
  VALUES (v_code, true)
  RETURNING id INTO v_student_id;

  INSERT INTO public.enrollments (student_code, class_id, start_date)
  SELECT
    v_code,
    (enr->>'class_id')::uuid,
    coalesce((enr->>'start_date')::date, current_date)
  FROM jsonb_array_elements(coalesce(payload->'enrollments', '[]'::jsonb)) enr;

  INSERT INTO public.goals (
    student_id,
    code,
    "desc",
    goal_area,
    baseline,
    mastery,
    target,
    criterion_conflict,
    case_manager,
    active,
    version,
    start_date,
    class_context,
    data_collector,
    data_collector_email,
    measurement_type,
    notes,
    observation_config,
    addressed_in_class,
    individual_delivery
  )
  SELECT
    v_student_id,
    coalesce(g->>'code',                 g->>'goal_code'),
    coalesce(g->>'desc',                 g->>'goal_text'),
    g->>'goal_area',
    nullif(g->>'baseline',          ''),
    nullif(g->>'mastery',           ''),
    nullif(g->>'target',            ''),
    coalesce(
      nullif(g->>'criterion_conflict', '')::boolean,
      false
    ),
    g->>'case_manager',
    true,
    1,
    coalesce((g->>'start_date')::date, current_date),
    g->>'class_context',
    g->>'data_collector',
    g->>'data_collector_email',
    coalesce(nullif(g->>'measurement_type', ''), 'percent'),
    g->>'notes',
    g->'observation_config',
    coalesce((g->>'addressed_in_class')::boolean, true),
    coalesce((g->>'individual_delivery')::boolean, false)
  FROM jsonb_array_elements(coalesce(payload->'goals', '[]'::jsonb)) g;

  RETURN jsonb_build_object(
    'student_code',        v_code,
    'enrollments_created', jsonb_array_length(coalesce(payload->'enrollments', '[]'::jsonb)),
    'goals_created',       jsonb_array_length(coalesce(payload->'goals',        '[]'::jsonb))
  );
END;
$$;

-- 3. replace_goal_version(old_goal_id uuid, new_goal jsonb)
CREATE OR REPLACE FUNCTION public.replace_goal_version(old_goal_id uuid, new_goal jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old         record;
  v_new_id      uuid;
  v_new_version int;
  v_new_code    text;
BEGIN
  SELECT * INTO v_old FROM public.goals WHERE id = old_goal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GOAL_NOT_FOUND';
  END IF;
  IF v_old.active = false THEN
    RAISE EXCEPTION 'GOAL_ALREADY_ARCHIVED';
  END IF;

  v_new_version := coalesce(v_old.version, 1) + 1;

  -- Accept either current-style 'code' or old-style 'goal_code' key from caller
  v_new_code := coalesce(
    coalesce(new_goal->>'code', new_goal->>'goal_code'),
    v_old.code || 'v' || v_new_version
  );

  IF EXISTS (
    SELECT 1 FROM public.goals
    WHERE student_id = v_old.student_id AND code = v_new_code
  ) THEN
    RAISE EXCEPTION 'GOAL_CODE_EXISTS';
  END IF;

  -- Retire the old version
  UPDATE public.goals SET active = false WHERE id = old_goal_id;

  -- Insert the new version, carrying forward every enriched field not
  -- explicitly overridden by the caller.
  INSERT INTO public.goals (
    student_id,
    code,
    "desc",
    goal_area,
    baseline,
    mastery,
    target,
    criterion_conflict,
    case_manager,
    active,
    version,
    start_date,
    class_context,
    data_collector,
    data_collector_email,
    measurement_type,
    notes,
    observation_config,
    addressed_in_class,
    individual_delivery
  )
  VALUES (
    v_old.student_id,
    v_new_code,
    coalesce(coalesce(new_goal->>'desc', new_goal->>'goal_text'), v_old."desc"),
    coalesce(new_goal->>'goal_area',              v_old.goal_area),
    coalesce(nullif(new_goal->>'baseline',  ''),  v_old.baseline),
    coalesce(nullif(new_goal->>'mastery',   ''),  v_old.mastery),
    coalesce(nullif(new_goal->>'target',    ''),  v_old.target),
    coalesce(
      nullif(new_goal->>'criterion_conflict', '')::boolean,
      v_old.criterion_conflict
    ),
    coalesce(new_goal->>'case_manager',           v_old.case_manager),
    true,
    v_new_version,
    coalesce((new_goal->>'start_date')::date,     current_date),
    coalesce(new_goal->>'class_context',          v_old.class_context),
    coalesce(new_goal->>'data_collector',         v_old.data_collector),
    coalesce(new_goal->>'data_collector_email',   v_old.data_collector_email),
    coalesce(nullif(new_goal->>'measurement_type', ''), v_old.measurement_type),
    coalesce(new_goal->>'notes',                  v_old.notes),
    coalesce(new_goal->'observation_config',      v_old.observation_config),
    coalesce((new_goal->>'addressed_in_class')::boolean, v_old.addressed_in_class),
    coalesce((new_goal->>'individual_delivery')::boolean, v_old.individual_delivery)
  )
  RETURNING id INTO v_new_id;

  -- Link old goal to its replacement
  UPDATE public.goals SET replaced_by = v_new_id WHERE id = old_goal_id;

  RETURN jsonb_build_object(
    'old_goal_id', old_goal_id,
    'new_goal_id', v_new_id,
    'version',     v_new_version,
    'new_code',    v_new_code
  );
END;
$$;
