-- Fix verify_user_password signature to return user details instead of boolean
-- The app code expects to receive the user's role and ID, not just true/false.

DROP FUNCTION IF EXISTS public.verify_user_password(text, text);

CREATE OR REPLACE FUNCTION public.verify_user_password(
  p_username text,
  p_password text
)
RETURNS table(
  username text,
  role text,
  student_id bigint,
  user_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $
DECLARE
  v_user record;
BEGIN
  -- Find user by username
  SELECT * INTO v_user
  FROM public.app_users
  WHERE app_users.username = p_username;
  
  -- Check if user exists
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Verify password using bcrypt
  IF v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
    -- Password correct - return user info
    RETURN QUERY
    SELECT 
      v_user.username,
      v_user.role,
      v_user.student_id,
      v_user.id AS user_id;
  ELSE
    -- Password incorrect - return empty result
    RETURN;
  END IF;
END;
$;

GRANT EXECUTE ON FUNCTION public.verify_user_password(text, text) TO anon, authenticated, service_role;
