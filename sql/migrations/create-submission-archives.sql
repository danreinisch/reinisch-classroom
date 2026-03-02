-- Migration: create submission_archives table for DESE compliance auditing
-- Stores a self-contained snapshot of each finalized submission

CREATE TABLE IF NOT EXISTS public.submission_archives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    student_id uuid NOT NULL,
    student_code text NOT NULL,
    assignment_id text NOT NULL,
    title text NOT NULL,
    class_name text,
    answers jsonb,
    score_auto numeric,
    score_manual numeric,
    score_total numeric,
    feedback text,
    iep_goal_codes jsonb DEFAULT '[]'::jsonb,
    dese_standard_codes jsonb DEFAULT '[]'::jsonb,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT submission_archives_pkey PRIMARY KEY (id)
);

ALTER TABLE public.submission_archives OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_submission_archives_submission_id
    ON public.submission_archives USING btree (submission_id);

CREATE INDEX IF NOT EXISTS idx_submission_archives_student_id
    ON public.submission_archives USING btree (student_id);

CREATE INDEX IF NOT EXISTS idx_submission_archives_assignment_id
    ON public.submission_archives USING btree (assignment_id);
