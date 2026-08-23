-- RC-GOALS-OBJECTIVES-01
-- Add the canonical 2026-27 official IEP objective/benchmark registry.
--
-- Source of truth:
--   00 — Student IEP Goals & Classroom Supports
--   Tab: Goal Objectives
--
-- SAFETY:
-- - Parent goals remain the legal/controlling IEP goals.
-- - This migration does not insert, update, delete, rename, or replace parent goals.
-- - Child rows are resolved only against an existing active parent belonging to
--   the same student.
-- - Missing or mismatched parents are blocking errors.
-- - Official source text/criteria are preserved as stored; conflicts are not guessed
--   or reconciled.
-- - Re-running this migration is idempotent by objective code.
-- - This slice creates registry identity only. It creates no scoring/progress evidence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.goal_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id uuid NOT NULL
    REFERENCES public.students(id)
    ON DELETE RESTRICT,

  parent_goal_id uuid NOT NULL
    REFERENCES public.goals(id)
    ON DELETE RESTRICT,

  student_code text NOT NULL,
  parent_goal_code text NOT NULL,
  code text NOT NULL,

  goal_area text,
  objective_number integer NOT NULL
    CHECK (objective_number > 0),

  objective_text text NOT NULL,
  baseline text,
  objective_wording_criterion text,
  mastery_field text,
  parent_goal_criterion text,
  measurement_method text,
  progress_reporting text,
  dan_monitoring_role text,
  assignment_evidence_mode text,
  rc_objective_status text,
  source_qa_notes text,

  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (code),
  UNIQUE (parent_goal_id, objective_number),

  CHECK (student_code ~ '^S[0-9]{3}$'),
  CHECK (parent_goal_code ~ '^S[0-9]{3}\.CG[0-9]+$'),
  CHECK (code ~ '^S[0-9]{3}\.CG[0-9]+\.O[0-9]+$')
);

COMMENT ON TABLE public.goal_objectives IS
  'Official measurable objectives/benchmarks nested under current legal IEP parent goals. Parent-only evidence must never be inferred downward into these child identities.';

COMMENT ON COLUMN public.goal_objectives.parent_goal_id IS
  'Existing controlling public.goals row for this objective. The objective never replaces or renames its parent goal.';

COMMENT ON COLUMN public.goal_objectives.code IS
  'Stable child objective identity in S###.CG#.O# form.';

COMMENT ON COLUMN public.goal_objectives.objective_text IS
  'Official objective/benchmark wording preserved from the canonical Goal Objectives source.';

COMMENT ON COLUMN public.goal_objectives.objective_wording_criterion IS
  'Criterion stated inside the official objective wording, preserved separately from any mastery field.';

COMMENT ON COLUMN public.goal_objectives.mastery_field IS
  'Separate official mastery field when present; never silently reconciled with wording criterion.';

COMMENT ON COLUMN public.goal_objectives.source_qa_notes IS
  'Source/QA note preserved from the canonical Goal Objectives registry.';

-- New IEP registry data is server-only. Browser roles receive no direct table access.
ALTER TABLE public.goal_objectives ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_objectives
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_objectives
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.goal_objectives
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.goal_objectives
  TO service_role;

-- ---------------------------------------------------------------------------
-- Canonical seed fixture
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_goal_objective_registry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_parent_count integer;
  v_problem text;
BEGIN
  -- The current S###.CG# parent identities are production data, not replayable
  -- repository seed data. Therefore schema migration creates this explicit
  -- import operation but does NOT invoke it automatically.
  --
  -- When deliberately invoked later, import remains fail-loud if any canonical
  -- student/parent relationship is missing or inactive.
  DROP TABLE IF EXISTS pg_temp._goal_objective_seed;

CREATE TEMP TABLE _goal_objective_seed (
  student_code text NOT NULL,
  parent_goal_code text NOT NULL,
  code text NOT NULL,
  goal_area text,
  objective_number integer NOT NULL,
  objective_text text NOT NULL,
  baseline text,
  objective_wording_criterion text,
  mastery_field text,
  parent_goal_criterion text,
  measurement_method text,
  progress_reporting text,
  dan_monitoring_role text,
  assignment_evidence_mode text,
  rc_objective_status text,
  source_qa_notes text
) ON COMMIT DROP;

