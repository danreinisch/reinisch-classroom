-- Fix grading columns: ensure teacher_note, review_status, and unique constraint exist
-- teacher_note and review_status may already exist from earlier migrations; this is idempotent.

-- Add teacher_note column to submission_answers (if not already present)
ALTER TABLE public.submission_answers ADD COLUMN IF NOT EXISTS teacher_note text;

-- Add review_status column to submissions (if not already present)
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending';

-- Add unique constraint to support upserts on (submission_id, assignment_item_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'submission_answers_submission_item_unique'
  ) THEN
    ALTER TABLE public.submission_answers
      ADD CONSTRAINT submission_answers_submission_item_unique
      UNIQUE (submission_id, assignment_item_id);
  END IF;
END $$;
