-- Slice 5A — Objective Evidence Foundation
--
-- Adds normalized child-objective evidence storage only.
--
-- IMPORTANT:
-- - This migration does NOT activate the objective registry.
-- - This migration does NOT invoke sync_goal_objective_registry().
-- - This migration does NOT create objective evidence from historical data.
-- - Existing goal_progress and goal_data_points rows remain untouched.
-- - Parent-only evidence is never inferred downward into child objectives.
-- - Academic assignment scoring remains separate from objective scoring.
--
-- Assignment-linked identity:
--   (assignment_instance_id, item_id, objective_id)
--
-- Manual/binder evidence has no assignment provenance and therefore does not
-- participate in the assignment-source unique index.

BEGIN;

CREATE TABLE IF NOT EXISTS public.objective_data_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  objective_id uuid NOT NULL
    REFERENCES public.goal_objectives(id)
    ON DELETE RESTRICT,

  student_id uuid NOT NULL
    REFERENCES public.students(id)
    ON DELETE RESTRICT,

  assignment_instance_id uuid
    REFERENCES public.assignment_instances(id)
    ON DELETE CASCADE,

  item_id bigint
    REFERENCES public.assignment_items(id)
    ON DELETE CASCADE,

  -- Objective scoring is intentionally independent from academic item points.
  objective_earned numeric NOT NULL,
  objective_max numeric NOT NULL,

  -- Question / response provenance. These fields allow students and teachers
  -- to see what evidence produced an objective percentage instead of seeing
  -- an unexplained number.
  question_text text,
  choices jsonb,
  student_answer text,
  correct_answer text,
  is_correct boolean,

  -- Optional label for one independently scored component of a larger artifact.
  component_label text,

  -- Manual / binder context.
  support_level text,
  evidence_type text,

  source text NOT NULL
    CHECK (source IN ('assignment', 'manual')),
  notes text,

  date date NOT NULL,
  school_year text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (objective_max > 0),
  CHECK (objective_earned >= 0),
  CHECK (objective_earned <= objective_max),

  -- Source and provenance are one contract:
  -- assignment evidence is always linked to its exact source artifact;
  -- manual/binder evidence is always unlinked.
  CHECK (
    (
      source = 'assignment'
      AND assignment_instance_id IS NOT NULL
      AND item_id IS NOT NULL
    )
    OR
    (
      source = 'manual'
      AND assignment_instance_id IS NULL
      AND item_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_objective_data_points_assignment_source
ON public.objective_data_points (
  assignment_instance_id,
  item_id,
  objective_id
)
WHERE
  assignment_instance_id IS NOT NULL
  AND item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_objective_data_points_objective_date
ON public.objective_data_points (
  objective_id,
  date
);

CREATE INDEX IF NOT EXISTS
  idx_objective_data_points_student_date
ON public.objective_data_points (
  student_id,
  date
);

CREATE INDEX IF NOT EXISTS
  idx_objective_data_points_assignment_instance
ON public.objective_data_points (
  assignment_instance_id
);

COMMENT ON TABLE public.objective_data_points IS
  'Normalized evidence for official child IEP objectives. Assignment-linked rows use instance + item + objective identity; manual/binder rows remain unlinked.';

COMMENT ON COLUMN public.objective_data_points.objective_earned IS
  'Earned objective-specific value. This is independent from academic assignment points.';

COMMENT ON COLUMN public.objective_data_points.objective_max IS
  'Maximum objective-specific value. This is independent from academic assignment points.';

COMMENT ON COLUMN public.objective_data_points.question_text IS
  'Question or prompt associated with this objective evidence when applicable.';

COMMENT ON COLUMN public.objective_data_points.choices IS
  'Student-visible answer choices associated with this objective evidence when applicable.';

COMMENT ON COLUMN public.objective_data_points.student_answer IS
  'Student response associated with this objective evidence when applicable.';

COMMENT ON COLUMN public.objective_data_points.correct_answer IS
  'Correct answer associated with this objective evidence when applicable.';

COMMENT ON COLUMN public.objective_data_points.component_label IS
  'Teacher-facing label for one independently scored objective component within an artifact.';

COMMENT ON COLUMN public.objective_data_points.support_level IS
  'Optional prompt/support level for manual or binder evidence.';

COMMENT ON COLUMN public.objective_data_points.evidence_type IS
  'Optional evidence classification such as question, written component, observation, binder, or manual probe.';

COMMENT ON COLUMN public.objective_data_points.source IS
  'Evidence source. Assignment-linked and manual/binder evidence remain distinguishable.';

-- Objective evidence contains IEP-related information and remains server-only.
ALTER TABLE public.objective_data_points
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
  ON TABLE public.objective_data_points
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.objective_data_points
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.objective_data_points
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.objective_data_points
  TO service_role;

COMMIT;
