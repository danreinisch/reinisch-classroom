-- Teacher Center Work Drafts
-- Persists draft assignments created on /teacher/work/
--
-- DEPENDENCY: Requires update_updated_at_column() function from sql-extras/01_triggers_updated_at.sql
-- If that function hasn't been applied, the trigger creation will fail gracefully
-- (table still works, just without auto-updated timestamps).

CREATE TABLE IF NOT EXISTS teacher_drafts (
  id text PRIMARY KEY,                    -- matches the client-side draft.id (e.g., "d_abc123_xyz")
  teacher text NOT NULL DEFAULT 'default', -- teacher identifier (for future multi-teacher support)
  title text NOT NULL,
  class_name text,
  release_at timestamptz,
  due_at timestamptz,
  notes text,
  assignment jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { kind, name, link, text }
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { kind, name, text }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for listing drafts by teacher
CREATE INDEX IF NOT EXISTS idx_teacher_drafts_teacher ON teacher_drafts(teacher);
CREATE INDEX IF NOT EXISTS idx_teacher_drafts_updated ON teacher_drafts(updated_at DESC);

-- Enable RLS
ALTER TABLE teacher_drafts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (same pattern as other tables)
CREATE POLICY IF NOT EXISTS teacher_drafts_auth_sel ON teacher_drafts 
  FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS teacher_drafts_auth_ins ON teacher_drafts 
  FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS teacher_drafts_auth_upd ON teacher_drafts 
  FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS teacher_drafts_auth_del ON teacher_drafts 
  FOR DELETE USING (true);

-- Updated_at trigger (depends on update_updated_at_column() from sql-extras)
DROP TRIGGER IF EXISTS update_teacher_drafts_updated_at ON teacher_drafts;
CREATE TRIGGER update_teacher_drafts_updated_at
    BEFORE UPDATE ON teacher_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
