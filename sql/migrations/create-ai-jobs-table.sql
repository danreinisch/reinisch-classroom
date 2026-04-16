-- Migration: create ai_jobs table
-- Supports background AI generation with Supabase as the persistence/polling layer.
-- Jobs are created with status 'pending', then updated to 'complete' or 'error'.

CREATE TABLE IF NOT EXISTS ai_jobs (
  id             uuid        PRIMARY KEY,
  student_code   text        NOT NULL,
  payload_hash   text        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'complete', 'error')),
  result         jsonb,
  error          text,
  created_by     text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Index for polling by job id (primary key covers this)
-- Index for cache lookup by payload hash + recency
CREATE INDEX IF NOT EXISTS ai_jobs_payload_hash_idx
  ON ai_jobs (payload_hash, created_at DESC)
  WHERE status = 'complete';

-- Index for filtering by student when auditing
CREATE INDEX IF NOT EXISTS ai_jobs_student_code_idx
  ON ai_jobs (student_code, created_at DESC);

-- Row-level security: only service role can access (all teacher auth is done in functions)
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
