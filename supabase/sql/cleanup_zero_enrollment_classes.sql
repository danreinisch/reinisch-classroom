-- ============================================================================
-- Cleanup Zero-Enrollment Duplicate Classes Script
-- ============================================================================
-- Purpose: Identify and optionally mark inactive classes with 0 enrollments
--          where another class shares the same "normalized" title.
--
-- Usage: Run this script in the Supabase SQL Editor to:
--   1. See which classes would be affected (dry-run by default)
--   2. Optionally mark duplicates as inactive (uncomment the UPDATE section)
--
-- Safety: This script does NOT hard-delete any records by default.
--         It only marks classes as inactive when explicitly enabled.
-- ============================================================================

DO $$
DECLARE
  report_rec RECORD;
  duplicate_count INT := 0;
BEGIN
  -- ====================================================================
  -- Step 1: Add 'active' column if it doesn't exist
  -- ====================================================================
  
  -- Check if 'active' column exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'classes' AND column_name = 'active'
  ) THEN
    ALTER TABLE classes ADD COLUMN active BOOLEAN DEFAULT true;
    RAISE NOTICE 'Added "active" column to classes table (default: true)';
  END IF;

  -- ====================================================================
  -- Step 2: Identify zero-enrollment duplicates
  -- ====================================================================
  
  -- Create temporary table to hold duplicate candidates
  DROP TABLE IF EXISTS temp_zero_enrollment_duplicates;
  CREATE TEMP TABLE temp_zero_enrollment_duplicates (
    class_id UUID,
    class_code TEXT,
    class_name TEXT,
    normalized_title TEXT,
    enrollment_count INT
  );

  -- Helper function to normalize titles (strip spaces, hyphens, underscores, lowercase)
  -- This matches the normalization logic in hub/index.html
  INSERT INTO temp_zero_enrollment_duplicates (class_id, class_code, class_name, normalized_title, enrollment_count)
  SELECT 
    c.id AS class_id,
    c.code AS class_code,
    c.name AS class_name,
    LOWER(REGEXP_REPLACE(COALESCE(c.name, c.code, ''), '[\s\-_]+', '', 'g')) AS normalized_title,
    COALESCE((
      SELECT COUNT(*)
      FROM class_enrollments ce
      WHERE ce.class_id = c.id
    ), 0) AS enrollment_count
  FROM classes c;

  -- ====================================================================
  -- Step 3: Report duplicates
  -- ====================================================================
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Zero-Enrollment Duplicate Classes Report';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- Find classes where:
  --   1. Multiple classes share the same normalized title
  --   2. At least one of them has enrollments
  --   3. This specific class has 0 enrollments
  
  FOR report_rec IN
    WITH duplicates AS (
      SELECT 
        normalized_title,
        COUNT(*) AS class_count,
        SUM(CASE WHEN enrollment_count > 0 THEN 1 ELSE 0 END) AS classes_with_enrollments
      FROM temp_zero_enrollment_duplicates
      GROUP BY normalized_title
      HAVING COUNT(*) > 1
    )
    SELECT 
      d.class_id,
      d.class_code,
      d.class_name,
      d.normalized_title,
      d.enrollment_count,
      dup.class_count,
      dup.classes_with_enrollments
    FROM temp_zero_enrollment_duplicates d
    JOIN duplicates dup ON d.normalized_title = dup.normalized_title
    WHERE d.enrollment_count = 0
      AND dup.classes_with_enrollments > 0
    ORDER BY d.normalized_title, d.class_code
  LOOP
    duplicate_count := duplicate_count + 1;
    RAISE NOTICE 'Duplicate #%: % (code: %) - normalized: "%" - enrollments: % - total with same title: % (% have enrollments)',
      duplicate_count,
      report_rec.class_name,
      report_rec.class_code,
      report_rec.normalized_title,
      report_rec.enrollment_count,
      report_rec.class_count,
      report_rec.classes_with_enrollments;
  END LOOP;

  IF duplicate_count = 0 THEN
    RAISE NOTICE 'No zero-enrollment duplicates found.';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE 'Found % zero-enrollment duplicate class(es).', duplicate_count;
    RAISE NOTICE '';
    RAISE NOTICE 'To mark these as inactive, uncomment the UPDATE section below and re-run.';
  END IF;

  -- ====================================================================
  -- Step 4: Mark duplicates as inactive (OPTIONAL - UNCOMMENT TO ENABLE)
  -- ====================================================================
  
  /*
  -- UNCOMMENT THE SECTION BELOW TO MARK DUPLICATES AS INACTIVE
  
  WITH duplicates AS (
    SELECT 
      normalized_title,
      COUNT(*) AS class_count,
      SUM(CASE WHEN enrollment_count > 0 THEN 1 ELSE 0 END) AS classes_with_enrollments
    FROM temp_zero_enrollment_duplicates
    GROUP BY normalized_title
    HAVING COUNT(*) > 1
  )
  UPDATE classes c
  SET active = false
  FROM temp_zero_enrollment_duplicates d
  JOIN duplicates dup ON d.normalized_title = dup.normalized_title
  WHERE c.id = d.class_id
    AND d.enrollment_count = 0
    AND dup.classes_with_enrollments > 0;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Marked % duplicate classes as inactive.', duplicate_count;
  */

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Script complete.';
  RAISE NOTICE '========================================';
  
END $$;
