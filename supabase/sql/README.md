# SQL Utilities for Classroom Hub

This directory contains SQL scripts for managing class rosters, enrollments, and cleanup operations in the Reinisch Classroom system.

## Scripts

### `ingest_roster_csv_inline_safe.sql`

**Purpose:** Import class roster data from CSV format directly into the database using canonical classes and class_enrollments tables.

**Usage:**
1. Open the SQL Editor in your Supabase dashboard
2. Copy the contents of `ingest_roster_csv_inline_safe.sql`
3. Paste your roster CSV data into the `$roster$` block (between the dollar-quoted delimiters)
4. Execute the script

**Expected CSV Format:**
```
Student Code Name,Class,...
S001 John Doe,LA1,LA2
S002 Jane Smith,LSLA,LS
```

**Features:**
- Creates temporary staging tables for safe data processing
- Canonicalizes class names to standard codes (LA1, LA2, LA3, LA4, LSLA, LS, ELA101, ALG1, GEOM, CMATH, SPEECH, WARRIOR)
- Inserts classes first (respects foreign key constraints)
- Creates class_enrollments entries with proper class_id and student_id references
- Updates students.class_code (primary class) based on first-seen enrollment
- Reports unmapped class aliases for manual review

**Expected Warnings:**
- None - this script is designed to run safely without destructive operations

**Notes:**
- The script does NOT change existing constraints or primary keys
- Multiple runs are safe (upserts will update existing records)
- Students can belong to multiple classes (class_enrollments supports this)

---

### `cleanup_zero_enrollment_classes.sql`

**Purpose:** Identify and optionally mark inactive classes with 0 enrollments where another class shares the same "normalized" title. This helps clean up duplicate class variants (e.g., LS-LA vs LSLA) after roster imports.

**Usage:**
1. Open the SQL Editor in your Supabase dashboard
2. Copy the contents of `cleanup_zero_enrollment_classes.sql`
3. Execute the script to see a dry-run report
4. To actually mark duplicates as inactive, uncomment the UPDATE section and re-run

**Features:**
- Adds an `active` boolean column to classes table (default: true) if it doesn't exist
- Identifies classes with 0 enrollments where another class shares the same normalized title
- Reports all duplicate candidates without making changes (dry-run by default)
- Optionally marks zero-enrollment duplicates as inactive (when UPDATE section is uncommented)
- Safe to run multiple times (idempotent)

**Expected Output:**
```
Zero-Enrollment Duplicate Classes Report
========================================

Duplicate #1: Life Skills LA (code: LS-LA) - normalized: "lsla" - enrollments: 0 - total with same title: 2 (1 have enrollments)
Duplicate #2: Language Arts (code: LA) - normalized: "languagearts" - enrollments: 0 - total with same title: 2 (1 have enrollments)

Found 2 zero-enrollment duplicate class(es).

To mark these as inactive, uncomment the UPDATE section below and re-run.
```

**Notes:**
- This script does NOT hard-delete any records
- Classes are only marked as inactive when explicitly enabled (UPDATE section uncommented)
- The normalization logic matches the frontend duplicate detection in hub/index.html
- Inactive classes can be re-activated manually if needed

---

### `repair_enrollment_ids.sql`

**Purpose:** Backfill class_enrollments.class_id from class_code by mapping through the classes table, and install triggers to auto-fill class_id on future inserts.

**Usage:**
1. Open the SQL Editor in your Supabase dashboard
2. Copy the contents of `repair_enrollment_ids.sql`
3. Execute the script

**Features:**
- Backfills missing class_id values in class_enrollments by looking up class_code in the classes table
- Creates a trigger function that automatically fills class_id when class_code is provided on insert
- Safe to run multiple times (idempotent)

**Expected Warnings:**
- None - this is a repair script that only updates existing data

**Notes:**
- Run this script AFTER importing roster data if earlier rows lacked class_id
- The trigger ensures future inserts will automatically populate class_id when class_code is provided
- No constraint changes are made

---

## Workflow

### Initial Setup
1. Run `ingest_roster_csv_inline_safe.sql` with your roster CSV data
2. Run `cleanup_zero_enrollment_classes.sql` to identify and optionally clean up duplicate class variants
3. Verify classes and enrollments in the Data → Classes view
4. If needed, run `repair_enrollment_ids.sql` to backfill any missing class_id values

### Ongoing Maintenance
- Use the ingest script whenever you need to update rosters
- Run the cleanup script after each roster import to identify duplicates
- The repair script only needs to be run once (unless you drop the trigger)
- Multi-class students (e.g., S008 in both Life Skills and LA3) are fully supported

### Hub Classes View
The Classroom Hub displays classes by their title (classes.name) instead of internal codes:
- Primary header shows class name (e.g., "Language Arts 3", "Life Skills")
- Student counts are aggregated from class_enrollments table
- Zero-enrollment duplicates are automatically hidden when another class shares the same normalized title
- Internal codes are shown as small muted text for reference

### Student Hub 24-Hour Remember-Me
Students who log in from the Classroom Hub are automatically redirected to their Student Portal dashboard:
- **Authentication Flow:**
  1. Student logs in from Hub with code and password
  2. Hub stores rc_auth in localStorage with 24-hour expiry
  3. Hub redirects to `/student/?auto=1&code=CODE`
  4. Student Portal detects valid rc_auth and auto-authenticates
  5. Dashboard is displayed without second password prompt

- **Session Management:**
  - 24-hour session: Students remain authenticated across page reloads
  - Manual logout: Click "Logout" button to clear rc_auth and sessionStorage
  - Auto-expiry: Sessions expire after 24 hours and require re-authentication
  - Multi-tab sync: Authentication state is synchronized across browser tabs

- **Security Notes:**
  - Auth tokens are stored in localStorage with expiry timestamps
  - Expired tokens are automatically cleared on access
  - Logout clears both rc_auth (24h) and sessionStorage (current session)

---

## Troubleshooting

### Classes not appearing
- Check that your CSV includes valid class names/codes
- Verify that class aliases are mapped in the ingest script
- Review the unmapped aliases report at the end of the ingest script

### Students missing from classes
- Ensure CSV format matches expected structure
- Check that student codes are consistent between files
- Verify enrollments were created: `SELECT * FROM class_enrollments;`

### Multi-class membership not working
- Verify multiple class codes are separated by commas in the CSV
- Check that class_enrollments table allows multiple rows per student
- Confirm unique constraint on (class_id, student_id), not just student_id

---

## Support

For issues or questions, please refer to the main project documentation or open an issue in the repository.
