-- Migration: Make submission_archives.submission_id nullable
-- Paper uploads create archive records without a corresponding digital submission,
-- so submission_id cannot be required for this workflow.
-- student_id is also made nullable to support paper uploads where only a student_code is known.

ALTER TABLE public.submission_archives
  ALTER COLUMN submission_id DROP NOT NULL;

ALTER TABLE public.submission_archives
  ALTER COLUMN student_id DROP NOT NULL;
