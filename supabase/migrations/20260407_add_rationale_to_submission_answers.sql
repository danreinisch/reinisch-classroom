-- Add rationale column to submission_answers table
-- Stores the AI-generated reasoning for a score, surfaced to students as "AI feedback"
ALTER TABLE public.submission_answers
ADD COLUMN IF NOT EXISTS rationale text;

COMMENT ON COLUMN public.submission_answers.rationale IS 'AI-generated rationale for the score, shown to students as actionable learning feedback';