INSERT INTO _goal_objective_seed (
  student_code,
  parent_goal_code,
  code,
  goal_area,
  objective_number,
  objective_text,
  baseline,
  objective_wording_criterion,
  mastery_field,
  parent_goal_criterion,
  measurement_method,
  progress_reporting,
  dan_monitoring_role,
  assignment_evidence_mode,
  rc_objective_status,
  source_qa_notes
)
VALUES
(
  'S008',
  'S008.CG2',
  'S008.CG2.O1',
  'Reading Comprehension',
  1,
  'At least three key details to support the main idea',
  NULL,
  NULL,
  NULL,
  '70% overall',
  'Observation Chart; Other',
  'Quarterly',
  'Primary',
  'RC reading / retell evidence',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S008',
  'S008.CG2',
  'S008.CG2.O2',
  'Reading Comprehension',
  2,
  'Correct sequence',
  NULL,
  NULL,
  NULL,
  '70% overall',
  'Observation Chart; Other',
  'Quarterly',
  'Primary',
  'RC sequencing / retell evidence',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S009',
  'S009.CG1',
  'S009.CG1.O1',
  'Basic Reading',
  1,
  'Prefix',
  '37%',
  NULL,
  NULL,
  '80% overall',
  'Data Collection; Observation Chart; Checklists',
  'Quarterly',
  'Primary',
  'Targeted decoding/morphology probe',
  'Pending RC objective support',
  'Source objective field names Prefix and Suffix and supplies baselines only; parent goal also mentions root words, but no separate numbered root-word objective is listed.'
),
(
  'S009',
  'S009.CG1',
  'S009.CG1.O2',
  'Basic Reading',
  2,
  'Suffix',
  '53%',
  NULL,
  NULL,
  '80% overall',
  'Data Collection; Observation Chart; Checklists',
  'Quarterly',
  'Primary',
  'Targeted decoding/morphology probe',
  'Pending RC objective support',
  'Source objective field names Prefix and Suffix and supplies baselines only; parent goal also mentions root words, but no separate numbered root-word objective is listed.'
),
(
  'S009',
  'S009.CG2',
  'S009.CG2.O1',
  'Reading Comprehension',
  1,
  'Answering literal questions',
  NULL,
  NULL,
  NULL,
  '80% overall',
  'Work samples; Observation Chart',
  'Quarterly',
  'Primary',
  'RC literal-comprehension items',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S009',
  'S009.CG2',
  'S009.CG2.O2',
  'Reading Comprehension',
  2,
  'Answering inferential questions',
  NULL,
  NULL,
  NULL,
  '80% overall',
  'Work samples; Observation Chart',
  'Quarterly',
  'Primary',
  'RC inference items',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S009',
  'S009.CG4',
  'S009.CG4.O1',
  'Written Expression',
  1,
  'Topic/Claim',
  '47%',
  NULL,
  NULL,
  '80% overall',
  'Work samples; Data Collection',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S009',
  'S009.CG4',
  'S009.CG4.O2',
  'Written Expression',
  2,
  'Three supporting details',
  '47%',
  NULL,
  NULL,
  '80% overall',
  'Work samples; Data Collection',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S009',
  'S009.CG4',
  'S009.CG4.O3',
  'Written Expression',
  3,
  'Conclusion',
  '47%',
  NULL,
  NULL,
  '80% overall',
  'Work samples; Data Collection',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S015',
  'S015.CG1',
  'S015.CG1.O1',
  'Life Skills Reading Skills',
  1,
  'Read and follow directions',
  '54%',
  '65% accuracy',
  '70%',
  'Per objective',
  'Observation Chart',
  'Quarterly',
  'Primary',
  'Binder / teacher-recorded performance',
  'Pending RC objective support',
  'Source preserves both objective wording criterion (65%) and separate Mastery field (70%); do not reconcile by guess.'
),
(
  'S015',
  'S015.CG1',
  'S015.CG1.O2',
  'Life Skills Reading Skills',
  2,
  'Answer questions about what is happening in a picture or reading passage',
  '60%',
  '70% accuracy',
  '80%',
  'Per objective',
  'Observation Chart',
  'Quarterly',
  'Primary',
  'Binder / teacher-recorded performance',
  'Pending RC objective support',
  'Source preserves both objective wording criterion (70%) and separate Mastery field (80%); do not reconcile by guess.'
),
(
  'S015',
  'S015.CG1',
  'S015.CG1.O3',
  'Life Skills Reading Skills',
  3,
  'Answer questions about why something is happening in a picture or reading passage',
  '55%',
  '65% accuracy',
  '65%',
  'Per objective',
  'Observation Chart',
  'Quarterly',
  'Primary',
  'Binder / teacher-recorded performance',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S015',
  'S015.CG2',
  'S015.CG2.O1',
  'Life Skills Writing Skills',
  1,
  'Write a sentence describing what is happening in a picture',
  NULL,
  '45% accuracy',
  NULL,
  'Per objective',
  'Work samples',
  'Quarterly',
  'Primary',
  'Binder writing sample',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S015',
  'S015.CG2',
  'S015.CG2.O2',
  'Life Skills Writing Skills',
  2,
  'Write up to 3 sentences answering questions about a text he has read',
  'Currently writing 1 sentence',
  NULL,
  NULL,
  'Per objective',
  'Work samples',
  'Quarterly',
  'Primary',
  'Binder writing sample',
  'Pending RC objective support',
  'Source states current performance as 1 sentence; no separate percentage criterion is stated for Objective 2.'
),
(
  'S015',
  'S015.CG4',
  'S015.CG4.O1',
  'Life Skills Transition',
  1,
  'Identify the parts of a recipe',
  NULL,
  '5 of 7 opportunities',
  NULL,
  'Per objective',
  'Data Collection; Observation Chart',
  'Quarterly',
  'Primary',
  'Binder / functional performance',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S015',
  'S015.CG4',
  'S015.CG4.O2',
  'Life Skills Transition',
  2,
  'Follow the recipe when cooking',
  NULL,
  '5 of 6 opportunities',
  NULL,
  'Per objective',
  'Data Collection; Observation Chart',
  'Quarterly',
  'Primary',
  'Binder / functional performance',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S049',
  'S049.CG3',
  'S049.CG3.O1',
  'Written Expression',
  1,
  'Use a period when appropriate instead of the word "and"',
  '20%',
  NULL,
  '80%',
  '70% overall',
  'Work samples; Other',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S049',
  'S049.CG3',
  'S049.CG3.O2',
  'Written Expression',
  2,
  'Use transition words while composing her paragraph',
  '20%',
  NULL,
  '80%',
  '70% overall',
  'Work samples; Other',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S051',
  'S051.CG4',
  'S051.CG4.O1',
  'Written Expression',
  1,
  'Write in complete thoughts',
  NULL,
  NULL,
  NULL,
  '80% overall',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing / editing component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S051',
  'S051.CG4',
  'S051.CG4.O2',
  'Written Expression',
  2,
  'Write using topic statement, supports and conclusion',
  NULL,
  NULL,
  NULL,
  '80% overall',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S052',
  'S052.CG2',
  'S052.CG2.O1',
  'Written Expression',
  1,
  'Respond to comprehension questions or writing prompts using grammatically correct sentences',
  NULL,
  '75% accuracy',
  NULL,
  'Mixed by objective',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S052',
  'S052.CG2',
  'S052.CG2.O2',
  'Written Expression',
  2,
  'Correct punctuation (ending commas in compound sentences)',
  NULL,
  '90% accuracy',
  NULL,
  'Mixed by objective',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Source wording is preserved as written; do not silently normalize the punctuation phrase.'
),
(
  'S052',
  'S052.CG2',
  'S052.CG2.O3',
  'Written Expression',
  3,
  'Capitalization (proper nouns and beginning of sentences)',
  NULL,
  '90% accuracy',
  NULL,
  'Mixed by objective',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S053',
  'S053.CG2',
  'S053.CG2.O1',
  'Written Expression',
  1,
  'Compound sentences',
  '40%',
  NULL,
  '80%',
  '80% overall',
  'Work samples; Data Collection; Other',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S053',
  'S053.CG2',
  'S053.CG2.O2',
  'Written Expression',
  2,
  'Use Transitional words independently',
  '68%',
  NULL,
  '80%',
  '80% overall',
  'Work samples; Data Collection; Other',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S053',
  'S053.CG2',
  'S053.CG2.O3',
  'Written Expression',
  3,
  'Include a conclusion sentence for each topic',
  '50%',
  NULL,
  '80%',
  '80% overall',
  'Work samples; Data Collection; Other',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S053',
  'S053.CG2',
  'S053.CG2.O4',
  'Written Expression',
  4,
  'Use adjectives within his sentences',
  '40%',
  NULL,
  '80%',
  '80% overall',
  'Work samples; Data Collection; Other',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S059',
  'S059.CG3',
  'S059.CG3.O1',
  'Written Expression',
  1,
  'Write 5 sentences on a topic using sentence starters',
  NULL,
  NULL,
  NULL,
  '60% overall',
  'Work samples; Data Collection',
  'Quarterly',
  'Primary',
  'Writing sample + support-level component',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S059',
  'S059.CG3',
  'S059.CG3.O2',
  'Written Expression',
  2,
  'Write 5 sentences on a topic with moderate prompting',
  NULL,
  NULL,
  NULL,
  '60% overall',
  'Work samples; Data Collection',
  'Quarterly',
  'Primary',
  'Writing sample + support-level component',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),

