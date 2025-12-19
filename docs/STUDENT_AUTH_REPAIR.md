# Student Authentication Repair Guide

This guide explains how to use the `repair_student_auth_usernames_passwords.sql` script to fix student authentication issues in the Reinisch Classroom Supabase database.

## Problem Summary

Student authentication was failing due to two related issues:

### Issue 1: Case-Colliding Duplicate Usernames

The `public.app_users` table contained duplicate student entries that differed only by case:
- Example: Both `S004` (uppercase) and `s004` (lowercase) existed as separate rows
- Root cause: Multiple data imports or manual entries created inconsistent casing
- Impact: Students could not log in reliably because `verify_user_password` performs case-sensitive lookup

The authentication function `verify_user_password(p_username, p_password)`:
- Looks up `public.app_users.username = p_username` (case-sensitive)
- Returns user info only if the password matches the stored hash
- With duplicate case variants, authentication was unpredictable

### Issue 2: Legacy Password Policy

Students were initially configured with passwords that included a `!` suffix:
- Old password: `S001!` (code with exclamation mark)
- New policy: `S001` (code without suffix)
- Root cause: Legacy password generation logic that added `!` for complexity
- Impact: Students couldn't log in with their code alone

## When to Run This Script

Run the repair script if you encounter any of these symptoms:

1. **Student Login Failures**
   - Students report they cannot log in with their code
   - `verify_student_password(code, code)` returns false
   - Inconsistent authentication results for the same student

2. **Data Integrity Issues**
   - Database shows multiple app_users rows for the same student code
   - Student usernames appear in both uppercase and lowercase variants
   - Query: `SELECT * FROM app_users WHERE role='student' ORDER BY lower(username)` shows duplicates

3. **After Data Migration**
   - After importing roster data from multiple sources
   - After manual student account creation without standardized casing
   - After restoring from backup where casing wasn't enforced

## Safety Considerations

### What This Script Does

✅ **Safe Operations:**
- Detects and reports case-colliding student usernames
- Deletes lowercase student username variants (preserves uppercase canonical versions)
- Resets student passwords to match their code exactly (removes `!` suffix)
- Only affects rows where `role='student'`
- Preserves teacher, admin, and substitute accounts
- Does not modify table structure or constraints
- Idempotent: safe to run multiple times

❌ **Does NOT:**
- Modify non-student accounts (teacher, admin, substitute)
- Change table schemas, indexes, or constraints
- Delete uppercase student usernames
- Affect student_id foreign key relationships
- Run automatically (must be executed manually)

### Production Impact

**During Execution:**
- Brief write lock on affected `app_users` rows
- Typical execution time: < 1 second for ~100 students
- No downtime required
- Students currently logged in remain authenticated

**After Execution:**
- Students must use their code without `!` to log in
- Example: Student `S001` logs in with password `S001` (not `S001!`)
- Previously logged-in students may need to re-authenticate
- Lowercase username variants are removed permanently

### Recommended Timing

- Run during off-hours if possible (evening/weekend)
- Notify students that passwords have changed to match their codes
- Have support available for students who need help
- Consider running on staging/test environment first

## How to Run the Script

### Step 1: Access Supabase SQL Editor

1. Sign in to your Supabase dashboard: https://supabase.com
2. Select your Reinisch Classroom project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New query** to create a new SQL script

### Step 2: Load the Script

**Option A: Copy from Repository**
1. Open `supabase/sql/repair_student_auth_usernames_passwords.sql` in your repository
2. Copy the entire contents
3. Paste into the Supabase SQL Editor

**Option B: Upload File**
1. In SQL Editor, click the **Import** button
2. Select the `repair_student_auth_usernames_passwords.sql` file
3. Confirm the import

### Step 3: Review the Script

Before executing, review the script sections:

- **Step A:** Detects case-colliding student usernames
- **Step B:** Removes lowercase student username duplicates
- **Step C:** Resets passwords for uppercase student codes
- **Step D:** Verification queries (commented, run separately)

The script includes progress logging via `RAISE NOTICE` statements to show what's happening.

### Step 4: Execute the Script

