-- RC-GOALS-OBJECTIVES-5E2B
-- Persist teacher-reviewed objective-component dispositions that are
-- intentionally NOT progress evidence.
--
-- Hard invariant:
--   Not Scorable != 0%
--
-- Therefore:
-- - Not Scorable rows live OUTSIDE objective_data_points.
-- - Not Scorable creates no child-objective percentage contribution.
-- - Scored objective evidence remains in objective_data_points.
-- - Browser clients never access this table directly.
-- - One reconciliation RPC atomically switches each mapped component
--   between scored evidence and Not Scorable disposition.

BEGIN;

CREATE TABLE IF NOT EXISTS public.objective_review_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  objective_id uuid NOT NULL
    REFERENCES public.goal_objectives(id)
    ON DELETE RESTRICT,

  student_id uuid NOT NULL
    REFERENCES public.students(id)
    ON DELETE RESTRICT,

  assignment_instance_id uuid NOT NULL
    REFERENCES public.assignment_instances(id)
    ON DELETE CASCADE,

  item_id bigint NOT NULL
    REFERENCES public.assignment_items(id)
    ON DELETE CASCADE,

  disposition text NOT NULL
    CHECK (disposition = 'not_scorable'),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (
    assignment_instance_id,
    item_id,
    objective_id
  )
);

CREATE INDEX IF NOT EXISTS
  idx_objective_review_dispositions_instance_item
ON public.objective_review_dispositions (
  assignment_instance_id,
  item_id
);

CREATE INDEX IF NOT EXISTS
  idx_objective_review_dispositions_objective
ON public.objective_review_dispositions (
  objective_id
);

COMMENT ON TABLE public.objective_review_dispositions IS
  'Teacher-reviewed child-objective dispositions that intentionally create no progress evidence. Not Scorable is distinct from measured 0%.';

ALTER TABLE public.objective_review_dispositions
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
  ON TABLE public.objective_review_dispositions
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.objective_review_dispositions
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.objective_review_dispositions
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.objective_review_dispositions
  TO service_role;


CREATE OR REPLACE FUNCTION public.reconcile_objective_review_outcomes(
  p_assignment_instance_id uuid,
  p_item_id bigint,
  p_student_id uuid,
  p_outcomes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_scored integer := 0;
  v_not_scorable integer := 0;
BEGIN
  IF p_assignment_instance_id IS NULL THEN
    RAISE EXCEPTION
      'assignment_instance_id is required';
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION
      'item_id is required';
  END IF;

  IF p_student_id IS NULL THEN
    RAISE EXCEPTION
      'student_id is required';
  END IF;

  IF jsonb_typeof(COALESCE(p_outcomes, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION
      'outcomes must be a JSON array';
  END IF;

  -- Full-item reconciliation:
  -- clear the previously reconciled outcome state for this exact artifact,
  -- then insert the newly authoritative complete outcome set atomically.
  DELETE FROM public.objective_review_dispositions
  WHERE assignment_instance_id = p_assignment_instance_id
    AND item_id = p_item_id;

  DELETE FROM public.objective_data_points
  WHERE assignment_instance_id = p_assignment_instance_id
    AND item_id = p_item_id
    AND source = 'assignment';

  INSERT INTO public.objective_data_points (
    objective_id,
    student_id,
    assignment_instance_id,
    item_id,
    objective_earned,
    objective_max,
    question_text,
    choices,
    student_answer,
    correct_answer,
    is_correct,
    component_label,
    support_level,
    evidence_type,
    source,
    notes,
    date,
    school_year
  )
  SELECT
    outcome.objective_id,
    p_student_id,
    p_assignment_instance_id,
    p_item_id,
    outcome.objective_earned,
    outcome.objective_max,
    outcome.question_text,
    outcome.choices,
    outcome.student_answer,
    outcome.correct_answer,
    outcome.is_correct,
    outcome.component_label,
    outcome.support_level,
    outcome.evidence_type,
    'assignment',
    outcome.notes,
    outcome.date,
    outcome.school_year
  FROM jsonb_to_recordset(
    COALESCE(p_outcomes, '[]'::jsonb)
  ) AS outcome(
    objective_id uuid,
    disposition text,
    objective_earned numeric,
    objective_max numeric,
    question_text text,
    choices jsonb,
    student_answer text,
    correct_answer text,
    is_correct boolean,
    component_label text,
    support_level text,
    evidence_type text,
    notes text,
    date date,
    school_year text
  )
  WHERE outcome.disposition = 'scored';

  GET DIAGNOSTICS v_scored = ROW_COUNT;

  INSERT INTO public.objective_review_dispositions (
    objective_id,
    student_id,
    assignment_instance_id,
    item_id,
    disposition
  )
  SELECT
    outcome.objective_id,
    p_student_id,
    p_assignment_instance_id,
    p_item_id,
    'not_scorable'
  FROM jsonb_to_recordset(
    COALESCE(p_outcomes, '[]'::jsonb)
  ) AS outcome(
    objective_id uuid,
    disposition text
  )
  WHERE outcome.disposition = 'not_scorable';

  GET DIAGNOSTICS v_not_scorable = ROW_COUNT;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(
      COALESCE(p_outcomes, '[]'::jsonb)
    ) AS outcome(
      objective_id uuid,
      disposition text
    )
    WHERE outcome.disposition NOT IN (
      'scored',
      'not_scorable'
    )
  ) THEN
    RAISE EXCEPTION
      'invalid objective review disposition';
  END IF;

  RETURN jsonb_build_object(
    'scored',
    v_scored,
    'not_scorable',
    v_not_scorable
  );
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.reconcile_objective_review_outcomes(
    uuid,
    bigint,
    uuid,
    jsonb
  )
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.reconcile_objective_review_outcomes(
    uuid,
    bigint,
    uuid,
    jsonb
  )
  FROM anon;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.reconcile_objective_review_outcomes(
    uuid,
    bigint,
    uuid,
    jsonb
  )
  FROM authenticated;

GRANT EXECUTE
  ON FUNCTION public.reconcile_objective_review_outcomes(
    uuid,
    bigint,
    uuid,
    jsonb
  )
  TO service_role;

COMMIT;
