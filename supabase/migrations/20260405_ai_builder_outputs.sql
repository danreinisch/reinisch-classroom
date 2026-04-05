-- AI Builder Outputs table
-- Stores a persistent history of every generation made by the AI Builder.
-- Phase 1: history tracking (future phases: reactive regeneration, Library linking).

CREATE TABLE IF NOT EXISTS ai_builder_outputs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type text NOT NULL DEFAULT 'assignments',      -- assignments, presentations, both, dataProbe
  subject text NOT NULL DEFAULT 'ELA',
  week text NOT NULL,
  chapters text,
  theme text,
  scope text,                                          -- All Classes, or specific class name
  model text,
  source_hash text,                                    -- SHA-256 hash of source material (for dedup/comparison, not storing full source)
  content text NOT NULL,                               -- The generated output text
  student_codes text[] DEFAULT '{}',                   -- Array of student codes included in generation
  goal_codes text[] DEFAULT '{}',                      -- Array of goal codes included in generation
  assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,  -- Link to Library assignment if issued
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  superseded_by uuid REFERENCES ai_builder_outputs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  school_year text
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_builder_outputs_status ON ai_builder_outputs(status);
CREATE INDEX IF NOT EXISTS idx_ai_builder_outputs_week ON ai_builder_outputs(week);
CREATE INDEX IF NOT EXISTS idx_ai_builder_outputs_created ON ai_builder_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_builder_outputs_school_year ON ai_builder_outputs(school_year);

-- RLS
ALTER TABLE ai_builder_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ai_builder_outputs"
  ON ai_builder_outputs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ai_builder_outputs"
  ON ai_builder_outputs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ai_builder_outputs"
  ON ai_builder_outputs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
