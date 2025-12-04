# Database Migrations Guide

This document explains the database migrations for the Reinisch Classroom Teacher Center.

## Migration Files

All migration files are located in `supabase/migrations/` and should be run in order.

### 20251109_student_manager_consolidated.sql

**Date:** 2025-11-09  
**Purpose:** Consolidates all Student Manager features into a single idempotent migration

#### What This Migration Does

1. **Creates/Updates Enrollments Table**
   - Creates `enrollments` table using `student_code` as primary key (compatible alternative to `class_enrollments`)
   - Ensures `class_enrollments` table exists with `start_date` column
   - Both tables are maintained for compatibility with different parts of the system

2. **Assignment Mapping Tables** (Phase 1)
   - `assignment_items`: Per-question items with answer types and metadata
   - `assignment_item_mappings`: Maps items to DESE standards and IEP goal codes
   - `submission_answers`: Stores per-item answers and scoring results
   - Extends `assignments` and `submissions` tables with metadata columns

3. **Rollup Views**
   - `assignment_goal_rollups`: Per-goal percent_correct for each submission
   - `assignment_standard_rollups`: Per-DESE-standard percent_correct for each submission
   - `assignment_instance_rollups`: Rollup of submission scores per assignment instance
   - `assignment_instance_averages`: Average scores across all assignments per student

4. **Students Table Extensions**
   - `active` column: Boolean flag for active/inactive student accounts
   - Unique index on `code` for fast lookups
   - Inactive students cannot log in and are filtered from default views

5. **Goals Table Extensions - Versioning Support**
   - `version`: Integer version number (increments when goal is replaced)
   - `active`: Boolean flag (false when replaced or archived)
   - `replaced_by`: UUID reference to newer version
   - `start_date`: Date when this goal version became active
   - `goal_area`: Text field for goal categorization
   - `baseline`: Integer (0-100) for baseline performance
   - `case_manager`: Text field for case manager name

6. **RPC Functions**

   All RPC functions use `SECURITY DEFINER` and are granted to `authenticated` users.

   - **create_student_with_enrollments_and_goals(payload jsonb)**
     - Atomically creates a student with enrollments and goals
     - Raises: `STUDENT_CODE_EXISTS`, `GOAL_CODE_EXISTS`
     - Payload: `{student: {code, password_hash?}, enrollments: [{class_id, start_date?}], goals: [{goal_code, goal_text, ...}]}`

   - **add_student_goals(p_student_code text, p_goals jsonb)**
     - Adds multiple goals to existing student
     - Returns per-goal errors without stopping
     - Gracefully handles empty arrays (no-op)
     - Raises: `STUDENT_NOT_FOUND`

   - **replace_goal_version(p_old_goal_id uuid, p_new_goal jsonb)**
     - Replaces a goal with new version, incrementing version number
     - Archives old version and links to new one
     - Raises: `GOAL_NOT_FOUND`, `GOAL_ALREADY_REPLACED`, `GOAL_ALREADY_ARCHIVED`

   - **archive_goal(p_goal_id uuid)**
     - Archives a goal without replacement
     - Sets `active = false`
     - Raises: `GOAL_NOT_FOUND`, `GOAL_ALREADY_ARCHIVED`

   - **set_student_active(p_code text, p_active boolean)**
     - Updates student active status
     - Used for deactivation/reactivation
     - Raises: `STUDENT_NOT_FOUND`

   - **update_student_enrollments(p_code text, p_add jsonb, p_remove jsonb)**
     - Adds or removes class enrollments
     - Gracefully handles null or empty arrays (no-op)
     - Raises: `STUDENT_NOT_FOUND`

#### Idempotency

This migration is designed to be **idempotent** - it can be run multiple times safely:
- Uses `CREATE TABLE IF NOT EXISTS` for tables
- Uses `DO $$ ... END $$` blocks with column existence checks for ALTER TABLE
- Uses `CREATE OR REPLACE` for functions and views
- Uses `IF NOT EXISTS` for indexes and policies

