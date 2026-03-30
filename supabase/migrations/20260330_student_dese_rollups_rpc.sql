-- RPC function: student_dese_rollups
-- Returns aggregated DESE standard performance for a student in a given school year.
-- Usage: supabase.rpc('student_dese_rollups', { p_student_id: '<uuid>', p_school_year: 2025 })

CREATE OR REPLACE FUNCTION public.student_dese_rollups(
  p_student_id uuid,
  p_school_year integer
)
RETURNS TABLE (
  dese_code       text,
  percent_correct numeric,
  total_earned    numeric,
  total_possible  numeric,
  item_count      bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    unnest(aim.dese_codes) AS dese_code,
    round(
      (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
      1
    ) AS percent_correct,
    sum(sa.earned_points)::numeric AS total_earned,
    sum(sa.max_points)::numeric AS total_possible,
    count(*) AS item_count
  FROM public.submission_answers sa
  JOIN public.assignment_items ai_item ON ai_item.id = sa.assignment_item_id
  JOIN public.assignment_item_mappings aim ON aim.item_id = ai_item.id
  JOIN public.submissions s ON s.id = sa.submission_id
  JOIN public.assignment_instances ai ON ai.id = s.instance_id
  WHERE ai.student_id = p_student_id
    AND ai.school_year = p_school_year
    AND cardinality(aim.dese_codes) > 0
  GROUP BY dese_code
  ORDER BY percent_correct DESC;
$$;

GRANT EXECUTE ON FUNCTION public.student_dese_rollups(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_dese_rollups(uuid, integer) TO service_role;
