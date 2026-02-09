-- Add review_status column to submissions table
-- Tracks the review workflow state for teacher manual review

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending' CHECK (review_status IN ('pending', 'in_progress', 'reviewed'));

COMMENT ON COLUMN public.submissions.review_status IS 'Review workflow state: pending (not started), in_progress (being reviewed), reviewed (finalized)';

-- Create index for efficient filtering by review status
CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON public.submissions(review_status);
