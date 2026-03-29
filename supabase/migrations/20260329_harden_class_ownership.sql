-- Migration: Harden class ownership
-- Step A: Backfill teacher_id on classes where it is currently NULL,
--         using the single active teacher from the teacher table.
UPDATE classes
SET teacher_id = (SELECT id FROM teacher WHERE active = true LIMIT 1)
WHERE teacher_id IS NULL;

-- Step B: Add NOT NULL constraint on classes.teacher_id.
ALTER TABLE classes ALTER COLUMN teacher_id SET NOT NULL;

-- Step C: Add unique constraint on (name, teacher_id) — idempotent.
ALTER TABLE classes ADD CONSTRAINT IF NOT EXISTS uq_classes_name_teacher UNIQUE (name, teacher_id);
