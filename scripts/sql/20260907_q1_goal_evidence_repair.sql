-- Q1 2026-27 goal-evidence repair
--
-- Purpose:
-- Reconstruct item-level evidence from already-stored submission_answers and
-- issued assignment mappings. This does NOT invent mappings and does NOT
-- change official goal math. It is intentionally a data repair, not a schema
-- migration, so it lives under scripts/sql rather than supabase/migrations.
--
-- Guardrails:
-- - Q1 date window only.
-- - active, non-retired goals only.
-- - instructional assignment instances only.
-- - latest stored answer per assignment instance + item.
-- - exact student + goal/item/objective mapping identity.
-- - NOT EXISTS guards make the repair idempotent.
-- - objective repair is limited to the same single-objective auto-scoreable
--   identity used by the production objective evidence writer.

BEGIN;

WITH latest_answers AS (
  SELECT DISTINCT ON (s.instance_id, sa.assignment_item_id)
    s.instance_id,
    s.submitted_at,
    sa.id AS answer_id,
    sa.assignment_item_id AS item_id,
    sa.raw_answer,
    sa.is_correct,
    sa.earned_points,
    sa.max_points
  FROM public.submission_answers sa
  JOIN public.submissions s ON s.id = sa.submission_id
  WHERE s.submitted_at >= '2026-08-16 00:00:00+00'
    AND s.submitted_at <  '2026-10-18 00:00:00+00'
    AND sa.earned_points IS NOT NULL
  ORDER BY
    s.instance_id,
    sa.assignment_item_id,
    s.submitted_at DESC,
    s.id DESC,
    sa.id DESC
),
item_goal_codes AS (
  SELECT DISTINCT x.item_id, x.goal_code
  FROM (
    SELECT
      ai.id AS item_id,
      unnest(coalesce(ai.goal_codes, ARRAY[]::text[])) AS goal_code
    FROM public.assignment_items ai
    UNION ALL
    SELECT
      aim.item_id,
      unnest(coalesce(aim.goal_codes, ARRAY[]::text[])) AS goal_code
    FROM public.assignment_item_mappings aim
  ) x
  WHERE x.goal_code IS NOT NULL
    AND btrim(x.goal_code) <> ''
),
parent_candidates AS (
  SELECT DISTINCT
    la.instance_id,
    la.submitted_at,
    la.item_id,
    la.raw_answer,
    la.is_correct,
    la.earned_points,
    la.max_points,
    inst.student_id,
    inst.school_year,
    ai.points,
    ai.meta,
    g.id AS goal_id,
    g.code AS goal_code,
    COALESCE(
      (
        SELECT gp.date
        FROM public.goal_progress gp
        WHERE gp.assignment_instance_id = la.instance_id
          AND gp.goal_id = g.id
        ORDER BY gp.date DESC, gp.created_at DESC, gp.id DESC
        LIMIT 1
      ),
      la.submitted_at::date
    ) AS evidence_date
  FROM latest_answers la
  JOIN public.assignment_instances inst
    ON inst.id = la.instance_id
  JOIN public.assignment_items ai
    ON ai.id = la.item_id
   AND ai.assignment_id = inst.assignment_id
  JOIN item_goal_codes igc
    ON igc.item_id = la.item_id
  JOIN public.goals g
    ON g.student_id = inst.student_id
   AND g.code = igc.goal_code
  WHERE g.active = true
    AND coalesce(g.status, '') NOT IN ('closed','archived','Closed','Archived')
    AND coalesce((inst.settings->>'non_instructional')::boolean, false) = false
),
inserted_parent AS (
  INSERT INTO public.goal_data_points (
    goal_id,
    student_id,
    assignment_instance_id,
    item_id,
    question_text,
    choices,
    student_answer,
    correct_answer,
    is_correct,
    date,
    source,
    school_year,
    score
  )
  SELECT
    c.goal_id,
    c.student_id,
    c.instance_id,
    c.item_id,
    coalesce(c.meta->>'text', c.meta->>'prompt'),
    c.meta->'choices',
    c.raw_answer->>'value',
    c.meta->>'correct',
    c.is_correct,
    c.evidence_date,
    'assignment',
    coalesce(
      c.school_year::text,
      CASE
        WHEN extract(month from c.evidence_date) >= 8
          THEN extract(year from c.evidence_date)::text
        ELSE (extract(year from c.evidence_date) - 1)::text
      END
    ),
    CASE
      WHEN coalesce(nullif(c.max_points, 0), nullif(c.points, 0)) > 0
        THEN round(
          (c.earned_points / coalesce(nullif(c.max_points, 0), nullif(c.points, 0))) * 100,
          2
        )
      ELSE NULL
    END
  FROM parent_candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.goal_data_points gdp
    WHERE gdp.assignment_instance_id = c.instance_id
      AND gdp.goal_id = c.goal_id
      AND gdp.item_id = c.item_id
  )
  RETURNING id, student_id, goal_id, assignment_instance_id
),
single_objective_mapping AS (
  SELECT
    aio.item_id,
    (array_agg(aio.objective_id ORDER BY aio.id))[1] AS objective_id,
    (array_agg(aio.component_label ORDER BY aio.id))[1] AS component_label,
    (array_agg(aio.objective_max ORDER BY aio.id))[1] AS objective_max
  FROM public.assignment_item_objectives aio
  GROUP BY aio.item_id
  HAVING count(*) = 1
),
objective_candidates AS (
  SELECT
    la.instance_id,
    la.submitted_at,
    la.item_id,
    la.raw_answer,
    la.is_correct,
    la.earned_points,
    la.max_points,
    inst.student_id,
    inst.school_year,
    ai.meta,
    som.objective_id,
    som.component_label,
    som.objective_max
  FROM latest_answers la
  JOIN public.assignment_instances inst
    ON inst.id = la.instance_id
  JOIN public.assignment_items ai
    ON ai.id = la.item_id
   AND ai.assignment_id = inst.assignment_id
  JOIN single_objective_mapping som
    ON som.item_id = la.item_id
  JOIN public.goal_objectives go
    ON go.id = som.objective_id
   AND go.student_id = inst.student_id
   AND go.active = true
  WHERE coalesce((inst.settings->>'non_instructional')::boolean, false) = false
    AND jsonb_typeof(ai.meta->'objective_components') = 'array'
    AND jsonb_array_length(ai.meta->'objective_components') > 0
    AND la.max_points > 0
    AND la.earned_points >= 0
    AND la.earned_points <= la.max_points
    AND som.objective_max > 0
),
inserted_objective AS (
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
    c.objective_id,
    c.student_id,
    c.instance_id,
    c.item_id,
    round((c.earned_points / c.max_points) * c.objective_max, 2),
    c.objective_max,
    coalesce(c.meta->>'text', c.meta->>'prompt'),
    c.meta->'choices',
    c.raw_answer->>'value',
    c.meta->>'correct',
    c.is_correct,
    c.component_label,
    NULL,
    'question',
    'assignment',
    NULL,
    c.submitted_at::date,
    coalesce(
      c.school_year::text,
      CASE
        WHEN extract(month from c.submitted_at) >= 8
          THEN extract(year from c.submitted_at)::text
        ELSE (extract(year from c.submitted_at) - 1)::text
      END
    )
  FROM objective_candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.objective_data_points odp
    WHERE odp.assignment_instance_id = c.instance_id
      AND odp.objective_id = c.objective_id
      AND odp.item_id = c.item_id
  )
  RETURNING id, student_id, objective_id, assignment_instance_id
)
SELECT
  (SELECT count(*) FROM inserted_parent) AS parent_evidence_rows_inserted,
  (SELECT count(DISTINCT student_id) FROM inserted_parent) AS parent_students_repaired,
  (SELECT count(DISTINCT goal_id) FROM inserted_parent) AS parent_goals_repaired,
  (SELECT count(DISTINCT assignment_instance_id) FROM inserted_parent) AS parent_assignments_repaired,
  (SELECT count(*) FROM inserted_objective) AS objective_evidence_rows_inserted,
  (SELECT count(DISTINCT student_id) FROM inserted_objective) AS objective_students_repaired;

COMMIT;
