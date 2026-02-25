-- Add function to check student password statuses
-- Returns whether each student is using the default password ({code}!) or a custom one.
-- Used by Teacher Center Settings to accurately display password state instead of
-- showing a fake assumed default.
--
-- Returns:
--   student_code       - the student's code (e.g. S001)
--   is_default_password - true  = password is currently {code}! (the default)
--                         false = password has been changed to something custom
--                         null  = no entry in student_passwords (password not yet set via this table)

CREATE OR REPLACE FUNCTION public.list_student_password_statuses()
RETURNS TABLE(student_code text, is_default_password boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.code AS student_code,
    CASE
      WHEN sp.student_id IS NULL THEN NULL::boolean
      ELSE (sp.password_hash = extensions.crypt(s.code || '!', sp.password_hash))
    END AS is_default_password
  FROM students s
  LEFT JOIN student_passwords sp ON sp.student_id = s.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_student_password_statuses() TO authenticated, service_role;
