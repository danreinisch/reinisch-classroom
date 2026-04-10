-- Fix student_dese_rollups RPC to use assignment_items.dese_codes directly.
--
-- Background: assignment_item_mappings.dese_codes was never populated by
-- teacher-issue-draft.js for DESE-only students (those without IEP goals),
-- because Step 5c previously only created mapping rows when goal_codes were
-- present.  As a result the old version of this function returned empty results
-- for students like S046 who have graded assignments with DESE-tagged questions
-- but no IEP goal codes, causing the Skills Summary tab to show "No skills data".
--
-- The fix reads dese_codes from assignment_items (always populated by the parser)
-- instead of joining through assignment_item_mappings.  This works for all
-- existing and new assignments without requiring any data backfill.

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
    unnest(ai_item.dese_codes) AS dese_code,
    round(
      (sum(sa.earned_points) / nullif(sum(sa.max_points), 0) * 100)::numeric,
      1
    ) AS percent_correct,
    sum(sa.earned_points)::numeric AS total_earned,
    sum(sa.max_points)::numeric AS total_possible,
    count(*) AS item_count
  FROM public.submission_answers sa
  JOIN public.assignment_items ai_item ON ai_item.id = sa.assignment_item_id
  JOIN public.submissions s ON s.id = sa.submission_id
  JOIN public.assignment_instances ai ON ai.id = s.instance_id
  WHERE ai.student_id = p_student_id
    AND ai.school_year = p_school_year
    AND cardinality(ai_item.dese_codes) > 0
  GROUP BY dese_code
  ORDER BY percent_correct DESC;
$$;

GRANT EXECUTE ON FUNCTION public.student_dese_rollups(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_dese_rollups(uuid, integer) TO service_role;
