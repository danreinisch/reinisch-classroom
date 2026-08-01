-- RC-SEC-02A
-- Make submission_archives a server-only evidence boundary.
--
-- Browser clients use the public Supabase key, so anon/authenticated access
-- must not be able to read or mutate archived student work.
--
-- Trusted Netlify functions use the service_role credential and remain the
-- only production writers/readers for this table.

ALTER TABLE public.submission_archives
  ENABLE ROW LEVEL SECURITY;

-- Remove the permissive production-drift policy identified during audit.
DROP POLICY IF EXISTS
  "Allow all access to submission_archives"
  ON public.submission_archives;

-- Remove any direct table access inherited by browser-facing roles.
REVOKE ALL PRIVILEGES
  ON TABLE public.submission_archives
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.submission_archives
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.submission_archives
  FROM authenticated;

-- Preserve the trusted server boundary explicitly.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.submission_archives
  TO service_role;

COMMENT ON TABLE public.submission_archives IS
  'Server-only archive of historical student submissions and evidence. Browser roles have no direct access.';
