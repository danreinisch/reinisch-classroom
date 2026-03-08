-- Migration: add 'finalized' to submissions.review_status CHECK constraint
-- This allows a distinct 'finalized' state separate from 'reviewed',
-- so finalized submissions can be permanently excluded from the Review page.

-- Drop the existing check constraint if it exists
ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_review_status_check;

-- Add updated constraint that includes 'finalized'
ALTER TABLE submissions
  ADD CONSTRAINT submissions_review_status_check
    CHECK (review_status IN ('pending', 'in_progress', 'reviewed', 'finalized'));

-- Update column comment to document the new state
COMMENT ON COLUMN submissions.review_status IS
  'Review workflow state: pending | in_progress | reviewed | finalized. '
  'finalized is set when a teacher completes the grading workflow; '
  'finalized submissions are excluded from the active Review queue.';
