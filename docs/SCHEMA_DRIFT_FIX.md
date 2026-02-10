# Schema Drift Fix: Missing Students Table Columns

## The Problem

The remote Supabase project (`yrcvsotxnelnlcagblbe`, URL: `https://yrcvsotxnelnlcagblbe.supabase.co`) is missing five columns on the `students` table that the frontend code depends on:

- `iep_due` (date) — IEP due date tracking
- `eval_due` (date) — Evaluation due date tracking
- `primary_case_manager` (text) — Primary case manager assignment
- `archived_at` (timestamptz) — Soft delete timestamp for archiving students
- `active` (boolean) — Active status flag (defaults to true)

### Why the Columns Are Missing

The migration file `supabase/migrations/20260210_students_tab_schema.sql` already exists with the correct DDL but has not been applied remotely. The `supabase db push` command fails with a network timeout to `aws-1-us-east-2.pooler.supabase.com:5432` — likely because outbound port 5432 (PostgreSQL) is blocked in the deployment environment.

### Proof of Issue

REST API call returns 400 with PostgreSQL error code 42703 (undefined_column):
```bash
curl -H "apikey: ${SUPABASE_ANON_KEY}" \
     -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
     "${SUPABASE_URL}/rest/v1/students?select=id,code,iep_due&limit=1"

# Response: HTTP 400
# {"code":"42703","message":"column students.iep_due does not exist",...}
```

The control column `active` (which should exist after migration) also returns 400, while the existing column `code` returns HTTP 200 ✅, confirming the table exists and REST is reachable.

## Fix Path 1: Manual SQL Editor (Fastest)

This is the quickest way to apply the migration when `supabase db push` is blocked.

### Step-by-Step Instructions

1. **Navigate to the SQL Editor**
   - Open: `https://supabase.com/dashboard/project/yrcvsotxnelnlcagblbe/sql/new`
   - Log in with your Supabase account

2. **Copy and paste the migration SQL**
   
   Copy the entire contents of `supabase/migrations/20260210_students_tab_schema.sql`:
   
   ```sql
   -- Students Tab Schema Extensions
   -- Adds columns needed for full student and IEP goal management in the Students tab
   
   -- New columns on goals table
   ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS measurement_type text DEFAULT 'percent';
   ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS data_collector text;
   ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS data_collector_email text;
   ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS class_context text;
   
   -- New columns on students table  
   ALTER TABLE public.students ADD COLUMN IF NOT EXISTS iep_due date;
   ALTER TABLE public.students ADD COLUMN IF NOT EXISTS eval_due date;
   ALTER TABLE public.students ADD COLUMN IF NOT EXISTS primary_case_manager text;
   ALTER TABLE public.students ADD COLUMN IF NOT EXISTS archived_at timestamptz;
   ALTER TABLE public.students ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
   ```

3. **Force PostgREST schema cache refresh**
   
   Add this line at the end (required to make the new columns available via REST API immediately):
   
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

4. **Run the query**
   - Click the "Run" button or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows/Linux)
   - Verify all statements succeed (check for green checkmarks or success messages)

