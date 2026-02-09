-- Add teacher_note column to submission_answers table
-- Allows teachers to provide per-item feedback during manual review

ALTER TABLE public.submission_answers
ADD COLUMN IF NOT EXISTS teacher_note text;

COMMENT ON COLUMN public.submission_answers.teacher_note IS 'Optional teacher feedback/note for this item';
