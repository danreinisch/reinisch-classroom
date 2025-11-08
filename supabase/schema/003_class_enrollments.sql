-- Phase B: Class Enrollments Schema
-- Creates class_enrollments junction table and adds code to classes

-- Add code column to classes table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'classes' AND column_name = 'code'
  ) THEN
    ALTER TABLE classes ADD COLUMN code text;
  END IF;
END $$;

-- Create class_enrollments table
CREATE TABLE IF NOT EXISTS class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_active ON class_enrollments(active);

-- Enable RLS
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- RLS policies (authenticated access)
CREATE POLICY class_enrollments_auth_sel ON class_enrollments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY class_enrollments_auth_ins ON class_enrollments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY class_enrollments_auth_upd ON class_enrollments FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY class_enrollments_auth_del ON class_enrollments FOR DELETE
  USING (auth.role() = 'authenticated');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_class_enrollments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_class_enrollments_updated_at ON class_enrollments;
CREATE TRIGGER trigger_class_enrollments_updated_at
  BEFORE UPDATE ON class_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION update_class_enrollments_updated_at();

-- Comments
COMMENT ON TABLE class_enrollments IS 'Many-to-many relationship between classes and students with active/inactive status';
COMMENT ON COLUMN class_enrollments.active IS 'Whether this enrollment is currently active (false = inactive but preserved for history)';
