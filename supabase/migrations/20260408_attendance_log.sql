-- ============================================================================
-- P3-C: Attendance Log Table
-- Auto-populated from observation data; also supports manual entry.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  student_code text NOT NULL,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'tardy')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'observation_auto')),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_code, date)
);

-- Index for efficient per-student and date-range queries
CREATE INDEX IF NOT EXISTS attendance_log_student_code_date_idx
  ON public.attendance_log (student_code, date);

-- Enable Row Level Security
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated staff full access (matches pattern used by goal_progress and other tables)
CREATE POLICY IF NOT EXISTS "attendance_log_all_for_staff"
  ON public.attendance_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
