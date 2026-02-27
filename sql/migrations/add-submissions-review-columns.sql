-- Migration: add review columns to submissions table
-- Adds review_status and feedback columns needed by tc-review.js

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS feedback text;
