# Unified Teacher Center - Student Manager Update

This document explains the recent Student Manager enhancements added to the Unified Teacher Center.

## Overview

The Student Manager provides code-only identity management for students with class enrollments and IEP goals. This update consolidates all backend functionality into a single idempotent migration and provides comprehensive UI support.

## Key Features

### Operations
- **Add Student** - Create new student with class enrollments and IEP goals in one atomic operation
- **Update Student** - Modify enrollments, add/replace goals, manage goal versions
- **Remove Student** - Mark student as inactive (preserves all data for historical record)

### Goal Versioning
- Track goal version history (v1, v2, v3...)
- Replace goals with new versions while preserving old versions
- Archive goals without replacement
- View active and inactive goal versions
- Maintain start dates for each goal version

### Data Model
- **Code-only identity** - No PII (first_name, last_name) collected or displayed
- **Dual enrollment tables** - Both `class_enrollments` (UUID-based) and `enrollments` (code-based) for compatibility
- **Students table** - Extended with `active` status column
- **Goals table** - Extended with `version`, `active`, `replaced_by`, `start_date`, `goal_area`, `baseline`, `case_manager`

## Feature Flags

Control Student Manager features via Settings → Feature Flags:

- `studentManager` - Enable Student Manager tab (default: false)
- `studentCodeOnly` - Enforce code-only identity (default: true)  
- `studentMultiGoalWizard` - Enable multi-goal entry wizard (default: false)

Enable via browser console:
```javascript
setFeatureFlag('studentManager', true);
setFeatureFlag('studentMultiGoalWizard', true);
```

## Database Migration

### Migration File
`supabase/migrations/20251109_student_manager_consolidated.sql`

This comprehensive migration:
1. Creates `enrollments` table (student_code-based) for compatibility
2. Ensures assignment mapping tables exist (assignment_items, assignment_item_mappings, submission_answers)
3. Creates rollup views for goals, standards, and assignment instances
4. Extends students table with `active` column
5. Extends goals table with versioning columns
6. Creates 6 RPC functions for student management
7. All changes are idempotent - safe to run multiple times

### Running the Migration

**On a fresh Supabase database:**
```bash
# Via Supabase CLI
supabase db reset

# Or manually via SQL editor
\i supabase/migrations/20251109_student_manager_consolidated.sql
```

**On an existing database:**
```bash
# The migration is idempotent - it will skip existing objects
supabase migration up
```

### Testing the Migration
```bash
psql -d your_database -f supabase/migrations/test_student_manager.sql
```

The test script validates:
- Creating students with enrollments and goals
- Adding goals to existing students
- Replacing goal versions (v1 → v2 → v3)
- Archiving goals
- Deactivating/reactivating students
- Managing enrollments
- Error handling for duplicates

## RPC Functions

All functions use `SECURITY DEFINER` and are granted to `authenticated` users.

### create_student_with_enrollments_and_goals(payload jsonb)
Creates student atomically with enrollments and goals.

**Payload:**
```json
{
  "student": {
    "code": "S100",
    "password_hash": "bcrypt_hash_here"
  },
  "enrollments": [
    {"class_id": "uuid", "start_date": "2025-01-01"}
  ],
  "goals": [
    {
      "goal_code": "S100.1",
      "goal_text": "Math goal description",
      "goal_area": "Math",
      "baseline": 50,
      "target": "80",
      "case_manager": "Teacher Name"
    }
  ]
}
```

**Errors:** `STUDENT_CODE_EXISTS`, `GOAL_CODE_EXISTS`

### add_student_goals(p_student_code text, p_goals jsonb)
Adds multiple goals to existing student. Returns per-goal errors without stopping.

**Parameters:**
- `p_student_code`: Student code
- `p_goals`: Array of goal objects

**Returns:**
```json
{
  "student_code": "S100",
  "goals_added": 3,
  "errors": []
}
```

### replace_goal_version(p_old_goal_id uuid, p_new_goal jsonb)
Replaces a goal with new version, incrementing version number.

**Parameters:**
- `p_old_goal_id`: UUID of goal to replace
- `p_new_goal`: New goal object (partial update)

**Returns:**
```json
{
  "old_goal_id": "uuid",
  "new_goal_id": "uuid",
  "version": 2
}
```

