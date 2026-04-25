-- Migration: Add username column to public.teacher
-- Allows the auto-release scheduler to resolve a teacher UUID from the login username
-- stored in teacher_drafts.teacher (which equals app_users.username).

-- 1. Add the column (nullable so existing rows are unaffected)
ALTER TABLE public.teacher
  ADD COLUMN IF NOT EXISTS username text NULL;

-- Document the invariant so future maintainers understand the relationship
COMMENT ON COLUMN public.teacher.username IS
  'Must equal app_users.username for the teacher login account. '
  'Used by the auto-release scheduler to resolve the teacher UUID from '
  'the username stored in teacher_drafts.teacher. '
  'Store in lower-case to match the lower(username) unique index.';

-- 2. Unique index on lower(username) — partial (only where username IS NOT NULL)
--    so NULL rows do not conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS teacher_username_lower_uidx
  ON public.teacher (lower(username))
  WHERE username IS NOT NULL;

-- 3. Backfill: only safe when there is exactly one app_users row with role='teacher'
--    AND exactly one active teacher row.  Otherwise leave username NULL to avoid
--    mis-mapping in a future multi-teacher deployment.
DO $$
DECLARE
  v_username  text;
  v_user_count  int;
  v_teacher_count int;
BEGIN
  SELECT COUNT(*) INTO v_user_count
    FROM public.app_users
   WHERE role = 'teacher';

  SELECT COUNT(*) INTO v_teacher_count
    FROM public.teacher
   WHERE active = true;

  IF v_user_count = 1 AND v_teacher_count = 1 THEN
    SELECT lower(username) INTO v_username
      FROM public.app_users
     WHERE role = 'teacher'
     LIMIT 1;

    UPDATE public.teacher
       SET username = v_username
     WHERE active = true;

    RAISE NOTICE 'teacher.username backfilled to ''%''', v_username;
  ELSE
    RAISE NOTICE
      'Skipping teacher.username backfill: found % app_users row(s) with role=''teacher'' '
      'and % active teacher row(s). Need exactly 1 each to safely backfill.',
      v_user_count, v_teacher_count;
  END IF;
END;
$$;
