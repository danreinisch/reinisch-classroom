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

### Vendored Supabase Library
The client loads @supabase/supabase-js (pinned to v2.89.0) exclusively from the vendored file at `/vendor/supabase-js@2.mjs`.
This approach ensures:
- **CSP Compliance**: No external CDN requests that could trigger Content Security Policy violations
- **Deterministic Loading**: Predictable behavior across all deployment environments with a pinned, known-good version
- **Offline Capability**: Works in environments without external network access
- **No Stub Warnings**: The vendored file contains the real, fully-functional Supabase library

The vendored file is a self-contained ESM bundle that includes all necessary dependencies.

If the vendored library fails to load, the app falls back to localStorage-only mode.

### Upgrading the Vendored Supabase JS Library

The Supabase JS library is **intentionally pinned** to ensure:
- **Deterministic builds**: All environments use the exact same library version
- **Stability**: Upgrades are deliberate, tested, and reviewable
- **CSP compliance**: No surprise changes from external CDN updates

**Current pinned version**: v2.89.0 (as of 2025-12-19)

#### Upgrade Procedure

Follow these steps when upgrading to a new version:

1. **Choose a target version**
   - Select a stable v2.x.y release from https://www.npmjs.com/package/@supabase/supabase-js
   - Review the release notes for breaking changes or security fixes

2. **Download the ESM bundle**
   - Use jsDelivr CDN with the `+esm` suffix to obtain the ESM bundle (recommended):
     ```
     https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.x.y/+esm
     ```
   - Replace `2.x.y` with your target version (e.g., `2.89.0`)
   - Download the file contents via browser or curl:
     ```bash
     curl -o supabase-js@2.mjs "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.x.y/+esm"
     ```
   - Alternative: If jsDelivr is unavailable, you can use unpkg as a fallback:
     ```bash
     curl -o supabase-js@2.mjs "https://unpkg.com/@supabase/supabase-js@2.x.y/dist/module/index.js"
     ```

3. **Replace the vendored file**
   - Replace `site/vendor/supabase-js@2.mjs` with the downloaded contents
   - Ensure the file remains named `supabase-js@2.mjs`

4. **Update the header comment**
   - Edit the header comment in `site/vendor/supabase-js@2.mjs` to reflect:
     - New version number (e.g., `v2.x.y`)
     - Current date in YYYY-MM-DD format
   - Example header:
     ```javascript
     // Vendored @supabase/supabase-js v2.x.y
     // Package: @supabase/supabase-js
     // Version: 2.x.y (pinned)
     // Source: NPM package bundled with esbuild
     // Date: YYYY-MM-DD
     // License: MIT
     ```

5. **Update this documentation**
   - Update the version number in the "Vendored Supabase Library" section above
   - Update the "Current pinned version" note in this section

6. **Verify in browser console**
   - Serve the site locally or deploy to preview environment
   - Open browser developer console (F12)
   - Test the library import:
     ```javascript
     import('/vendor/supabase-js@2.mjs').then(m => console.log(typeof m.createClient))
     ```
   - Expected output: `"function"`
   - Check the file loads correctly:
     ```javascript
     fetch('/vendor/supabase-js@2.mjs').then(r => r.text()).then(t => console.log(t.length))
     ```
   - Expected output: large number (typically >400,000 characters)

7. **Run smoke checks**
   - Load the Classroom Hub and verify no console errors
   - Load the Student portal and verify no console errors
   - Test Supabase connection via Settings > Test Connection
   - Verify data operations work (e.g., view students, goals, or assignments)

#### Rollback Procedure

If issues arise after upgrading:

1. **Revert the commit**
   ```bash
   git revert <commit-hash>
   ```
   Or manually restore the previous version of `site/vendor/supabase-js@2.mjs`

2. **Redeploy**
   - Push the revert commit to trigger a new deployment
   - For Netlify, the deploy will happen automatically on push

3. **Verify rollback**
   - Confirm the original version is restored
   - Test that the application functions correctly

### Retry Logic
All Supabase operations are wrapped with exponential backoff retry logic:
- Default: 2 retries with 250ms base delay
- Exponential backoff with jitter to avoid thundering herd
- Skips retry for configuration and authorization errors
- Handles transient network failures gracefully

## Verification

To verify the vendored Supabase library is working correctly:

### Browser Console Verification

1. Open your browser's developer console (F12)
2. Run the following command to test the library import:
   ```javascript
   import('/vendor/supabase-js@2.mjs').then(m => console.log('createClient available:', !!m.createClient))
   ```
3. You should see: `createClient available: true`

### Expected Behavior

- ✅ No stub warning messages in the console
- ✅ `createClient` function is available from the vendored file
- ✅ Supabase client creation works when configured with valid credentials
- ✅ No CSP violations or external CDN requests

### What to Check If Issues Occur

- Verify the file exists at `/vendor/supabase-js@2.mjs` (should be ~418KB)
- Check browser console for any import errors
- Ensure no Content Security Policy violations are reported
- Confirm the file is being served correctly by your web server

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

### Student Authentication (Server-Side)

The application uses server-side student authentication via Netlify Functions to avoid exposing Supabase service role keys client-side:

**Endpoint:** `/.netlify/functions/student-login`

**Method:** `POST`

**Request Body:**
```json
{
  "code": "S001",
  "password": "student_password"
}
```

**Response (Success - 200):**
```json
{
  "ok": true,
  "code": "S001",
  "name": "S001"
}
```

**Response (Failure - 401):**
```json
{
  "ok": false,
  "error": "Invalid credentials"
}
```

**Required Environment Variables:**
- `SUPABASE_URL` or `SUPABASE_URL_RUNTIME` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY_RUNTIME`, or `SUPABASE_SERVICE_KEY` - Service role key (NOT anon key)

**Setup in Netlify:**
1. Go to Site Settings > Environment Variables
2. Add the required variables listed above
3. Deploy the site to activate the function

**Security Features:**
- Password verification happens server-side using the `verify_student_password` RPC
- Uses pgcrypto/crypt for secure password hashing
- No service role keys exposed to client-side code
- `Cache-Control: no-store` prevents credential caching
- CORS headers properly configured

**Local Development:**
- The client-side code includes a local fallback when running on localhost
- This fallback is disabled in production for security
- For local testing, ensure Supabase is configured or use local mode

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
