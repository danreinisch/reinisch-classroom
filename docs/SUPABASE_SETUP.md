# Supabase Setup & Reliability Guide

This guide helps you configure and optimize Supabase for the Reinisch Classroom application, with a focus on reliability and performance in school/district network environments.

## Quick Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up or log in
2. Click "New Project"
3. Choose a name, database password, and region (choose closest to your location)
4. Wait for the project to initialize (~2 minutes)

### 2. Configure Settings in the App

1. Navigate to the **Settings** tab in the Classroom Hub
2. Find your Supabase credentials:
   - **URL**: Project Settings → API → Project URL
   - **Anon Key**: Project Settings → API → anon/public key
3. Enter these values in the app
4. Check "Use Supabase (remote storage)"
5. Click **Save Settings**
6. Click **Test Connection** to verify

### 3. Initialize Schema

Run the SQL migration scripts in your Supabase SQL Editor (Dashboard → SQL Editor):

1. Navigate to `/supabase/migrations/` in this repository
2. Copy and paste each migration file in order into the SQL Editor
3. Execute each migration
4. Verify tables are created in the Table Editor

## Network & Firewall Considerations

### CDN Fallback Strategy

The app uses multiple CDN sources to load the Supabase client library:
1. **Primary**: esm.sh
2. **Fallback 1**: jsDelivr
3. **Fallback 2**: unpkg

If all CDNs are blocked by your network firewall, the app automatically falls back to localStorage-only mode.

### Common Network Issues

**Symptom**: "Enabled + OK" but operations fail  
**Cause**: Firewall blocking Supabase API calls  
**Solution**: Request IT to whitelist `*.supabase.co` domains

**Symptom**: Connection timeout  
**Cause**: Slow network or firewall inspection delays  
**Solution**: Retry automatically handled by the app (3 retries with exponential backoff)

**Symptom**: CDN libraries fail to load  
**Cause**: School firewall blocks CDN domains  
**Solution**: App auto-falls back to localStorage. Contact IT to whitelist CDN domains.

### Whitelisting for IT Departments

If your school/district firewall blocks resources, request IT to whitelist:

**For Supabase API**:
- `*.supabase.co` (all subdomains)
- Your specific project URL (e.g., `yourproject.supabase.co`)

**For CDN resources**:
- `esm.sh`
- `cdn.jsdelivr.net`
- `unpkg.com`

## Reliability Features

### Automatic Retry Logic

All Supabase requests are wrapped with retry logic:
- **Retries**: 3 attempts
- **Backoff**: Exponential (200ms, 400ms, 800ms) with random jitter
- **Retryable errors**: Network timeouts, connection resets, rate limits

### Reactive Client Rebuilding

The Supabase client automatically rebuilds when:
- Settings are saved in the Hub
- Supabase is enabled/disabled via toggle
- Configuration changes in another browser tab (cross-tab sync)

This ensures instant activation without page reload.

### Cross-Tab Synchronization

When you update Supabase settings in one browser tab, all other tabs automatically:
1. Detect the change via `storage` event
2. Rebuild the Supabase client with new configuration
3. Resume operations without interruption

## Performance Optimization

### Indexes

Use the SQL snippets in `/supabase/sql-extras/00_performance_indexes.sql` to add indexes for common queries:

```sql
-- Example: Index on students.code for fast lookups
CREATE INDEX IF NOT EXISTS idx_students_code ON students(code);

-- Example: Index on goals.student_id for joins
CREATE INDEX IF NOT EXISTS idx_goals_student_id ON goals(student_id);
```

**When to add indexes**:
- Queries that frequently filter on a column
- Foreign key columns used in joins
- Columns used in ORDER BY clauses

**Trade-offs**:
- Faster reads, slightly slower writes
- Use judiciously; too many indexes slow down inserts/updates

### Updated_At Triggers

Auto-maintain `updated_at` timestamps for optimistic sync:

