-- Add observation_config JSONB column to goals table
-- This stores configuration for observational IEP goals (category, class periods, etc.)

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS observation_config JSONB DEFAULT NULL;

COMMENT ON COLUMN goals.observation_config IS
  'Configuration for observational measurement goals. JSON structure includes: category (session_outcome|tally|prompt_count|behavior_checklist), class_periods (array), and category-specific fields (target_met, target_window, target_max_prompts, sub_behaviors).';
