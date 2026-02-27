-- Add review_status column to submissions table (idempotent)
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending' CHECK (review_status IN ('pending', 'in_progress', 'reviewed'));

-- Backfill missing writing_4 assignment_item for assignment 39
-- Assignment 39 used a WRITING WORKSHOP day header that was not previously recognized,
-- so no writing_4 item was created when the assignment was issued.
INSERT INTO public.assignment_items (assignment_id, item_ref, answer_type, points, meta)
SELECT 39, 'writing_4', 'constructed', 0,
  '{"day": 4, "prompt": "", "structure": [], "hints": []}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.assignment_items
  WHERE assignment_id = 39 AND item_ref = 'writing_4'
);