#### Running the Migration

**On a fresh database:**
```sql
\i supabase/migrations/20251109_student_manager_consolidated.sql
```

**On an existing database:**
The migration will:
- Skip creating tables that already exist
- Add only missing columns
- Update functions and views to latest versions
- Preserve all existing data

**Via Supabase CLI:**
```bash
supabase db reset  # For development - resets entire DB
# OR
supabase migration up  # Applies pending migrations
```

#### Rollback Guidance

This migration does not include automatic rollback. If you need to rollback:

1. **Remove added columns:**
   ```sql
   ALTER TABLE students DROP COLUMN IF EXISTS active;
   ALTER TABLE goals DROP COLUMN IF EXISTS version, active, replaced_by, start_date, goal_area, baseline, case_manager;
   ALTER TABLE assignments DROP COLUMN IF EXISTS first_submission_at, version_locked, source_type;
   ALTER TABLE submissions DROP COLUMN IF EXISTS source_type;
   ALTER TABLE class_enrollments DROP COLUMN IF EXISTS start_date;
   ```

2. **Drop tables:**
   ```sql
   DROP TABLE IF EXISTS enrollments CASCADE;
   DROP TABLE IF EXISTS submission_answers CASCADE;
   DROP TABLE IF EXISTS assignment_item_mappings CASCADE;
   DROP TABLE IF EXISTS assignment_items CASCADE;
   ```

3. **Drop views:**
   ```sql
   DROP VIEW IF EXISTS assignment_instance_averages;
   DROP VIEW IF EXISTS assignment_instance_rollups;
   DROP VIEW IF EXISTS assignment_standard_rollups;
   DROP VIEW IF EXISTS assignment_goal_rollups;
   ```

4. **Drop functions:**
   ```sql
   DROP FUNCTION IF EXISTS create_student_with_enrollments_and_goals(jsonb);
   DROP FUNCTION IF EXISTS add_student_goals(text, jsonb);
   DROP FUNCTION IF EXISTS replace_goal_version(uuid, jsonb);
   DROP FUNCTION IF EXISTS archive_goal(uuid);
   DROP FUNCTION IF EXISTS set_student_active(text, boolean);
   DROP FUNCTION IF EXISTS update_student_enrollments(text, jsonb, jsonb);
   ```

**Warning:** Rollback will delete data stored in the removed tables and columns. Always backup your database before rollback.

#### Security & Privacy

- **Code-Only Identity:** Student records use only `code` field. PII fields (first_name, last_name, etc.) are not used or populated by RPC functions.
- **RLS Enabled:** All tables have Row Level Security enabled with policies for authenticated users.
- **SECURITY DEFINER:** RPC functions run with owner privileges to bypass RLS. Review and customize policies for production.
- **Password Hashing:** Passwords are stored as bcrypt hashes in `student_passwords` table.

#### Error Handling

RPC functions use clear error codes:
- `STUDENT_CODE_EXISTS`: Student code already in use
- `STUDENT_NOT_FOUND`: Student code not found
- `GOAL_CODE_EXISTS`: Goal code already exists for student
- `GOAL_NOT_FOUND`: Goal ID not found
- `GOAL_ALREADY_REPLACED`: Goal has already been replaced
- `GOAL_ALREADY_ARCHIVED`: Goal is already archived

#### Testing

A test script is provided in `supabase/migrations/test_student_manager.sql` (see below).

## Testing Script

Create a file `supabase/migrations/test_student_manager.sql`:

