-- Migration: Fix set_user_password functions to use extensions.crypt with proper search_path
-- Date: 2025-12-16
-- Description: Updates the two overloaded set_user_password functions to ensure they use
--              extensions.crypt() and extensions.gen_salt('bf') with the proper search_path
--              setting to prevent "function crypt(text, text) does not exist" errors.
--              This migration applies the production DB fix to make it reproducible in Git.

-- Drop and recreate the 4-parameter overload: (text, text, text, uuid default null::uuid)
-- This function creates/updates users with username, password, role, and optional student_id
DROP FUNCTION IF EXISTS public.set_user_password(text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.set_user_password(
  p_username text,
  p_password text,
  p_role text,
  p_student_id uuid DEFAULT NULL::uuid
)
RETURNS public.app_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
declare
  v_user public.app_users;
begin
  if p_role not in ('admin','teacher','student','substitute') then
    raise exception 'Invalid role: %', p_role;
  end if;

  insert into public.app_users (username, password_hash, role, student_id)
    values (lower(p_username), extensions.crypt(p_password, extensions.gen_salt('bf')), p_role, p_student_id)
  on conflict (username) do update
    set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
        role = excluded.role,
        student_id = excluded.student_id,
        updated_at = now()
  returning * into v_user;

  return v_user;
end;
$$;

COMMENT ON FUNCTION public.set_user_password(text, text, text, uuid) IS 'Upserts a user with bcrypt-hashed password using extensions.crypt';

-- Drop and recreate the 2-parameter overload: (uuid, text)
-- This function updates password for an existing user by ID
DROP FUNCTION IF EXISTS public.set_user_password(uuid, text);

CREATE OR REPLACE FUNCTION public.set_user_password(
  p_user_id uuid,
  p_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  UPDATE public.app_users
  SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.set_user_password(uuid, text) IS 'Updates password for an existing user by ID using extensions.crypt';

-- Migration complete
-- Note: Both functions now use extensions.crypt() and extensions.gen_salt('bf') with
-- search_path = pg_catalog, public, extensions to ensure pgcrypto functions are accessible.
