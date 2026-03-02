-- Add grading metadata columns to submissions table
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS graded_at timestamptz;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS graded_by text;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS feedback text;
