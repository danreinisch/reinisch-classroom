-- Migration: Ensure sub_plans, sub_plan_periods, and sub_plan_templates exist with open RLS
-- Date: 2026-03-25
-- Description: Idempotently creates the three substitute-plan tables if they do
--              not yet exist on the live Supabase instance, enables RLS on each,
--              and creates a single permissive FOR ALL policy so the anon key
--              can read and write.  All statements use IF NOT EXISTS /
--              DROP ... IF EXISTS so this migration is safe to re-run.

-- ============================================================================
-- A) sub_plans
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sub_plans (
  id            bigserial   PRIMARY KEY,
  plan_date     date        NOT NULL UNIQUE,
  plan_mode     text        NOT NULL DEFAULT 'subject'
                              CHECK (plan_mode IN ('period', 'subject')),
  la_lesson                 text,
  la_book                   text,
  la_presentations          text[],
  life_skills_topic         text,
  life_skills_presentations text[],
  notes                     text,
  sub_feedback              text,
  emergency_acknowledged    boolean     DEFAULT false,
  published                 boolean     DEFAULT false,
  created_by                text,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_plans_date      ON public.sub_plans(plan_date);
CREATE INDEX IF NOT EXISTS idx_sub_plans_published ON public.sub_plans(published);

ALTER TABLE public.sub_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_plans_anon_all" ON public.sub_plans;
CREATE POLICY "sub_plans_anon_all"
  ON public.sub_plans
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- B) sub_plan_periods
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sub_plan_periods (
  id          bigserial PRIMARY KEY,
  plan_id     bigint    NOT NULL REFERENCES public.sub_plans(id) ON DELETE CASCADE,
  period_hour int       NOT NULL,
  subject     text,
  instructions text,
  presentations text[],
  materials   text,
  completed   boolean     DEFAULT false,
  sub_note    text,
  sort_order  int         DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_plan_periods_plan_id ON public.sub_plan_periods(plan_id);
CREATE INDEX IF NOT EXISTS idx_sub_plan_periods_hour    ON public.sub_plan_periods(period_hour);

-- Unique constraint: one row per period per plan (safe when table already has it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_sub_plan_periods_plan_hour'
      AND conrelid = 'public.sub_plan_periods'::regclass
  ) THEN
    ALTER TABLE public.sub_plan_periods
      ADD CONSTRAINT uq_sub_plan_periods_plan_hour UNIQUE (plan_id, period_hour);
  END IF;
END;
$$;

ALTER TABLE public.sub_plan_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_plan_periods_anon_all" ON public.sub_plan_periods;
CREATE POLICY "sub_plan_periods_anon_all"
  ON public.sub_plan_periods
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- C) sub_plan_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sub_plan_templates (
  id          bigserial PRIMARY KEY,
  name        text      NOT NULL,
  day_of_week int       CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)), -- 0=Sunday … 6=Saturday (matches JS Date.getDay())
  plan_mode   text      NOT NULL DEFAULT 'subject'
                          CHECK (plan_mode IN ('period', 'subject')),
  periods_data jsonb,
  subject_data jsonb,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_plan_templates_dow ON public.sub_plan_templates(day_of_week);

ALTER TABLE public.sub_plan_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_plan_templates_anon_all" ON public.sub_plan_templates;
CREATE POLICY "sub_plan_templates_anon_all"
  ON public.sub_plan_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Migration complete
