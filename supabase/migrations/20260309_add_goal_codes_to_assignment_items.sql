-- Add goal_codes and dese_codes columns to assignment_items so that the
-- teacher review page can read IEP goal and DESE standard codes directly
-- from the item row (avoiding a join to assignment_item_mappings).
-- These are populated by teacher-issue-draft when the TXT assignment file
-- contains "IEP Goal(s):" and "DESE Standard(s):" annotations.

ALTER TABLE public.assignment_items
  ADD COLUMN IF NOT EXISTS goal_codes text[] DEFAULT array[]::text[],
  ADD COLUMN IF NOT EXISTS dese_codes text[] DEFAULT array[]::text[];

COMMENT ON COLUMN public.assignment_items.goal_codes IS 'IEP goal codes for this item, parsed from the assignment TXT file';
COMMENT ON COLUMN public.assignment_items.dese_codes IS 'DESE standard codes for this item, parsed from the assignment TXT file';
