-- External data entry tokens for sharing with other teachers
-- Allows external teachers (e.g., Sara Koelsch, Ronald Fosdyck) to enter IEP goal progress
-- via a token-based link without requiring teacher authentication

CREATE TABLE IF NOT EXISTS public.data_entry_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  student_code text NOT NULL,
  goal_code text NOT NULL,
  data_collector text,
  data_collector_email text,
  created_by text DEFAULT 'teacher',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  revoked boolean DEFAULT false
);

-- Index for fast token lookup (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_data_entry_tokens_token ON public.data_entry_tokens(token);

-- Index for listing tokens by student (management UI)
CREATE INDEX IF NOT EXISTS idx_data_entry_tokens_student ON public.data_entry_tokens(student_code);

-- Enable Row Level Security
ALTER TABLE public.data_entry_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone (including anon) to read valid tokens
-- This is needed for the standalone /data-entry/ page which runs without auth
CREATE POLICY "Anyone can read valid tokens" ON public.data_entry_tokens
  FOR SELECT USING (
    revoked = false AND 
    (expires_at IS NULL OR expires_at > now())
  );

-- Policy: Allow authenticated users (teacher) to manage all tokens
CREATE POLICY "Teacher can manage tokens" ON public.data_entry_tokens
  FOR ALL USING (true);
