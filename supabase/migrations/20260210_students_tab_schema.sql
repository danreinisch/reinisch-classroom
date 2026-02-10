-- Students Tab Schema Extensions
-- Adds columns needed for full student and IEP goal management in the Students tab

-- New columns on goals table
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS measurement_type text DEFAULT 'percent';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS data_collector text;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS data_collector_email text;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS class_context text;

-- New columns on students table  
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS iep_due date;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS eval_due date;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS primary_case_manager text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS archived_at timestamptz;