(
  'S065',
  'S065.CG1',
  'S065.CG1.O1',
  'Reading Comprehension',
  1,
  'Identify the authors purpose',
  '30%',
  NULL,
  '80%',
  '80% overall',
  'Work samples; Data Collection; Curriculum based tests',
  'Quarterly',
  'Primary',
  'RC / targeted reading item',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S065',
  'S065.CG1',
  'S065.CG1.O2',
  'Reading Comprehension',
  2,
  'Identify the main idea in non fiction texts and the theme in fictional texts',
  '43%',
  NULL,
  '80%',
  '80% overall',
  'Work samples; Data Collection; Curriculum based tests',
  'Quarterly',
  'Primary',
  'RC / targeted reading item',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S065',
  'S065.CG1',
  'S065.CG1.O3',
  'Reading Comprehension',
  3,
  'Explain the cause and effect relationship',
  '28%',
  NULL,
  '80%',
  '80% overall',
  'Work samples; Data Collection; Curriculum based tests',
  'Quarterly',
  'Primary',
  'RC / targeted reading item',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S065',
  'S065.CG2',
  'S065.CG2.O1',
  'Written Expression',
  1,
  'Write an introduction sentence',
  '50%',
  NULL,
  '80%',
  '80% overall',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S065',
  'S065.CG2',
  'S065.CG2.O2',
  'Written Expression',
  2,
  'Write a conclusion sentence',
  '50%',
  NULL,
  '80%',
  '80% overall',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
),
(
  'S065',
  'S065.CG2',
  'S065.CG2.O3',
  'Written Expression',
  3,
  'Use compound sentences within her paragraph',
  '40%',
  NULL,
  '80%',
  '80% overall',
  'Work samples',
  'Quarterly',
  'Primary',
  'Writing-sample component score',
  'Pending RC objective support',
  'Official numbered objective/benchmark from current IEP goal text.'
);

