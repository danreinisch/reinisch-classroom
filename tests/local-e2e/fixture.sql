-- Reinisch Classroom local E2E synthetic fixture.
--
-- LOCAL TEST USE ONLY.
-- Contains no real teacher or student information.
--
-- This fixture deliberately creates:
--   * one synthetic teacher
--   * one synthetic class
--   * one TARGET student enrolled in that class
--   * one NON-TARGET student who is not enrolled
--   * local-only login credentials for both synthetic students
--   * one goal belonging only to the TARGET student
--
-- It deliberately creates NO assignment, assignment instance, draft,
-- submission, answer, progress row, or data point.
-- Those must be created by the application during E2E certification.

DO $$
BEGIN
  IF current_setting('rc.local_e2e', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION
      'REFUSING TO RUN: rc.local_e2e must be explicitly set to 1';
  END IF;
END
$$;

-- Deterministic synthetic IDs make provenance assertions easy to inspect.

INSERT INTO public.teacher (
  id,
  auth_user_id,
  teacher_code,
  username,
  full_name,
  active
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'E2E_TEACHER',
  'teacher_local',
  'Synthetic E2E Teacher',
  true
);

INSERT INTO public.classes (
  id,
  code,
  name,
  teacher_id
)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  'E2E_CLASS',
  'RC Local E2E Class',
  '10000000-0000-4000-8000-000000000001'
);

-- TARGET: enrolled in the certification class.
INSERT INTO public.students (
  id,
  code,
  name,
  class_id,
  class_code,
  active
)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  'E2E01',
  'E2E01',
  '20000000-0000-4000-8000-000000000001',
  'E2E_CLASS',
  true
);

-- NON-TARGET: exists and can authenticate, but is intentionally not enrolled.
INSERT INTO public.students (
  id,
  code,
  name,
  class_id,
  class_code,
  active
)
VALUES (
  '30000000-0000-4000-8000-000000000099',
  'E2E99',
  'E2E99',
  NULL,
  NULL,
  true
);

INSERT INTO public.class_enrollments (
  id,
  class_id,
  student_id,
  class_code,
  active
)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'E2E_CLASS',
  true
);

-- Compatibility enrollment source used by teacher-issue-draft fallback.
INSERT INTO public.enrollments (
  student_code,
  class_id
)
VALUES (
  'E2E01',
  '20000000-0000-4000-8000-000000000001'
);

-- Both synthetic students use the same explicit LOCAL-ONLY test password:
-- rc-local-e2e
--
-- app_users.student_id remains NULL intentionally because the historical
-- bigint auth column is incompatible with the current UUID students table.
-- Current student authentication resolves classroom identity by student code.

INSERT INTO public.app_users (
  username,
  role,
  student_id,
  password_hash
)
VALUES
(
  'E2E01',
  'student',
  NULL,
  extensions.crypt(
    'rc-local-e2e',
    extensions.gen_salt('bf', 4)
  )
),
(
  'E2E99',
  'student',
  NULL,
  extensions.crypt(
    'rc-local-e2e',
    extensions.gen_salt('bf', 4)
  )
);

-- One goal belongs only to the TARGET student.
-- The eventual assignment mapping will use code E2E.G1.

INSERT INTO public.goals (
  id,
  student_id,
  code,
  "desc",
  description,
  target,
  status,
  active,
  goal_area,
  baseline,
  mastery,
  measurement_type,
  class_context,
  addressed_in_class,
  individual_delivery
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'E2E.G1',
  'Synthetic local E2E goal',
  'Synthetic local E2E goal',
  'Demonstrate the local certification workflow.',
  'Open',
  true,
  'Local E2E',
  '0',
  '80',
  'percent',
  'RC Local E2E Class',
  true,
  false
);

-- Fixture invariants. Fail immediately if targeting boundaries are wrong.

DO $$
DECLARE
  target_enrollments integer;
  nontarget_enrollments integer;
  target_goals integer;
  nontarget_goals integer;
BEGIN
  SELECT count(*)
  INTO target_enrollments
  FROM public.class_enrollments
  WHERE student_id =
    '30000000-0000-4000-8000-000000000001';

  SELECT count(*)
  INTO nontarget_enrollments
  FROM public.class_enrollments
  WHERE student_id =
    '30000000-0000-4000-8000-000000000099';

  SELECT count(*)
  INTO target_goals
  FROM public.goals
  WHERE student_id =
    '30000000-0000-4000-8000-000000000001';

  SELECT count(*)
  INTO nontarget_goals
  FROM public.goals
  WHERE student_id =
    '30000000-0000-4000-8000-000000000099';

  IF target_enrollments <> 1 THEN
    RAISE EXCEPTION
      'Fixture invariant failed: TARGET enrollment count = %',
      target_enrollments;
  END IF;

  IF nontarget_enrollments <> 0 THEN
    RAISE EXCEPTION
      'Fixture invariant failed: NON-TARGET is enrolled';
  END IF;

  IF target_goals <> 1 THEN
    RAISE EXCEPTION
      'Fixture invariant failed: TARGET goal count = %',
      target_goals;
  END IF;

  IF nontarget_goals <> 0 THEN
    RAISE EXCEPTION
      'Fixture invariant failed: NON-TARGET has goal rows';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
