-- Add school_year column to assignments and assignment_instances
-- school_year stores the starting year of the academic year (e.g., 2025 for 2025-2026)

-- Add column to assignments
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS school_year integer;

-- Add column to assignment_instances
ALTER TABLE public.assignment_instances ADD COLUMN IF NOT EXISTS school_year integer;

-- Backfill assignments: derive school_year from created_at
-- Month >= 8 (Aug-Dec) → year of created_at; Month < 8 (Jan-Jul) → year - 1
UPDATE public.assignments
SET school_year = CASE
  WHEN EXTRACT(MONTH FROM created_at) >= 8 THEN EXTRACT(YEAR FROM created_at)::integer
  ELSE (EXTRACT(YEAR FROM created_at) - 1)::integer
END
WHERE school_year IS NULL;

-- Backfill assignment_instances: derive school_year from assigned_at
-- assignment_instances has assigned_at (date) but no created_at column
UPDATE public.assignment_instances
SET school_year = CASE
  WHEN EXTRACT(MONTH FROM assigned_at) >= 8 THEN EXTRACT(YEAR FROM assigned_at)::integer
  ELSE (EXTRACT(YEAR FROM assigned_at) - 1)::integer
END
WHERE school_year IS NULL AND assigned_at IS NOT NULL;

-- Add indexes for efficient filtering by school year
CREATE INDEX IF NOT EXISTS idx_assignments_school_year ON public.assignments(school_year);
CREATE INDEX IF NOT EXISTS idx_assignment_instances_school_year ON public.assignment_instances(school_year);

-- Add comments
COMMENT ON COLUMN public.assignments.school_year IS 'Academic year start (e.g., 2025 for 2025-2026). Derived from created_at month: Aug-Dec=current year, Jan-Jul=year-1';
COMMENT ON COLUMN public.assignment_instances.school_year IS 'Academic year start (e.g., 2025 for 2025-2026). Stamped at issue time.';
