-- Fix student auth functions to use app_users table directly with uppercase codes.
-- The app_users table stores student usernames in UPPERCASE (e.g., S043).
-- Previous implementations referenced a nonexistent student_passwords table or
-- used an indirect EXISTS wrapper that could fail; this migration corrects all four
-- student-auth RPC functions.

-- 1. verify_student_password: query app_users directly instead of wrapping
--    verify_user_password with a broken exists check.
CREATE OR REPLACE FUNCTION public.verify_student_password(p_code text, p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE username = p_code
      AND role = 'student'
      AND password_hash = extensions.crypt(p_password, password_hash)
  );
$$;

GRANT EXECUTE ON FUNCTION public.verify_student_password(text, text) TO anon, authenticated, service_role;

-- 2. set_student_password: update app_users directly (not via set_user_password
--    which applies lower() to the username).
CREATE OR REPLACE FUNCTION public.set_student_password(p_code text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.app_users
  SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at    = now()
  WHERE username = p_code
    AND role = 'student';
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_student_password(text, text) TO anon, authenticated, service_role;

-- 3. reset_all_student_passwords: update app_users (the students table has no
--    password_hash column; all auth state lives in app_users).
CREATE OR REPLACE FUNCTION public.reset_all_student_passwords()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.app_users
  SET password_hash = extensions.crypt(username || '!', extensions.gen_salt('bf')),
      updated_at    = now()
  WHERE role = 'student';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_all_student_passwords() TO authenticated, service_role;

-- 4. list_student_password_statuses: query app_users directly; the student_passwords
--    table no longer exists so the previous LEFT JOIN was always NULL.
CREATE OR REPLACE FUNCTION public.list_student_password_statuses()
RETURNS TABLE(student_code text, is_default_password boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.username AS student_code,
    (u.password_hash = extensions.crypt(u.username || '!', u.password_hash)) AS is_default_password
  FROM public.app_users u
  WHERE u.role = 'student';
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_student_password_statuses() TO authenticated, service_role;
