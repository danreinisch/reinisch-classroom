-- RC-SEC-02B3
-- Route all data_entry_tokens access through authenticated or
-- token-scoped Netlify Functions using the service role.

ALTER TABLE public.data_entry_tokens
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  "Anyone can read valid tokens"
  ON public.data_entry_tokens;

DROP POLICY IF EXISTS
  "Teacher can manage tokens"
  ON public.data_entry_tokens;

REVOKE ALL PRIVILEGES
  ON TABLE public.data_entry_tokens
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.data_entry_tokens
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.data_entry_tokens
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.data_entry_tokens
  TO service_role;

COMMENT ON TABLE public.data_entry_tokens IS
  'Server-only bearer tokens for external IEP progress entry. Browser roles have no direct table access.';
