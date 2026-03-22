-- Add recall_library table
-- When a teacher recalls an assignment, a record is saved here for future re-use.
-- school_year follows the Aug cutoff convention (e.g., 2025 = 2025-2026 school year).

CREATE TABLE IF NOT EXISTS public.recall_library (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id bigint REFERENCES public.assignments(id) ON DELETE SET NULL,
  title        text NOT NULL,
  type         text,
  series       text,
  meta         jsonb,
  recalled_at  timestamptz NOT NULL DEFAULT now(),
  recalled_by  text NOT NULL,
  school_year  integer,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient school_year filtering (matches pattern from PR 5)
CREATE INDEX IF NOT EXISTS idx_recall_library_school_year ON public.recall_library(school_year);
CREATE INDEX IF NOT EXISTS idx_recall_library_assignment_id ON public.recall_library(assignment_id);

-- Enable Row Level Security
ALTER TABLE public.recall_library ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (matches pattern in 010_teacher_drafts.sql)
CREATE POLICY IF NOT EXISTS recall_library_auth_sel ON public.recall_library
  FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS recall_library_auth_ins ON public.recall_library
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS recall_library_auth_upd ON public.recall_library
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS recall_library_auth_del ON public.recall_library
  FOR DELETE TO authenticated USING (true);

-- Comments
COMMENT ON TABLE  public.recall_library IS 'Preserves assignment metadata when a teacher recalls an issued assignment.';
COMMENT ON COLUMN public.recall_library.school_year IS 'Academic year start when recall occurred (e.g., 2025 for 2025-2026).';
COMMENT ON COLUMN public.recall_library.assignment_id IS 'FK to assignments; SET NULL if the assignment is later deleted.';
COMMENT ON COLUMN public.recall_library.reason IS 'Optional teacher-supplied reason for the recall.';
