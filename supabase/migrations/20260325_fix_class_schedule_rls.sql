-- Migration: Fix class_schedule RLS policies
-- Date: 2026-03-25
-- Description: Replace restrictive auth.role()='authenticated' policies with a
--              permissive FOR ALL policy so the anon key can INSERT and DELETE.
--              This app connects with the Supabase anon key, so auth.role()
--              returns 'anon', not 'authenticated'. Matches the pattern used
--              by app_config and other tables in this single-teacher app.

ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

-- Drop any existing restrictive policies (safe with IF EXISTS)
DROP POLICY IF EXISTS "class_schedule_auth_ins"   ON public.class_schedule;
DROP POLICY IF EXISTS "class_schedule_auth_del"   ON public.class_schedule;
DROP POLICY IF EXISTS "class_schedule_auth_upd"   ON public.class_schedule;
DROP POLICY IF EXISTS "class_schedule_auth_sel"   ON public.class_schedule;
DROP POLICY IF EXISTS "class_schedule_auth_all"   ON public.class_schedule;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.class_schedule;
DROP POLICY IF EXISTS "Allow authenticated read"  ON public.class_schedule;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.class_schedule;
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.class_schedule;
DROP POLICY IF EXISTS "class_schedule_anon_all"   ON public.class_schedule;

-- Single permissive policy: allows all operations via anon key
CREATE POLICY "class_schedule_anon_all"
  ON public.class_schedule
  FOR ALL
  USING (true)
  WITH CHECK (true);
