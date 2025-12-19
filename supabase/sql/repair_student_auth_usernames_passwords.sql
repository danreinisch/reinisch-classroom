-- ============================================================================
-- Repair Student Authentication: Usernames and Passwords
-- ============================================================================
-- Purpose: Fix student authentication issues caused by:
--          1. Duplicate app_users rows differing only by case (e.g., S004 vs s004)
--          2. Legacy password policy where passwords included "!" suffix
--
-- Context: Student authentication uses verify_student_password RPC which
--          delegates to verify_user_password. The verify_user_password
--          function performs case-sensitive username lookup in app_users
--          and checks password using bcrypt (extensions.crypt).
--
-- Usage: Run this script in the Supabase SQL Editor to repair student
--        authentication data. Safe to run multiple times (idempotent).
--
-- Features:
--   - Detects and reports case-colliding student usernames
--   - Removes lowercase student username duplicates
--   - Resets passwords for uppercase student codes to match the code exactly
--   - Provides verification queries (commented at end)
--
-- Safety: This script modifies app_users rows where role='student'.
--         It does NOT modify teacher, admin, or substitute accounts.
--         It does NOT modify table structure or constraints.
-- ============================================================================

DO $$
DECLARE
  collision_count INT := 0;
  lowercase_count INT := 0;
  deleted_count INT := 0;
  updated_count INT := 0;
BEGIN
  
  -- ====================================================================
  -- Step A: Detect and report case-colliding student usernames
  -- ====================================================================
  -- Find student usernames that differ only by case
  
  WITH collisions AS (
    SELECT lower(username) as username_lower, count(*) as collision_count
    FROM app_users
    WHERE role = 'student'
    GROUP BY lower(username)
    HAVING count(*) > 1
  )
  SELECT count(*) INTO collision_count FROM collisions;
  
  IF collision_count > 0 THEN
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'STEP A: Case-Colliding Student Usernames Detected';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'Found % groups of student usernames that differ only by case', collision_count;
    RAISE NOTICE '';
    
    -- Report each collision group
    FOR collision_rec IN (
      SELECT lower(username) as username_lower, count(*) as count
      FROM app_users
      WHERE role = 'student'
      GROUP BY lower(username)
      HAVING count(*) > 1
      ORDER BY lower(username)
    ) LOOP
      RAISE NOTICE '  Collision: "%" appears % times', collision_rec.username_lower, collision_rec.count;
    END LOOP;
    RAISE NOTICE '';
  ELSE
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'STEP A: No case-colliding student usernames detected';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  END IF;
  
  -- ====================================================================
  -- Step B: Remove lowercase student usernames
  -- ====================================================================
  -- Delete app_users rows where role='student' and username is lowercase
  
  SELECT count(*) INTO lowercase_count
  FROM app_users
  WHERE role = 'student'
    AND username = lower(username);
  
  IF lowercase_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'STEP B: Removing Lowercase Student Usernames';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'Found % lowercase student username(s) to remove', lowercase_count;
    
    -- Delete lowercase student usernames
    WITH deleted AS (
      DELETE FROM app_users
      WHERE role = 'student'
        AND username = lower(username)
      RETURNING username
    )
    SELECT count(*) INTO deleted_count FROM deleted;
    
    RAISE NOTICE 'Deleted % lowercase student username(s)', deleted_count;
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE 'STEP B: No lowercase student usernames to remove';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  END IF;
  
  -- ====================================================================
  -- Step C: Reset passwords for canonical uppercase student usernames
  -- ====================================================================
  -- Update password_hash to match the username/code exactly (no "!" suffix)
  -- Only updates student usernames matching pattern ^S[0-9]{3}$
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'STEP C: Resetting Student Passwords';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  
  WITH updates AS (
    UPDATE app_users
    SET 
      password_hash = extensions.crypt(username, extensions.gen_salt('bf', 8)),
      updated_at = now()
    WHERE role = 'student'
      AND username ~ '^S[0-9]{3}$'
    RETURNING username
  )
  SELECT count(*) INTO updated_count FROM updates;
  
  IF updated_count > 0 THEN
    RAISE NOTICE 'Reset passwords for % student code(s)', updated_count;
    RAISE NOTICE 'Student passwords now match their codes exactly (no "!" suffix)';
  ELSE
    RAISE NOTICE 'No student passwords needed reset';
  END IF;
  
  -- ====================================================================
  -- Summary
  -- ====================================================================
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'REPAIR COMPLETE';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Case collisions detected: %', collision_count;
  RAISE NOTICE 'Lowercase usernames deleted: %', deleted_count;
  RAISE NOTICE 'Student passwords reset: %', updated_count;
  RAISE NOTICE '';
  RAISE NOTICE 'See verification queries below (uncomment to run)';
  
END $$;

-- ====================================================================
-- Step D: Verification Queries
-- ====================================================================
-- Uncomment these queries to verify the repair was successful

-- 1. Verify no lowercase student usernames remain
-- SELECT count(*) as lowercase_student_count
-- FROM app_users
-- WHERE role = 'student'
--   AND username = lower(username);
-- Expected: 0

-- 2. Verify student can authenticate with code (no "!" suffix)
-- Sample codes: S001, S002, S003, S004
-- SELECT username, 
--        verify_student_password(username, username) as ok_code,
--        verify_student_password(username, username || '!') as ok_old
-- FROM app_users
-- WHERE role = 'student'
--   AND username ~ '^S[0-9]{3}$'
-- ORDER BY username
-- LIMIT 10;
-- Expected: ok_code = true, ok_old = false for all rows

-- 3. Test specific student authentication
-- SELECT verify_student_password('S001', 'S001');
-- Expected: true (valid password)

-- SELECT verify_student_password('S001', 'S001!');
-- Expected: false (invalid password)

-- 4. Verify no case-colliding student usernames remain
-- SELECT lower(username) as username_lower, count(*) as count,
--        array_agg(username) as variants
-- FROM app_users
-- WHERE role = 'student'
-- GROUP BY lower(username)
-- HAVING count(*) > 1;
-- Expected: No rows (empty result)