**Errors:** `GOAL_NOT_FOUND`, `GOAL_ALREADY_REPLACED`, `GOAL_ALREADY_ARCHIVED`

### archive_goal(p_goal_id uuid)
Archives a goal without replacement.

**Errors:** `GOAL_NOT_FOUND`, `GOAL_ALREADY_ARCHIVED`

### set_student_active(p_code text, p_active boolean)
Updates student active status.

**Errors:** `STUDENT_NOT_FOUND`

### update_student_enrollments(p_code text, p_add jsonb, p_remove jsonb)
Adds or removes class enrollments. Gracefully handles null/empty arrays.

**Parameters:**
- `p_add`: Array of `{class_id, start_date?}`
- `p_remove`: Array of class_id UUIDs

## UI Components

All UI components exist in `prototypes/teacher-center-unified.html`:

### Operation Chooser Modal
- Presents three options: Add, Update, Remove
- Opens appropriate flow based on selection

### Student List
- Displays students with code, status, class count, goal count
- Filter by status (Active/Inactive/All)
- Search by student code
- Color-coded status badges

### Add Student Flow
- Step 1: Basic info (code, password)
- Step 2: Class enrollments
- Step 3: Initial goals (or skip and add later)
- Uses multi-goal wizard for bulk goal entry

### Update Student Flow
- View current enrollments and goals
- Add/remove enrollments
- Add new goals via multi-goal wizard
- Replace goal versions
- Archive goals
- View goal version history

### Remove Student Flow
- Confirmation dialog
- Sets student.active = false
- Preserves all data for historical record
- Student cannot log in when inactive

### Multi-Goal Wizard
- Step 0: Select quantity (1-20 goals)
- Step 1: Scrollable goal entry cards
- Step 2: Review and confirm
- Shows per-goal errors inline
- Calls `add_student_goals` RPC

## Data Adapter Methods

Located in `web/data-adapter.js`:

### Local (localStorage) Methods
- `createStudentWithEnrollmentsAndGoals(payload)`
- `addStudentGoals(student_code, goals)`
- `listStudentsWithCounts(filter)`
- `updateStudentEnrollments({code, add, remove})`
- `replaceGoalVersion({old_goal_id, new_goal})`
- `archiveGoal({goal_id})`
- `setStudentActive({code, active})`

### Remote (Supabase) Methods
All methods call corresponding RPC functions via `supabase.rpc()`.

## Error Handling

### Clear Error Codes
- `STUDENT_CODE_EXISTS` - Student code already in use
- `STUDENT_NOT_FOUND` - Student code not found
- `GOAL_CODE_EXISTS` - Goal code already exists for student
- `GOAL_NOT_FOUND` - Goal ID not found
- `GOAL_ALREADY_REPLACED` - Goal has already been replaced
- `GOAL_ALREADY_ARCHIVED` - Goal is already archived

### UI Error Display
- Inline validation for duplicate codes
- Per-goal error reporting in multi-goal wizard
- Toast notifications for operation success/failure
- Defensive checks for missing enrollments table

## Security & Privacy

### Code-Only Identity
- Only `code` field required for students
- No PII fields (first_name, last_name, dob, email) collected or displayed
- `studentCodeOnly` feature flag enforces this policy

### Row Level Security (RLS)
- All tables have RLS enabled
- Policies allow authenticated users full access (customize for production)
- RPC functions use `SECURITY DEFINER` to bypass RLS when needed

### Password Storage
- Passwords stored as bcrypt hashes in `student_passwords` table
- Never stored in plaintext
- Local mode uses plaintext for development convenience

## Documentation

- **MIGRATIONS.md** - Comprehensive migration guide with rollback procedures
- **test_student_manager.sql** - Automated test script for all RPC functions
- **README.unified-teacher-center.md** - Main project README (to be updated)

## Rollback

If needed, see `docs/MIGRATIONS.md` for step-by-step rollback instructions. Note that rollback will delete data stored in new tables and columns.

## Future Enhancements (Out of Scope)

- Normalized goal_areas table
- Progress audit trail per goal version
- Bulk import/export for students
- Student photo uploads
- Guardian contact management (code-only mode restricts this)