-- ---------------------------------------------------------------------------
-- Seed integrity and parent-resolution blockers
-- ---------------------------------------------------------------------------

  SELECT count(*)
  INTO v_count
  FROM _goal_objective_seed;

  IF v_count <> 35 THEN
    RAISE EXCEPTION
      'GOAL_OBJECTIVE_SEED_COUNT_MISMATCH: expected 35, found %',
      v_count;
  END IF;

  SELECT count(DISTINCT parent_goal_code)
  INTO v_parent_count
  FROM _goal_objective_seed;

  IF v_parent_count <> 14 THEN
    RAISE EXCEPTION
      'GOAL_OBJECTIVE_PARENT_COUNT_MISMATCH: expected 14, found %',
      v_parent_count;
  END IF;

  SELECT seed.code
  INTO v_problem
  FROM _goal_objective_seed seed
  WHERE seed.code <> seed.parent_goal_code || '.O' || seed.objective_number
     OR split_part(seed.code, '.', 1) <> seed.student_code
  LIMIT 1;

  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION
      'GOAL_OBJECTIVE_IDENTITY_MISMATCH: %',
      v_problem;
  END IF;

  SELECT seed.code
  INTO v_problem
  FROM _goal_objective_seed seed
  LEFT JOIN public.students s
    ON s.code = seed.student_code
  LEFT JOIN public.goals g
    ON g.student_id = s.id
   AND g.code = seed.parent_goal_code
   AND g.active = true
   AND (
     g.status IS NULL
     OR lower(g.status) NOT IN ('closed', 'archived')
   )
  WHERE s.id IS NULL
     OR g.id IS NULL
  LIMIT 1;

  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION
      'GOAL_OBJECTIVE_PARENT_NOT_FOUND_OR_INACTIVE: %',
      v_problem;
  END IF;
