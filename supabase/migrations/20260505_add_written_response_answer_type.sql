-- Migration: Allow 'written_response' as a valid answer_type in assignment_items
-- Required to issue final exam drafts that contain Question 25 ([WRITTEN RESPONSE]).
--
-- The parser correctly tags these questions with answer_type='written_response',
-- but the original CHECK constraint only allowed: 'mcq', 'multi', 'boolean', 'constructed'.
-- This migration extends the constraint to also permit 'written_response'.

ALTER TABLE public.assignment_items
  DROP CONSTRAINT IF EXISTS assignment_items_answer_type_check;

ALTER TABLE public.assignment_items
  ADD CONSTRAINT assignment_items_answer_type_check
  CHECK (answer_type = ANY (ARRAY[
    'mcq'::text,
    'multi'::text,
    'boolean'::text,
    'constructed'::text,
    'written_response'::text
  ]));
