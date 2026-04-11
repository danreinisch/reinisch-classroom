-- Batch RPC: all_students_dese_rollups
-- Returns aggregated DESE standard performance for ALL active students in a
-- given school year in a single query.  Used by the Teacher Center Overview
-- page to power the "Standards Pulse" KPI card and drill-down heatmap.
-- This avoids N per-student RPC calls that would be too slow for the overview.

CREATE OR REPLACE FUNCTION public.all_students_dese_rollups(
  p_school_year integer
)
RETURNS TABLE (
  student_id      uuid,
  student_code    text,
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
    st.id                       AS student_id,
    st.code                     AS student_code,
    unnest(ai_item.dese_codes)  AS dese_code,
    round(
      (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
      1
    )                           AS percent_correct,
    sum(sa.earned_points)::numeric  AS total_earned,
    sum(sa.max_points)::numeric     AS total_possible,
    count(*)                        AS item_count
  FROM public.submission_answers sa
  JOIN public.assignment_items ai_item ON ai_item.id = sa.assignment_item_id
  JOIN public.submissions s ON s.id = sa.submission_id
  JOIN public.assignment_instances ai ON ai.id = s.instance_id
  JOIN public.students st ON st.id = ai.student_id
  WHERE ai.school_year = p_school_year
    AND cardinality(ai_item.dese_codes) > 0
    AND (st.active IS NULL OR st.active = true)
  GROUP BY st.id, st.code, dese_code
  ORDER BY st.code, percent_correct DESC;
$$;

GRANT EXECUTE ON FUNCTION public.all_students_dese_rollups(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.all_students_dese_rollups(integer) TO service_role;