1. Click the **Run** button (or press Ctrl+Enter / Cmd+Enter)
2. Watch the **Results** panel for progress notices
3. Review the summary output

**Expected Output:**
```
STEP A: Case-Colliding Student Usernames Detected
Found 1 groups of student usernames that differ only by case
  Collision: "s004" appears 2 times

STEP B: Removing Lowercase Student Usernames
Found 1 lowercase student username(s) to remove
Deleted 1 lowercase student username(s)

STEP C: Resetting Student Passwords
Reset passwords for 45 student code(s)
Student passwords now match their codes exactly (no "!" suffix)

REPAIR COMPLETE
Case collisions detected: 1
Lowercase usernames deleted: 1
Student passwords reset: 45

See verification queries below (uncomment to run)
```

### Step 5: Verify the Repair

The script includes verification queries at the end (Step D). Uncomment and run each one:

#### Verification Query 1: Check Lowercase Count
```sql
SELECT count(*) as lowercase_student_count
FROM app_users
WHERE role = 'student'
  AND username = lower(username);
```
**Expected result:** `lowercase_student_count = 0`

#### Verification Query 2: Test Authentication for All Students
```sql
SELECT username,
       verify_student_password(username, username) as ok_code,
       verify_student_password(username, username || '!') as ok_old
FROM app_users
WHERE role = 'student'
  AND username ~ '^S[0-9]{3}$'
ORDER BY username
LIMIT 10;
```
**Expected result:** All rows show `ok_code = true` and `ok_old = false`

#### Verification Query 3: Test Specific Student
```sql
-- Should succeed (returns row)
SELECT * FROM verify_student_password('S001', 'S001');

-- Should fail (returns empty)
SELECT * FROM verify_student_password('S001', 'S001!');
```
**Expected result:** First query returns user info, second returns empty

#### Verification Query 4: Check for Remaining Collisions
```sql
SELECT lower(username) as username_lower, count(*) as count,
       array_agg(username) as variants
FROM app_users
WHERE role = 'student'
GROUP BY lower(username)
HAVING count(*) > 1;
```
**Expected result:** No rows (empty result set)

## Troubleshooting

### Script Execution Errors

**Error: "relation app_users does not exist"**
- Cause: Database schema not properly initialized
- Solution: Apply base schema migrations first (see `docs/SUPABASE_SETUP.md`)

**Error: "function extensions.crypt does not exist"**
- Cause: pgcrypto extension not enabled
- Solution: Run `CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`

**Error: "permission denied"**
- Cause: Insufficient privileges to modify app_users
- Solution: Ensure you're using a role with appropriate permissions (typically postgres or service_role)

### Post-Repair Issues

**Students still can't log in**
- Verify password was reset: Check Step C output for "Reset passwords for N student code(s)"
- Test authentication manually: Run verification query 2 or 3
- Check student code format: Must match `^S[0-9]{3}$` pattern (e.g., S001, S042)
- Clear student browser cache/localStorage

**Duplicate usernames still showing**
- Re-run verification query 4 to confirm
- Check if duplicates are in different roles (non-student accounts are not affected)
- Review Step A and Step B output to see what was detected/deleted

**Lost student accounts**
- This script only deletes lowercase variants, preserving uppercase
- Check: `SELECT * FROM app_users WHERE role='student' ORDER BY username`
- If uppercase version exists, student account is intact
- If completely missing, restore from backup or re-import roster

## Re-running the Script

The script is **idempotent** and safe to run multiple times:

- If no issues exist, it reports "No ... to remove" and "No ... needed reset"
- If issues are found, it fixes them and reports the changes
- Running multiple times won't create duplicates or corrupt data
- Useful for periodic maintenance or after roster imports

## Related Documentation

- [Supabase Setup Guide](SUPABASE_SETUP.md) - Database initialization and configuration
- `supabase/sql/repair_enrollment_ids.sql` - Similar repair script for class enrollments
- `supabase/migrations/20251204_fix_auth_rpc.sql` - Authentication function definitions

## Support

For questions or issues:
- Check the [repository issues](https://github.com/danreinisch/reinisch-classroom/issues)
- Review Supabase logs for detailed error messages
- Ensure you're running the latest version of the script from the repository
