-- Migration: 20260408_set_observation_goals
-- Purpose: Set measurement_type = 'Observation' and populate observation_config
--          for the 8 IEP goals that are behaviorally/socially observed rather than
--          measured via scored assignments.
--
-- Background: All goals defaulted to measurement_type = 'percent' after the
--             20260404_ensure_goals_columns.sql migration added that column.
--             The tc-observation.js tray filters goals with
--             measurement_type === 'Observation' AND a non-null observation_config,
--             so no goals were appearing in the observation tray.
--             The front-end already understands categories: session_outcome, tally,
--             prompt_count, behavior_checklist.
--
-- Idempotent: safe to re-run. Only targets active goals (active = true).
-- Pattern: UPDATE ... FROM public.students (same as 20260320_fix_goal_desc_alignment.sql)

BEGIN;

-- ============================================================
-- S006.11.1 — Social Skills (self-regulation / on-task behavior)
-- Description: S006 will improve his ability to focus on classroom tasks,
--   reducing off-task behaviors such as fidgeting and losing focus,
--   demonstrating self-regulation by staying on task for increasingly
--   longer durations in 4 out of 5 observed sessions.
-- Category: session_outcome (met/not met per session)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "session_outcome", "label": "On-task behavior (4/5 sessions)"}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S006'
  AND g.code  = 'S006.11.1'
  AND g.active = true;

-- ============================================================
-- S024.9.1 — Social Skills (verbal responses)
-- Description: S024 will increase his awareness of proper verbal responses
--   during supervised unstructured social situations 4 out of 5 interactions
--   by the next annual IEP review date.
-- Category: session_outcome (4 out of 5 interactions)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "session_outcome", "label": "Appropriate verbal responses (4/5 interactions)"}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S024'
  AND g.code  = 'S024.9.1'
  AND g.active = true;

-- ============================================================
-- S027.9.1 — Social Skills (self-management)
-- Description: S027 will increase the incidents of using self-management
--   skills to regulate and return to a given task 2 out of 4 situations
--   by the next annual IEP review.
-- Category: session_outcome (2 out of 4 situations)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "session_outcome", "label": "Self-management to return to task (2/4 situations)"}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S027'
  AND g.code  = 'S027.9.1'
  AND g.active = true;

-- ============================================================
-- S032.10.4 — Social Skills (social communication)
-- Description: S032 will improve his social communication skills by engaging
--   in appropriate and reciprocal conversations with peers and adults,
--   including asking relevant questions and using appropriate names
--   3/5 of opportunities.
-- Category: tally (count opportunities met out of total)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "tally", "label": "Reciprocal conversations (3/5 opportunities)"}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S032'
  AND g.code  = 'S032.10.4'
  AND g.active = true;

-- ============================================================
-- S035.10.1 — Behavior (multi-sub-objective)
-- Description: S035 will increase his behavior skills by completing the
--   objectives below with 70% accuracy by the next annual IEP review.
--   1) Follow a reasonable request when asked by an adult. Baseline - 25%
--   2) Raising hand to speak in class. Baseline - 43%
--   3) Staying in assigned seat unless given permission. Baseline - 43%
-- Category: behavior_checklist (3 individually tracked sub-behaviors)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "behavior_checklist", "label": "Behavior objectives (3 sub-behaviors)", "sub_behaviors": ["Follow a reasonable request when asked by an adult", "Raising hand to speak in class", "Staying in assigned seat unless given permission"]}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S035'
  AND g.code  = 'S035.10.1'
  AND g.active = true;

-- ============================================================
-- S038.9.1 — Behavior (conflict management)
-- Description: By the end of the IEP cycle, S038 will maintain behavior
--   by managing conflicts on 80% of instances by the next annual IEP review.
-- Category: session_outcome (met/not met per instance)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "session_outcome", "label": "Managing conflicts (80% of instances)"}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S038'
  AND g.code  = 'S038.9.1'
  AND g.active = true;

-- ============================================================
-- S043.10.1 — Social Skills (prompts)
-- Description: S043 will increase her social skills by waiting her turn to
--   speak and following adult direction with 2 or fewer prompts on data days
--   by the end of this IEP period.
-- Category: prompt_count (numeric count; target ≤2 prompts)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "prompt_count", "label": "Turn-taking & following direction (\u22642 prompts)", "target_max_prompts": 2}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S043'
  AND g.code  = 'S043.10.1'
  AND g.active = true;

-- ============================================================
-- S043.10.2 — Emotional Regulation
-- Description: S043 will maintain her emotional regulation skills by using
--   learned strategies to calm her anxiety, work independently, and complete
--   assignments 80% of the time on data collection days.
-- Category: session_outcome (met/not met per data collection day)
-- ============================================================
UPDATE public.goals g
SET measurement_type   = 'Observation',
    observation_config = '{"category": "session_outcome", "label": "Emotional regulation (80% of data days)"}'::jsonb
FROM public.students s
WHERE g.student_id = s.id
  AND s.code = 'S043'
  AND g.code  = 'S043.10.2'
  AND g.active = true;

COMMIT;