```sql
-- Test Student Manager RPC Functions
-- Run this script to verify all functions work correctly

-- Test 1: Create student with enrollments and goals
DO $$
DECLARE
  v_class_id uuid;
  v_result jsonb;
BEGIN
  -- Create test class
  INSERT INTO classes (name) VALUES ('Test Class A') RETURNING id INTO v_class_id;
  
  -- Create student S100 with 2 enrollments and 3 goals
  SELECT create_student_with_enrollments_and_goals(
    jsonb_build_object(
      'student', jsonb_build_object('code', 'S100', 'password_hash', 'test_hash_123'),
      'enrollments', jsonb_build_array(
        jsonb_build_object('class_id', v_class_id, 'start_date', '2025-01-01')
      ),
      'goals', jsonb_build_array(
        jsonb_build_object('goal_code', 'S100.1', 'goal_text', 'Math Goal 1', 'goal_area', 'Math', 'baseline', 50, 'target', '80'),
        jsonb_build_object('goal_code', 'S100.2', 'goal_text', 'Reading Goal 1', 'goal_area', 'Reading', 'baseline', 40, 'target', '70'),
        jsonb_build_object('goal_code', 'S100.3', 'goal_text', 'Writing Goal 1', 'goal_area', 'Writing', 'baseline', 60, 'target', '85')
      )
    )
  ) INTO v_result;
  
  RAISE NOTICE 'Test 1 PASSED: Created student S100 - %', v_result;
END $$;

-- Test 2: Add additional goals
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT add_student_goals(
    'S100',
    jsonb_build_array(
      jsonb_build_object('goal_code', 'S100.4', 'goal_text', 'Science Goal 1', 'goal_area', 'Science', 'baseline', 55, 'target', '75')
    )
  ) INTO v_result;
  
  RAISE NOTICE 'Test 2 PASSED: Added goals - %', v_result;
END $$;

-- Test 3: Replace goal version
DO $$
DECLARE
  v_old_goal_id uuid;
  v_result jsonb;
BEGIN
  -- Get first goal ID
  SELECT id INTO v_old_goal_id FROM goals WHERE code = 'S100.1' AND active = true LIMIT 1;
  
  -- Replace it
  SELECT replace_goal_version(
    v_old_goal_id,
    jsonb_build_object('goal_text', 'Math Goal 1 - Updated', 'target', '90')
  ) INTO v_result;
  
  RAISE NOTICE 'Test 3 PASSED: Replaced goal version - %', v_result;
  
  -- Verify version incremented
  IF (SELECT version FROM goals WHERE id = (v_result->>'new_goal_id')::uuid) = 2 THEN
    RAISE NOTICE 'Version check PASSED: Version = 2';
  ELSE
    RAISE EXCEPTION 'Version check FAILED';
  END IF;
END $$;

-- Test 4: Replace goal version again (version should be 3)
DO $$
DECLARE
  v_old_goal_id uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_old_goal_id FROM goals WHERE code = 'S100.1' AND active = true AND version = 2 LIMIT 1;
  
  SELECT replace_goal_version(
    v_old_goal_id,
    jsonb_build_object('goal_text', 'Math Goal 1 - Updated Again', 'target', '95')
  ) INTO v_result;
  
  RAISE NOTICE 'Test 4 PASSED: Replaced goal version again - %', v_result;
  
  IF (SELECT version FROM goals WHERE id = (v_result->>'new_goal_id')::uuid) = 3 THEN
    RAISE NOTICE 'Version check PASSED: Version = 3';
  ELSE
    RAISE EXCEPTION 'Version check FAILED';
  END IF;
END $$;

-- Test 5: Archive a goal (version 2 which should already be inactive)
DO $$
DECLARE
  v_goal_id uuid;
BEGIN
  -- Try to archive version 2 (already inactive from replacement)
  SELECT id INTO v_goal_id FROM goals WHERE code = 'S100.1' AND version = 2 LIMIT 1;
  
  BEGIN
    PERFORM archive_goal(v_goal_id);
    RAISE EXCEPTION 'Should have raised GOAL_ALREADY_ARCHIVED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%GOAL_ALREADY_ARCHIVED%' THEN
      RAISE NOTICE 'Test 5 PASSED: Correctly rejected archiving already-inactive goal';
    ELSE
      RAISE;
    END IF;
  END;
END $$;

-- Test 6: Archive an active goal
DO $$
DECLARE
  v_goal_id uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_goal_id FROM goals WHERE code = 'S100.2' AND active = true LIMIT 1;
  
  SELECT archive_goal(v_goal_id) INTO v_result;
  
  RAISE NOTICE 'Test 6 PASSED: Archived active goal - %', v_result;
END $$;

-- Test 7: Deactivate student
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT set_student_active('S100', false) INTO v_result;
  
  RAISE NOTICE 'Test 7 PASSED: Deactivated student - %', v_result;
  
  IF (SELECT active FROM students WHERE code = 'S100') = false THEN
    RAISE NOTICE 'Active check PASSED: Student is inactive';
  ELSE
    RAISE EXCEPTION 'Active check FAILED';
  END IF;
END $$;

-- Test 8: Reactivate student
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT set_student_active('S100', true) INTO v_result;
  
  RAISE NOTICE 'Test 8 PASSED: Reactivated student - %', v_result;
  
  IF (SELECT active FROM students WHERE code = 'S100') = true THEN
    RAISE NOTICE 'Active check PASSED: Student is active';
  ELSE
    RAISE EXCEPTION 'Active check FAILED';
  END IF;
END $$;

-- Summary query
SELECT 
  s.code,
  s.active,
  COUNT(DISTINCT ce.class_id) as classes_count,
  COUNT(g.id) as total_goals,
  COUNT(g.id) FILTER (WHERE g.active) as active_goals,
  COUNT(g.id) FILTER (WHERE NOT g.active) as inactive_goals,
  MAX(g.version) as max_version
FROM students s
LEFT JOIN class_enrollments ce ON ce.student_id = s.id AND ce.active = true
LEFT JOIN goals g ON g.student_id = s.id
WHERE s.code = 'S100'
GROUP BY s.code, s.active;

RAISE NOTICE 'All tests completed successfully!';
```

