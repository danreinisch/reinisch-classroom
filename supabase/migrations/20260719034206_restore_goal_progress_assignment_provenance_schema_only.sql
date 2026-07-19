-- Restore assignment provenance on public.goal_progress.
--
-- Historical repository migrations intended this column to exist, but
-- CREATE TABLE IF NOT EXISTS does not reconcile missing columns on an
-- already-existing table. The live goal_progress table therefore drifted
-- from the repository contract.
--
-- SAFETY DECISION:
-- This migration intentionally performs NO historical data backfill.
--
-- Existing goal_progress rows remain unchanged and will have
-- assignment_instance_id = NULL after the nullable column is added.
--
-- New assignment-generated progress rows can populate the provenance
-- column going forward.
--
-- Historical provenance must never be inferred or guessed from legacy
-- student/goal/date relationships.

ALTER TABLE public.goal_progress
  ADD COLUMN IF NOT EXISTS assignment_instance_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'goal_progress_assignment_instance_id_fkey'
      AND conrelid = 'public.goal_progress'::regclass
  ) THEN
    ALTER TABLE public.goal_progress
      ADD CONSTRAINT goal_progress_assignment_instance_id_fkey
      FOREIGN KEY (assignment_instance_id)
      REFERENCES public.assignment_instances(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS
  idx_goal_progress_assignment_instance
ON public.goal_progress(assignment_instance_id);

COMMENT ON COLUMN public.goal_progress.assignment_instance_id IS
  'Assignment instance that produced this progress measurement; NULL for manual/imported progress and historical rows without explicit provenance.';
