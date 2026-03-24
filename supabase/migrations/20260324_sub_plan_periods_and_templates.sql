-- Migration: Sub Plan Periods and Templates
-- Date: 2026-03-24
-- Description: Extend sub_plans with plan_mode, sub_feedback, and emergency_acknowledged;
--              add sub_plan_periods table for per-period instructions;
--              add sub_plan_templates table for reusable plan templates.

-- ============================================================================
-- A) New columns on sub_plans
-- ============================================================================

ALTER TABLE public.sub_plans ADD COLUMN IF NOT EXISTS plan_mode text DEFAULT 'subject' CHECK (plan_mode IN ('period', 'subject'));
ALTER TABLE public.sub_plans ADD COLUMN IF NOT EXISTS sub_feedback text;
ALTER TABLE public.sub_plans ADD COLUMN IF NOT EXISTS emergency_acknowledged boolean DEFAULT false;

-- ============================================================================
-- B) sub_plan_periods table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sub_plan_periods (
  id bigserial PRIMARY KEY,
  plan_id bigint NOT NULL REFERENCES public.sub_plans(id) ON DELETE CASCADE,
  period_hour int NOT NULL,
  subject text,
  instructions text,
  presentations text[],
  materials text,
  completed boolean DEFAULT false,
  sub_note text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_plan_periods_plan_id ON public.sub_plan_periods(plan_id);
CREATE INDEX IF NOT EXISTS idx_sub_plan_periods_hour ON public.sub_plan_periods(period_hour);

-- Unique constraint: one entry per period per plan
ALTER TABLE public.sub_plan_periods ADD CONSTRAINT uq_sub_plan_periods_plan_hour UNIQUE (plan_id, period_hour);

COMMENT ON TABLE public.sub_plan_periods IS 'Per-period instructions for substitute plans (period mode)';

-- ============================================================================
-- C) sub_plan_templates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sub_plan_templates (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  day_of_week int CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  plan_mode text NOT NULL DEFAULT 'subject' CHECK (plan_mode IN ('period', 'subject')),
  periods_data jsonb,
  subject_data jsonb,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_plan_templates_dow ON public.sub_plan_templates(day_of_week);

COMMENT ON TABLE public.sub_plan_templates IS 'Reusable templates for substitute plans';

-- Migration complete
