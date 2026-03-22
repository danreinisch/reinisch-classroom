-- Recall Library
-- Stores a snapshot of assignment metadata each time a teacher recalls an issued assignment.
-- Enables future re-use of recalled assignments without re-building from scratch.
--
-- school_year: integer start year (e.g., 2025 = 2025-2026), Aug cutoff convention.

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

CREATE INDEX IF NOT EXISTS idx_recall_library_school_year    ON public.recall_library(school_year);
CREATE INDEX IF NOT EXISTS idx_recall_library_assignment_id  ON public.recall_library(assignment_id);

ALTER TABLE public.recall_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS recall_library_auth_sel ON public.recall_library
  FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS recall_library_auth_ins ON public.recall_library
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS recall_library_auth_upd ON public.recall_library
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS recall_library_auth_del ON public.recall_library
  FOR DELETE TO authenticated USING (true);
