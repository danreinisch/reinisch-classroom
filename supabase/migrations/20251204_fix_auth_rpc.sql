-- Fix verify_user_password signature to return user details instead of boolean
-- The app code expects to receive the user's role and ID, not just true/false.
--
-- This migration drops verify_student_password first because it depends on
-- verify_user_password. Both functions are then recreated with correct types.

-- Step 1: Drop dependent function first (verify_student_password depends on verify_user_password)
DROP FUNCTION IF EXISTS public.verify_student_password(text, text);

-- Step 2: Drop verify_user_password
DROP FUNCTION IF EXISTS public.verify_user_password(text, text);

-- Step 3: Recreate verify_user_password with UUID return types (matching app_users schema)
CREATE OR REPLACE FUNCTION public.verify_user_password(
  p_username text,
  p_password text
)
RETURNS table(
  username text,
  role text,
  student_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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
$$;

-- Step 4: Recreate verify_student_password (wrapper for backward compatibility)
CREATE OR REPLACE FUNCTION public.verify_student_password(
  p_code text,
  p_password text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (SELECT 1 FROM public.verify_user_password(p_code, p_password));
$$;

-- Step 5: Grant permissions for both functions
GRANT EXECUTE ON FUNCTION public.verify_user_password(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_student_password(text, text) TO anon, authenticated, service_role;