## Additional Migration Files

### 20251204_schema_reconciliation.sql ⭐ NEW

**Date:** 2025-12-04  
**Purpose:** Schema reconciliation migration to bring production in sync with repository code

This is a **consolidated migration** that includes all pending tables and functions that exist
in the repository but have not yet been applied to production. Running this migration will
align the production database with the code.

#### What This Migration Adds

1. **Goal Progress System (Phase 1)**
   - `goal_progress` table: Normalized progress measurements for IEP goals
   - `goal_progress_quarter_avg` view: Quarterly averages computed automatically
   - `goal_area` column added to `goals` table

2. **Assignment-Goal Mapping (Phases 4-5)**
   - `assignment_goal_map` table: Maps assignments to IEP goals
   - `record_progress_for_submission()` function: Auto-creates progress entries from submissions

3. **Saved Views for IEP Progress Grid (Phases 6-8)**
   - `progress_saved_views` table: Stores filter/sort/group configurations per user

4. **Saved Views for Student Portal (Portal C)**
   - `portal_saved_views` table: Stores filter/sort configurations per student

5. **Resubmission Support (Portal B)**
   - `resubmission_count` column on `assignment_instances`
   - `create_resubmission()` function: Atomic resubmission with limit enforcement
   - `get_latest_submission()` function: Gets most recent submission for an instance

#### Running the Migration

```sql
-- Apply via Supabase SQL Editor or psql
\i supabase/migrations/20251204_schema_reconciliation.sql

-- After applying, re-export the schema
supabase db dump -f supabase:schema_full_dump.sql
```

#### Idempotency

This migration is fully **idempotent** - it can be safely run multiple times without errors.

### 20251105_app_users_and_sub_plans.sql
- Creates app users and subscription plans tables

### 20251108_assignment_mapping_phase_1.sql
- Assignment mapping tables (superseded by consolidated migration)

### 20251108_goal_progress_table.sql
- Goal progress tracking table

### 20251108_phase_6_8_saved_views.sql
- Saved views for phase 6-8

