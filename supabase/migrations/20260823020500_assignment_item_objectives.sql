-- RC-GOALS-OBJECTIVES-02
-- Add normalized assignment-item → official objective component mappings.
--
-- Slice 2 boundary:
-- - mapping identity only
-- - objective maximum is independent from academic assignment points
-- - no student scoring
-- - no progress/evidence records
-- - no changes to assignment_item_mappings parent-goal / DESE behavior

BEGIN;

CREATE TABLE IF NOT EXISTS public.assignment_item_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  item_id bigint NOT NULL
    REFERENCES public.assignment_items(id)
    ON DELETE CASCADE,

  objective_id uuid NOT NULL
    REFERENCES public.goal_objectives(id)
    ON DELETE RESTRICT,

  component_label text,

  objective_max numeric NOT NULL DEFAULT 1
    CHECK (objective_max > 0),

  component_order integer NOT NULL DEFAULT 1
    CHECK (component_order > 0),

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (item_id, objective_id),
  UNIQUE (item_id, component_order)
);

CREATE INDEX IF NOT EXISTS idx_assignment_item_objectives_item
  ON public.assignment_item_objectives(item_id);

CREATE INDEX IF NOT EXISTS idx_assignment_item_objectives_objective
  ON public.assignment_item_objectives(objective_id);

COMMENT ON TABLE public.assignment_item_objectives IS
  'Normalized mapping of assignment items to official measurable IEP objectives. Mapping metadata only; academic scoring remains separate.';

COMMENT ON COLUMN public.assignment_item_objectives.item_id IS
  'Assignment item whose artifact may provide evidence for the mapped official objective.';

COMMENT ON COLUMN public.assignment_item_objectives.objective_id IS
  'Normalized official child objective from public.goal_objectives.';

COMMENT ON COLUMN public.assignment_item_objectives.component_label IS
  'Optional teacher-facing description for one independently scorable objective component within an artifact.';

COMMENT ON COLUMN public.assignment_item_objectives.objective_max IS
  'Maximum value for the objective component, intentionally independent from assignment_items.points.';

COMMENT ON COLUMN public.assignment_item_objectives.component_order IS
  'Stable display/scoring order for multiple objective components on one assignment item.';

-- Objective mappings contain IEP metadata and are server-only.
ALTER TABLE public.assignment_item_objectives ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
  ON TABLE public.assignment_item_objectives
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.assignment_item_objectives
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.assignment_item_objectives
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.assignment_item_objectives
  TO service_role;


-- Replace one item's complete objective-component mapping set atomically.
-- If any insert fails, PostgreSQL rolls back the preceding DELETE from the
-- same RPC call, preserving the previously valid mapping set.
CREATE OR REPLACE FUNCTION public.replace_assignment_item_objectives(
  p_item_id bigint,
  p_mappings jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION
      'replace_assignment_item_objectives requires p_item_id';
  END IF;

  IF jsonb_typeof(COALESCE(p_mappings, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION
      'replace_assignment_item_objectives requires p_mappings to be a JSON array';
  END IF;

  DELETE FROM public.assignment_item_objectives
  WHERE item_id = p_item_id;

  INSERT INTO public.assignment_item_objectives (
    item_id,
    objective_id,
    component_label,
    objective_max,
    component_order
  )
  SELECT
    p_item_id,
    mapping.objective_id,
    mapping.component_label,
    mapping.objective_max,
    mapping.component_order
  FROM jsonb_to_recordset(
    COALESCE(p_mappings, '[]'::jsonb)
  ) AS mapping(
    objective_id uuid,
    component_label text,
    objective_max numeric,
    component_order integer
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.replace_assignment_item_objectives(bigint, jsonb)
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.replace_assignment_item_objectives(bigint, jsonb)
  FROM anon;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.replace_assignment_item_objectives(bigint, jsonb)
  FROM authenticated;

GRANT EXECUTE
  ON FUNCTION public.replace_assignment_item_objectives(bigint, jsonb)
  TO service_role;

COMMIT;
