-- Reset all student passwords to the canonical {code}! format
-- This ensures every student's actual password matches what the Teacher Center
-- Settings page displays as the default password.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE students
SET password_hash = crypt(code || '!', gen_salt('bf'));

-- RPC function used by admin-reset-passwords Netlify function
CREATE OR REPLACE FUNCTION reset_all_student_passwords()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE students
  SET password_hash = crypt(code || '!', gen_salt('bf'));
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
