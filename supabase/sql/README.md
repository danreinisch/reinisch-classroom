# SQL Utilities for Classroom Hub

This directory contains SQL scripts for managing class rosters and enrollments in the Reinisch Classroom system.

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
2. Verify classes and enrollments in the Data → Classes view
3. If needed, run `repair_enrollment_ids.sql` to backfill any missing class_id values

### Ongoing Maintenance
- Use the ingest script whenever you need to update rosters
- The repair script only needs to be run once (unless you drop the trigger)
- Multi-class students (e.g., S008 in both Life Skills and LA3) are fully supported

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