-- ---------------------------------------------------------------------------
-- Idempotent canonical registry import
-- ---------------------------------------------------------------------------

INSERT INTO public.goal_objectives (
  student_id,
  parent_goal_id,
  student_code,
  parent_goal_code,
  code,
  goal_area,
  objective_number,
  objective_text,
  baseline,
  objective_wording_criterion,
  mastery_field,
  parent_goal_criterion,
  measurement_method,
  progress_reporting,
  dan_monitoring_role,
  assignment_evidence_mode,
  rc_objective_status,
  source_qa_notes,
  active
)
SELECT
  s.id,
  g.id,
  seed.student_code,
  seed.parent_goal_code,
  seed.code,
  seed.goal_area,
  seed.objective_number,
  seed.objective_text,
  seed.baseline,
  seed.objective_wording_criterion,
  seed.mastery_field,
  seed.parent_goal_criterion,
  seed.measurement_method,
  seed.progress_reporting,
  seed.dan_monitoring_role,
  seed.assignment_evidence_mode,
  seed.rc_objective_status,
  seed.source_qa_notes,
  true
FROM _goal_objective_seed seed
JOIN public.students s
  ON s.code = seed.student_code
JOIN public.goals g
  ON g.student_id = s.id
 AND g.code = seed.parent_goal_code
 AND g.active = true
 AND (
   g.status IS NULL
   OR lower(g.status) NOT IN ('closed', 'archived')
 )
ON CONFLICT (code) DO UPDATE
SET
  student_id = EXCLUDED.student_id,
  parent_goal_id = EXCLUDED.parent_goal_id,
  student_code = EXCLUDED.student_code,
  parent_goal_code = EXCLUDED.parent_goal_code,
  goal_area = EXCLUDED.goal_area,
  objective_number = EXCLUDED.objective_number,
  objective_text = EXCLUDED.objective_text,
  baseline = EXCLUDED.baseline,
  objective_wording_criterion = EXCLUDED.objective_wording_criterion,
  mastery_field = EXCLUDED.mastery_field,
  parent_goal_criterion = EXCLUDED.parent_goal_criterion,
  measurement_method = EXCLUDED.measurement_method,
  progress_reporting = EXCLUDED.progress_reporting,
  dan_monitoring_role = EXCLUDED.dan_monitoring_role,
  assignment_evidence_mode = EXCLUDED.assignment_evidence_mode,
  rc_objective_status = EXCLUDED.rc_objective_status,
  source_qa_notes = EXCLUDED.source_qa_notes,
  active = true;

  RETURN jsonb_build_object(
    'objectives_synced', v_count,
    'parent_goals', v_parent_count
  );
END;
$$;

COMMENT ON FUNCTION public.sync_goal_objective_registry() IS
  'Explicit idempotent import of the 35 canonical 2026-27 child objectives. Fails if any required active S###.CG# parent cannot be resolved to the same student. Not auto-invoked by migration replay.';

REVOKE ALL PRIVILEGES
  ON FUNCTION public.sync_goal_objective_registry()
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.sync_goal_objective_registry()
  FROM anon;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.sync_goal_objective_registry()
  FROM authenticated;

GRANT EXECUTE
  ON FUNCTION public.sync_goal_objective_registry()
  TO service_role;

COMMIT;
