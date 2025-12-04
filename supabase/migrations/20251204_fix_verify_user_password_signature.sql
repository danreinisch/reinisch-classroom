-- Migration: Fix verify_user_password signature
-- Date: 2025-12-04
-- Description: Fix verify_user_password RPC function to return TABLE instead of boolean.
--              The application code in teacher-login.js and admin-session.js expects
--              this function to return user details (username, role, student_id, user_id)
--              as a table/array, not a boolean.

-- ============================================================================
-- Drop existing verify_user_password function (returns boolean)
-- ============================================================================
DROP FUNCTION IF EXISTS public.verify_user_password(text, text);

-- ============================================================================
-- Recreate verify_user_password with correct TABLE return type
-- ============================================================================
-- Verifies username and password, returns user info on success
-- Returns empty result set if credentials are invalid
-- Usage: select * from verify_user_password('username', 'password');
CREATE OR REPLACE FUNCTION public.verify_user_password(
  p_username text,
  p_password text
)
RETURNS TABLE(
  username text,
  role text,
  student_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user record;
  v_dummy_hash text;
  v_password_valid boolean;
BEGIN
  -- Find user by username (case-insensitive match)
  SELECT * INTO v_user
  FROM public.app_users
  WHERE lower(app_users.username) = lower(p_username);
  
  -- Use a dummy hash for timing-safe comparison when user doesn't exist
  -- This prevents username enumeration through timing analysis
  v_dummy_hash := '$2a$08$0000000000000000000000000000000000000000000000000000';
  
  -- Always perform a crypt operation for consistent timing
  -- Use the real hash if user exists, otherwise use dummy hash
  v_password_valid := (
    COALESCE(v_user.password_hash, v_dummy_hash) = 
    extensions.crypt(p_password, COALESCE(v_user.password_hash, v_dummy_hash))
  );
  
  -- Only return user info if user exists AND password is valid
  IF FOUND AND v_password_valid THEN
    RETURN QUERY
    SELECT 
      v_user.username,
      v_user.role,
      v_user.student_id,
      v_user.id AS user_id;
  END IF;
  
  -- Return empty result for invalid credentials (user not found or wrong password)
  RETURN;
END;
$$;

-- ============================================================================
-- Update verify_student_password to use the new function signature
-- ============================================================================
-- This function depends on verify_user_password, so we need to update it
CREATE OR REPLACE FUNCTION public.verify_student_password(p_code text, p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.verify_user_password(p_code, p_password));
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.verify_user_password(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_user_password(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_user_password(text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.verify_student_password(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_student_password(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_student_password(text, text) TO service_role;

-- ============================================================================
-- Add comment
-- ============================================================================
COMMENT ON FUNCTION public.verify_user_password(text, text) IS 'Verifies username and password, returns user info (username, role, student_id, user_id) on success, empty result on failure';

-- Migration complete
