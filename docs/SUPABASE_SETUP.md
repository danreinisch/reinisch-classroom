# Supabase Setup Guide

This guide walks you through setting up Supabase for the Reinisch Classroom application.

## Prerequisites

- A Supabase account (free tier available at https://supabase.com)
- Basic understanding of PostgreSQL and Row-Level Security (RLS)

## Step 1: Create a Supabase Project

1. Sign in to https://supabase.com
2. Create a new project
3. Wait for the database to be provisioned (usually 1-2 minutes)
4. Note your project URL and anon key from the Settings > API page

## Step 2: Apply Database Schema

Apply the schema files in order:

1. Navigate to the SQL Editor in your Supabase dashboard
2. Run the schema files from the `supabase/schema/` directory in your repository
3. Apply the main schema: `supabase/schema_teacher.sql`

The schema includes:
- `students` - Student records with unique codes
- `goals` - IEP goals linked to students
- `progress_entries` - Progress tracking for goals
- `events` - Calendar events and evaluations
- `assignments` - Assignment definitions
- `assignment_instances` - Student-specific assignment assignments
- `submissions` - Student submission records
- `classes` - Class/group definitions
- `class_enrollments` - Student enrollment in classes

## Step 3: Configure Credentials in the Application

1. Open the Classroom Hub (site/hub/index.html)
2. Navigate to Settings
3. Enter your Supabase URL and Anon Key
4. Enable "Use Supabase for remote data"
5. Click "Save Settings"
6. Test the connection using the "Test Connection" button

The connection test uses the `/auth/v1/settings` endpoint, which is:
- Lightweight and table-agnostic
- Returns OK for valid credentials
- Returns unauthorized for invalid anon keys
- Returns network error for blocked/unreachable URLs

## Step 4: Optional Performance Enhancements

Apply optional SQL extras from `supabase/sql-extras/`:

### Performance Indexes (`00_performance_indexes.sql`)
Adds indexes for common foreign key relationships and query patterns:
- Student lookups by code
- Goal queries by student_id
- Assignment instance queries
- Event and progress entry queries

### Updated_at Triggers (`01_triggers_updated_at.sql`)
Automatically maintains `updated_at` timestamps for optimistic sync and change tracking.

### Bulk Operations (`03_optional_bulk_rpcs.sql`)
Example RPC functions for bulk operations (e.g., `bulk_upsert_students`).
These use `SECURITY DEFINER` and should be reviewed carefully.

### Row-Level Security Policies

Choose based on your deployment environment:

**Development (`04_dev_policies_open.sql`)**
- Permissive policies for rapid development
- ⚠️ NOT suitable for production
- Allows anon access to all operations

**Production (`04_prod_policies_recommended.sql`)**
- Safer baseline policies
- Anon role: read-only access
- Authenticated role: read/write access
- Adjust based on your security requirements

## Reliability Features

This application uses several reliability features:

### Reactive Client
The Supabase client rebuilds automatically when:
- Settings are saved (via `rc:remote-config-changed` event)
- Settings change in another browser tab (via `storage` event)

This eliminates the need for page reloads after configuration changes.

### Multi-CDN Fallback
The client attempts to load @supabase/supabase-js@2 from multiple sources:
1. esm.sh (primary)
2. jsDelivr
3. unpkg
4. Vendored fallback at `/vendor/supabase-js@2.mjs`

If all sources fail, the app falls back to localStorage-only mode.

### Retry Logic
All Supabase operations are wrapped with exponential backoff retry logic:
- Default: 2 retries with 250ms base delay
- Exponential backoff with jitter to avoid thundering herd
- Skips retry for configuration and authorization errors
- Handles transient network failures gracefully

## Troubleshooting

### Connection Test Fails

**"not-configured"**
- Ensure URL and anon key are entered in Settings
- Click "Save Settings" before testing

**"HTTP 401: Unauthorized"**
- Verify the anon key is correct (copy from Supabase dashboard)
- Check for extra whitespace in the key field

**"connection-failed" or "Failed to fetch"**
- Check network connectivity
- Verify the URL is correct and includes `https://`
- Check browser console for CORS or CSP errors
- Verify Supabase project is running (not paused)

### Data Operations Fail After Setup

**"supabase-not-configured"**
- Enable "Use Supabase for remote data" in Settings
- Click "Save Settings"
- Reload the page

**RLS Policy Errors (PGRST301, 42501)**
- Review and apply appropriate RLS policies
- For development, use `04_dev_policies_open.sql`
- For production, customize `04_prod_policies_recommended.sql`

**Schema Errors**
- Ensure all schema files were applied in order
- Check Supabase logs in the dashboard for migration errors

### Performance Issues

**Slow Queries**
- Apply performance indexes: `00_performance_indexes.sql`
- Review query patterns in browser Network tab
- Use Supabase dashboard to analyze slow queries

**Stale Data After Updates**
- Clear browser cache and reload
- Verify `updated_at` triggers are installed
- Check that reactive client events are firing (browser console)

## Security Best Practices

### Secrets Management
- ❌ Never commit Supabase credentials to version control
- ✅ Use environment variables for serverless functions
- ✅ Use Supabase Auth for user authentication
- ❌ Never log full anon keys (only length if needed)

### Row-Level Security
- Always enable RLS on tables with sensitive data
- Test policies thoroughly before production deployment
- Use service role key only in secure server environments
- Default to least-privilege access

### RPC Functions
- Review all `SECURITY DEFINER` functions carefully
- Validate all inputs in RPC functions
- Use RLS policies in combination with RPCs when possible

## Next Steps

1. Import your student roster using the Pull/Seed tools
2. Create IEP goals for students
3. Set up assignments and assignment instances
4. Monitor the application logs for any errors
5. Customize RLS policies based on your access control needs

For additional help, see:
- Supabase documentation: https://supabase.com/docs
- PostgREST API reference: https://postgrest.org/
- Repository issues: https://github.com/danreinisch/reinisch-classroom/issues
