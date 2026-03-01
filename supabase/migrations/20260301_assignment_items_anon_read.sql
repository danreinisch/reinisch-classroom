-- Allow the anon (frontend) role to read assignment_items and assignment_item_mappings.
-- The teacher review page uses the Supabase anon key (no Supabase Auth session), so
-- without an explicit SELECT policy the RLS default (deny) blocks all reads.
--
-- assignment_items contains only structural metadata about assignment questions
-- (item_ref, answer_type, points, rubric hints) — no student PII.
--
-- assignment_item_mappings contains DESE/goal code annotations — no student PII.
CREATE POLICY IF NOT EXISTS "anon can read assignment_items"
  ON public.assignment_items
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY IF NOT EXISTS "anon can read assignment_item_mappings"
  ON public.assignment_item_mappings
  FOR SELECT
  TO anon
  USING (true);