```sql
-- See /supabase/sql-extras/01_triggers_updated_at.sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

Apply to tables that need change tracking (students, goals, assignments, etc.).

### Bulk Operations

For batch imports (100+ records), use bulk RPCs instead of individual inserts:

```sql
-- See /supabase/sql-extras/03_optional_bulk_rpcs.sql
-- Example: Bulk upsert students
CREATE OR REPLACE FUNCTION bulk_upsert_students(students_data JSONB)
RETURNS void AS $$
BEGIN
  INSERT INTO students (code, name, class_id)
  SELECT 
    (student->>'code')::text,
    (student->>'name')::text,
    (student->>'class_id')::uuid
  FROM jsonb_array_elements(students_data) AS student
  ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    class_id = EXCLUDED.class_id;
END;
$$ LANGUAGE plpgsql;
```

Call from JavaScript:
```javascript
await supabase.rpc('bulk_upsert_students', {
  students_data: [
    { code: 'S001', name: 'Alice', class_id: '...' },
    { code: 'S002', name: 'Bob', class_id: '...' }
  ]
});
```

## Row Level Security (RLS)

### Development Environment

For testing/development, use permissive policies:

```sql
-- See /supabase/sql-extras/04_dev_policies_open.sql
-- WARNING: These policies allow unrestricted access. Use only in development!
CREATE POLICY "dev_allow_all" ON students FOR ALL USING (true);
CREATE POLICY "dev_allow_all" ON goals FOR ALL USING (true);
```

### Production Environment

For production, use role-based policies:

```sql
-- See /supabase/sql-extras/04_prod_policies_recommended.sql
-- Example: Teachers can read/write their students
CREATE POLICY "teachers_own_students" ON students
  FOR ALL
  USING (auth.uid() = teacher_id);

-- Example: Students can read their own data
CREATE POLICY "students_read_own" ON students
  FOR SELECT
  USING (auth.uid() = user_id);
```

**Best Practices**:
- Start with dev policies to confirm functionality
- Transition to production policies before deploying
- Test policies thoroughly with different user roles
- Use `auth.uid()` to tie records to authenticated users

## Diagnostics

### Test Connection

Use the **Test Connection** button in Settings to verify:
- ✅ URL and anon key are valid
- ✅ Network allows Supabase API access
- ✅ auth/v1/settings endpoint is reachable

### Show Diagnostics

Click **Show Diagnostics** to view:
- Masked URL and key (for privacy)
- Key lengths (helps detect paste errors)
- Unified vs. legacy key status
- Enabled/auto-enabled flags

### Console Logging

Check browser console (F12) for detailed logs:
- `[supabase-client]` - CDN loading and client rebuild events
- `[withRetry]` - Retry attempts and backoff delays
- `[supabase-settings]` - Configuration changes

## Troubleshooting

### "supabase-not-configured" Errors

**Cause**: Client is null (URL/key missing or toggle OFF)  
**Fix**:
1. Verify URL and anon key are entered correctly
2. Ensure "Use Supabase" is checked
3. Click "Save Settings"
4. Wait 1-2 seconds for client rebuild

### Data Not Syncing

**Cause**: Client may not have rebuilt after settings change  
**Fix**:
1. Check browser console for rebuild messages
2. Reload the page
3. Toggle Supabase OFF then ON again
4. Clear browser cache and retry

### Slow Performance

**Cause**: Missing indexes or unoptimized queries  
**Fix**:
1. Run SQL snippets from `/supabase/sql-extras/00_performance_indexes.sql`
2. Check Supabase Dashboard → Database → Query Performance
3. Identify slow queries and add targeted indexes

### Rate Limiting

**Cause**: Too many requests in short time  
**Fix**: Retry logic handles this automatically. If persistent:
1. Upgrade Supabase plan for higher rate limits
2. Implement client-side caching
3. Batch operations when possible

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgREST API Reference](https://postgrest.org/)
- [RLS Policies Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Performance Best Practices](https://supabase.com/docs/guides/database/performance)

## Support

For issues specific to this app:
1. Check browser console for error messages
2. Review diagnostics output
3. Test connection to verify network access
4. Consult this guide's troubleshooting section

For Supabase platform issues:
- [Supabase Support](https://supabase.com/support)
- [Community Discord](https://discord.supabase.com)