5. **Verify the fix**
   - Run the verification script (see [Verification](#verification) section below)
   - All 5 columns should now return HTTP 200 ✅

## Fix Path 2: CLI `db push` with Network Troubleshooting

If you can unblock port 5432 in your deployment environment, you can use the official CLI method.

### Prerequisites

1. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```

2. **Set environment variables**
   ```bash
   export SUPABASE_ACCESS_TOKEN="your-personal-access-token"
   export SUPABASE_DB_PASSWORD="your-database-password"
   ```
   
   - Get `SUPABASE_ACCESS_TOKEN`: https://supabase.com/dashboard/account/tokens
   - Get `SUPABASE_DB_PASSWORD`: https://supabase.com/dashboard/project/yrcvsotxnelnlcagblbe/settings/database (under "Database password")

3. **Unblock port 5432**
   - If running in CI/CD (GitHub Actions, GitLab CI, etc.), configure network rules to allow outbound connections to `aws-1-us-east-2.pooler.supabase.com:5432`
   - If running locally, ensure your firewall/VPN allows PostgreSQL connections

### Apply the Migration

```bash
cd /path/to/reinisch-classroom

# Link to remote project
supabase link --project-ref yrcvsotxnelnlcagblbe

# Push pending migrations
supabase db push
```

Expected output (will vary based on CLI version):
```
Applying migration 20260210_students_tab_schema.sql...
✓ Applied migration 20260210_students_tab_schema.sql
Finished supabase db push.
```

### Troubleshooting Network Timeouts

If you still see timeout errors:
- **Check DNS resolution**: `nslookup aws-1-us-east-2.pooler.supabase.com`
- **Check port connectivity**: `nc -zv aws-1-us-east-2.pooler.supabase.com 5432` or `telnet aws-1-us-east-2.pooler.supabase.com 5432`
- **Verify credentials**: Ensure `SUPABASE_DB_PASSWORD` is correct
- **Try direct pooler**: Use `--db-url` flag with the connection string from Supabase dashboard

## Recording the Migration as Applied

After manually applying the SQL (Fix Path 1), you should mark the migration as applied in the local CLI state to prevent it from being applied again.

### Option A: Using `supabase migration repair`

```bash
supabase link --project-ref yrcvsotxnelnlcagblbe
supabase migration repair 20260210 --status applied
```

This updates the remote `supabase_migrations.schema_migrations` table to record the migration timestamp.

### Option B: Manual SQL Insert

If you prefer to do it manually, run this in the SQL Editor:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES 
  ('20260210', '20260210_students_tab_schema', ARRAY[
    'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS iep_due date',
    'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS eval_due date',
    'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS primary_case_manager text',
    'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS archived_at timestamptz',
    'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true'
  ])
ON CONFLICT (version) DO NOTHING;
```

## Verification

After applying the fix (via either path), verify that all columns are accessible:

### Run the Verification Script

```bash
export SUPABASE_URL="https://yrcvsotxnelnlcagblbe.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"

./scripts/verify_students_columns.sh
```

### Expected Output (All Columns Pass)

```
✅ PASS: students.iep_due (HTTP 200)
✅ PASS: students.eval_due (HTTP 200)
✅ PASS: students.primary_case_manager (HTTP 200)
✅ PASS: students.archived_at (HTTP 200)
✅ PASS: students.active (HTTP 200)
```

### What to Do If Verification Fails

- If you see ❌ FAIL with error code 42703 ("column does not exist"):
  - Double-check that the SQL ran successfully in the dashboard
  - Run `NOTIFY pgrst, 'reload schema';` again to refresh PostgREST cache
  - Wait 10-30 seconds for the cache to refresh, then re-run the script

- If you see HTTP 401 or 403:
  - Verify `SUPABASE_ANON_KEY` is set correctly
  - Check RLS policies on the `students` table allow anonymous reads

- If you see HTTP 404:
  - Verify `SUPABASE_URL` is correct: `https://yrcvsotxnelnlcagblbe.supabase.co`
  - Ensure the `students` table exists

## Frontend Resilience

The frontend code already has robust fallback logic to handle schema drift gracefully, so users won't see errors even when columns are missing — they just won't see the new features.

### Graceful Degradation Pattern

Both `web/data-adapter.js` and `site/web/data-adapter.js` implement schema-error detection:

```javascript
function isSchemaError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  return (
    msg.includes('column') ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('undefined column') ||
    code === '42703' ||    // PostgreSQL: undefined_column
    code === '42P01' ||    // PostgreSQL: undefined_table
    code === 'PGRST204' || // PostgREST: column not found
    code === 'PGRST200'    // PostgREST: relation not found
  );
}
```

When a schema error is detected, the code:
1. Logs a warning: `"Supabase schema may be outdated — some columns not available. Please apply pending migrations."`
2. Retries the query with only the basic columns (`id, code, name, class_id`)
3. Continues execution without crashing

### Where This Is Implemented

- **`site/web/data-adapter.js`**: `remote.listStudents()` (lines 791-814), `remote.upsertStudent()` (lines 815-875), `remote.upsertGoal()` (lines 960-997)
- **`web/data-adapter.js`**: Updated by this PR to match the robust pattern
- **`netlify/functions/teacher-students-upsert.js`**: Serverless function with schema-error retry logic (lines 218-256)

This means:
- ✅ The app won't crash if migrations are pending
- ✅ Teachers can still view and manage students with basic fields
- ✅ New features (IEP dates, case managers, archiving) only become available after migration is applied
- ⚠️ Console warnings will alert developers to apply pending migrations

## Summary

- **Fastest fix**: Use SQL Editor (Fix Path 1) — takes ~2 minutes
- **Proper fix**: Use `supabase db push` (Fix Path 2) — requires network troubleshooting
- **Always verify**: Run `scripts/verify_students_columns.sh` after applying
- **Frontend is safe**: Code already handles missing columns gracefully
- **No downtime**: Migrations can be applied without restarting the app