### 20251108_phases_4_5_assignment_goal_mapping.sql
- Assignment-goal mapping for phases 4-5

### 20251108_portal_c_saved_views.sql
- Portal C saved views

## Schema Sync Verification

A schema sync check script is available to verify the schema is in sync:

```bash
node scripts/schema-sync-check.mjs
```

This script compares `supabase:schema_full_dump.sql` against code references and reports:
- Tables referenced in code but missing from schema
- RPC parameter mismatches
- Missing functions

## Migration Best Practices

1. **Always backup** before running migrations on production
2. **Test migrations** on a development database first
3. **Run migrations in order** by timestamp
4. **Use transactions** when running multiple migrations
5. **Monitor logs** for errors or warnings
6. **Verify data** after migration completes

## Troubleshooting

### "relation already exists" errors
These are expected with idempotent migrations. The migration will skip creating existing objects.

### "column already exists" errors
The migration uses `IF NOT EXISTS` checks. If you see these errors, the checks may have failed. Review the specific error.

### Permission errors
Ensure the database user has sufficient privileges:
```sql
GRANT ALL ON SCHEMA public TO your_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_user;
```

### RPC function not found
Ensure migrations ran successfully:
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
```

## Admin Uploader Troubleshooting

### Life Skills / Presentation Uploads

#### Symptom: Upload succeeds but hub still shows "Placeholder"

**Possible Causes:**
1. State update didn't commit properly
2. Netlify deployment hasn't completed yet
3. Browser cache showing old state

**Solutions:**

1. **Check the verification log** in the Admin Uploader after upload
   - Look for "✓ Verification SUCCESS" message
   - If you see "⚠ Verification WARNING", wait 1-2 minutes for Netlify deployment to complete
   - Reload the hub page with hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

2. **Verify the slot directory exists** in the repository
   - For Life Skills slot N, check: `site/life-skills/presentations/presentation-NN/index.html`
   - For other categories, check: `site/{baseOut}/presentation-NN/index.html`

3. **Check site-state.json** in the repository
   - Navigate to `site/assets/data/site-state.json`
   - Find the category (e.g., "life" for Life Skills)
   - Verify `titles[N-1]` has the title
   - Verify `links[N-1]` has the path (e.g., `/life-skills/presentations/presentation-05/`)

4. **If the upload succeeded but verification failed:**
   - The slot files are committed, but deployment may be in progress
   - Wait 1-2 minutes and reload the hub page
   - If still showing Placeholder after 5 minutes, check the Netlify deployment logs

5. **If multiple uploads are happening concurrently:**
   - The system has retry logic for concurrent uploads
   - If one slot overwrites another, simply re-upload the affected slot
   - The improved state merging (as of 2025-11-09) should prevent this issue

#### Best Practices

- **Upload one slot at a time** if possible to avoid any potential race conditions
- **Check the verification log** after each upload to confirm success
- **Allow 1-2 minutes** after upload for Netlify deployment before checking the hub
- **Use hard refresh** (Ctrl+Shift+R) when checking the hub to avoid browser cache
- **Keep the title** when re-uploading: the uploader now preserves existing titles if you leave the title field blank

#### Advanced: Manual State Fix

If a slot is uploaded but the state is incorrect, you can manually edit `site/assets/data/site-state.json`:

1. Navigate to the file in GitHub
2. Click "Edit" (pencil icon)
3. Find the category section (e.g., `"life"` for Life Skills)
4. Update the `titles` and `links` arrays:
   ```json
   "life": {
     "slots": 32,
     "titles": [
       "Title for slot 1",
       "Title for slot 2",
       ...
     ],
     "links": [
       "/life-skills/presentations/presentation-01/",
       "/life-skills/presentations/presentation-02/",
       ...
     ]
   }
   ```
5. Commit the change
6. Wait for Netlify deployment (~1-2 minutes)
7. Hard refresh the hub page
