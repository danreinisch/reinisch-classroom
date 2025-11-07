-- ============================================================================
-- Repair Enrollment IDs and Install Trigger
-- ============================================================================
-- Purpose: Backfill class_enrollments.class_id from class_code by mapping
--          through the classes table, and install triggers to auto-fill
--          class_id on future inserts when only class_code is provided.
--
-- Usage: Run this script in the Supabase SQL Editor after importing roster
--        data if earlier rows lacked class_id.
--
-- Features:
--   - Backfills missing class_id values in class_enrollments
--   - Creates trigger function to automatically fill class_id from class_code
--   - Safe to run multiple times (idempotent)
--
-- Safety: This script does NOT modify constraints or drop existing data.
--         It only updates NULL class_id values and creates/replaces triggers.
-- ============================================================================

DO $$
DECLARE
  updated_count INT := 0;
BEGIN
  -- ====================================================================
  -- Step 1: Backfill missing class_id values
  -- ====================================================================
  -- Update class_enrollments rows where class_id is NULL but class_code exists
  
  WITH updates AS (
    UPDATE class_enrollments ce
    SET class_id = c.id
    FROM classes c
    WHERE ce.class_id IS NULL
      AND ce.class_code IS NOT NULL
      AND c.code = ce.class_code
    RETURNING ce.*
  )
  SELECT count(*) INTO updated_count FROM updates;
  
  IF updated_count > 0 THEN
    RAISE NOTICE 'Backfilled class_id for % enrollment records', updated_count;
  ELSE
    RAISE NOTICE 'No enrollment records needed backfilling';
  END IF;

END $$;

-- ====================================================================
-- Step 2: Create trigger function to auto-fill class_id from class_code
-- ====================================================================

CREATE OR REPLACE FUNCTION auto_fill_class_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If class_id is NULL but class_code is provided, look it up
  IF NEW.class_id IS NULL AND NEW.class_code IS NOT NULL THEN
    SELECT id INTO NEW.class_id
    FROM classes
    WHERE code = NEW.class_code;
    
    -- If class_code doesn't match any class, raise a notice but allow insert
    IF NEW.class_id IS NULL THEN
      RAISE NOTICE 'class_code "%" not found in classes table', NEW.class_code;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- Step 3: Install trigger on class_enrollments
-- ====================================================================

DROP TRIGGER IF EXISTS trigger_auto_fill_class_id ON class_enrollments;

CREATE TRIGGER trigger_auto_fill_class_id
  BEFORE INSERT OR UPDATE ON class_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION auto_fill_class_id();

-- ====================================================================
-- Verification
-- ====================================================================

DO $$
DECLARE
  null_count INT := 0;
BEGIN
  -- Count remaining NULL class_id values
  SELECT count(*) INTO null_count
  FROM class_enrollments
  WHERE class_id IS NULL;
  
  IF null_count > 0 THEN
    RAISE WARNING 'Still have % enrollment records with NULL class_id. Troubleshooting steps:', null_count;
    RAISE WARNING '  1. Check for invalid class_code values that don''t match any entry in classes.code';
    RAISE WARNING '  2. Verify classes table has all required class codes';
    RAISE WARNING '  3. Run: SELECT DISTINCT class_code FROM class_enrollments WHERE class_id IS NULL;';
  ELSE
    RAISE NOTICE 'All enrollment records have class_id populated';
  END IF;
  
  RAISE NOTICE 'Trigger installed: future inserts will auto-fill class_id from class_code';
END $$;
