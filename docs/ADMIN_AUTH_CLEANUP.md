# Admin Authentication Cleanup

## Overview

This document describes the migration from legacy environment variable-based admin authentication (`ADMIN_USER`, `ADMIN_PASS`, `ADMIN_USER_ALIASES`) to Supabase-based authentication using the `verify_user_password` RPC function.

## Rationale

### Problems with Legacy Approach

1. **Secret Exposure Risk**: Environment variables marked as "secret" in Netlify cannot be edited or removed via UI, and any occurrence in build output triggers deployment failures
2. **Alias Complexity**: The `ADMIN_USER_ALIASES` system added unnecessary complexity and was prone to leaking sensitive values
3. **Limited Scalability**: Hard-coded credentials don't scale well for multiple admin users
4. **Security Concerns**: Credentials stored in environment variables are less secure than database-backed authentication with proper hashing

### Benefits of Supabase Approach

1. **Database-Backed**: Admin credentials stored in `app_users` table with bcrypt password hashing
2. **Flexible**: Easy to add/remove admin users without code or environment changes
3. **Secure**: Uses Supabase RPC functions with service role key for authentication
4. **Build-Safe**: No credentials in build output; only runtime configuration needed
5. **Runtime Override**: Supports `SUPABASE_URL_RUNTIME` and `SUPABASE_SERVICE_KEY_RUNTIME` for environment-specific overrides

## Migration Changes

### Updated Components

1. **netlify/functions/admin-session.js**
   - Uses Supabase RPC `verify_user_password` instead of environment variable comparison
   - Supports runtime override variables (`SUPABASE_URL_RUNTIME`, `SUPABASE_SERVICE_KEY_RUNTIME`)
   - Cookie name changed to `rc_admin_session_v3`
   - Added `ADMIN_SESSION_MAX_AGE` support (default: 300 seconds, minimum: 60 seconds)

2. **netlify/edge-functions/admin-auth-guard.js**
   - Updated to check Supabase configuration instead of `ADMIN_USER`/`ADMIN_PASS`
   - Supports runtime override variables
   - Cookie name changed to `rc_admin_session_v3`

3. **netlify/functions/admin-session-check.js**
   - Cookie name changed to `rc_admin_session_v3`

4. **netlify/functions/admin-logout.js**
   - Cookie name changed to `rc_admin_session_v3`

5. **netlify/functions/admin-env-diagnostics.js**
   - Now reports only: `SUPABASE_URL`, `SUPABASE_URL_RUNTIME`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_KEY_RUNTIME`, `ADMIN_SESSION_SECRET`
   - Removed reporting of `ADMIN_USER`, `ADMIN_PASS`, `ADMIN_USER_ALIASES`
   - Shows only presence (boolean) and length for each variable

### New Components

1. **scripts/check-env-leaks.cjs**
   - Scans build output directory for literal occurrences of legacy secret values
   - Emits warnings (non-fatal) if found
   - Configurable via `BUILD_OUTPUT_DIR` environment variable (default: 'site')
   - Run via: `npm run check-leaks`

2. **docs/ADMIN_AUTH_CLEANUP.md** (this file)
   - Documentation of migration and rollback procedures

## Environment Variables

### Required (Runtime Only)

- `SUPABASE_URL` - Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_SERVICE_KEY` - Supabase service role key (secret)
- `ADMIN_SESSION_SECRET` - Random 32+ character string for signing session cookies (secret)

### Optional (Runtime Override)

- `SUPABASE_URL_RUNTIME` - If set, takes precedence over `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY_RUNTIME` - If set, takes precedence over `SUPABASE_SERVICE_KEY`
- `ADMIN_SESSION_MAX_AGE` - Session cookie lifetime in seconds (default: 300, minimum: 60)

### Legacy (Can Be Removed After Migration)

- `ADMIN_USER` - No longer used
- `ADMIN_PASS` - No longer used
- `ADMIN_USER_ALIASES` - No longer used

**Note**: Because Netlify marks these as "secret", they cannot be edited or removed via UI. However, they are no longer referenced in code, so their presence is harmless (but they should be rotated if exposed).

## Admin User Setup

Admin users must exist in the Supabase `app_users` table with `role = 'admin'`.

### Create Admin User

Run this SQL in your Supabase SQL editor:

```sql
-- Create admin user with username and password
SELECT set_user_password('admin', 'YourSecurePassword123!', 'admin', null);
```

### Verify Admin User

```sql
-- Verify the user was created with admin role
SELECT username, role, created_at 
FROM app_users 
WHERE role = 'admin';
```

### Test Authentication

You can test the RPC directly:

```sql
-- Should return user info if password is correct
SELECT * FROM verify_user_password('admin', 'YourSecurePassword123!');
```

## Deployment Steps

### 1. Pre-Deployment Verification

```bash
# Ensure no legacy credentials are referenced in code
grep -r "ADMIN_USER_ALIASES\|ADMIN_USER\|ADMIN_PASS" netlify/ --include="*.js" \
  --exclude="admin-env-diagnostics.js"

# Should return no results (or only comments)
```

### 2. Environment Setup

In Netlify UI → Environment variables:

1. Ensure `SUPABASE_URL` is set (Functions + Runtime scopes)
2. Ensure `SUPABASE_SERVICE_KEY` is set and marked as secret (Functions + Runtime scopes)
3. Ensure `ADMIN_SESSION_SECRET` is set and marked as secret (Functions + Runtime scopes)
4. Optionally set `ADMIN_SESSION_MAX_AGE` (e.g., `300` for 5 minutes)

### 3. Database Setup

1. Ensure the `app_users` table exists (should be created by migration `20251105_app_users_and_sub_plans.sql`)
2. Create at least one admin user (see "Admin User Setup" above)

### 4. Deploy

Deploy the changes to a preview environment first for testing.

### 5. Testing

1. **Login Test**: Navigate to `/admin-login` and log in with admin credentials
2. **Session Test**: Verify you can access `/admin/` after login
3. **Cookie Test**: Check browser dev tools → Application → Cookies for `rc_admin_session_v3`
4. **Logout Test**: Click logout and verify you're redirected to login page
5. **Guard Test**: Try accessing `/admin/` without logging in (should redirect to login)

### 6. Leak Check

Run the leak checker to verify no secrets in build output:

```bash
npm run check-leaks
```

Should output: `✅ No legacy secret values found in build output`

## Rollback Plan

If issues arise, rollback is straightforward:

### Git Rollback

```bash
# Revert to previous commit
git revert <this-pr-commit-hash>
git push
```

### Manual Rollback (if needed)

1. Restore previous versions of:
   - `netlify/functions/admin-session.js`
   - `netlify/edge-functions/admin-auth-guard.js`
   - `netlify/functions/admin-session-check.js`
   - `netlify/functions/admin-logout.js`
   - `netlify/functions/admin-env-diagnostics.js`

2. Remove:
   - `scripts/check-env-leaks.cjs`
   - `docs/ADMIN_AUTH_CLEANUP.md`

3. Update `package.json` to remove `check-leaks` script

**Important**: No database changes are required for rollback. The `app_users` table and `verify_user_password` function can remain (they don't interfere with legacy auth).

## Secret Rotation Guidance

### If Legacy Secrets Are Exposed

If `ADMIN_USER`, `ADMIN_PASS`, or `ADMIN_USER_ALIASES` values are exposed in build artifacts:

1. **Immediate Action**: Since these are no longer used by code, exposure is less critical, but still recommended to rotate:
   - Delete the environment variables in Netlify (if UI allows)
   - If UI doesn't allow deletion due to "secret" marking, contact Netlify support

2. **Verify No Code References**: Run grep to ensure no code references:
   ```bash
   grep -r "ADMIN_USER_ALIASES\|process\.env\.ADMIN_USER\|process\.env\.ADMIN_PASS" \
     netlify/ --include="*.js"
   ```

3. **Run Leak Check**: After removing from environment, rebuild and verify:
   ```bash
   npm run check-leaks
   ```

### Rotating Supabase Credentials

If `SUPABASE_SERVICE_KEY` is exposed:

1. Generate a new service role key in Supabase dashboard
2. Update environment variable in Netlify
3. Redeploy (no code changes needed)

If `ADMIN_SESSION_SECRET` is exposed:

1. Generate a new random 32+ character string:
   ```bash
   openssl rand -base64 32
   ```
2. Update environment variable in Netlify
3. Note: This will invalidate all existing sessions (users must re-login)

## Moving to Runtime-Only Variables

To fully separate build-time from runtime secrets:

### 1. Create Runtime-Only Variables

In Netlify UI:
1. Create `SUPABASE_URL_RUNTIME` with same value as `SUPABASE_URL` (Runtime scope only)
2. Create `SUPABASE_SERVICE_KEY_RUNTIME` with same value as `SUPABASE_SERVICE_KEY` (Runtime scope only)

### 2. Test in Preview Environment

Deploy to preview and verify admin login works.

### 3. Update Production

1. Add runtime-only variables to production
2. Verify admin login works
3. Optionally remove `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from Functions scope (keep Runtime scope)

### 4. Benefits

- Secrets never available during build time
- Reduced risk of accidental exposure in build artifacts
- Clearer separation of concerns

## Verification Commands

### Check for Legacy References

```bash
# Should return no results (except in comments/docs)
grep -rn "ADMIN_USER_ALIASES" . --include="*.js" --exclude-dir=node_modules
grep -rn "process.env.ADMIN_USER[^_]" netlify/ --include="*.js"
grep -rn "process.env.ADMIN_PASS" netlify/ --include="*.js"
```

### Verify Build Output

```bash
# Run leak check
npm run check-leaks

# Manual verification
grep -r "testaliasvalue" site/ --include="*.js" --include="*.html"
```

### Test Admin Login Flow

1. Open browser dev tools (Console + Network tabs)
2. Navigate to `/admin-login`
3. Enter admin credentials
4. Submit form
5. Verify:
   - Redirected to `/admin/`
   - Cookie `rc_admin_session_v3` is set
   - No errors in console
   - Network tab shows successful POST to `/.netlify/functions/admin-session`

## Troubleshooting

### Login Fails with "Missing required config"

**Cause**: Supabase environment variables not set or incorrect.

**Fix**:
1. Check Netlify environment variables:
   - `SUPABASE_URL` or `SUPABASE_URL_RUNTIME`
   - `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_KEY_RUNTIME`
   - `ADMIN_SESSION_SECRET`
2. Ensure scopes include "Functions" and "Runtime"
3. Redeploy after updating

### Login Fails with "Supabase RPC failed"

**Cause**: Supabase service key invalid or RPC function not available.

**Fix**:
1. Verify service key is correct (check Supabase dashboard)
2. Verify RPC function exists:
   ```sql
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_name = 'verify_user_password';
   ```
3. If missing, run migration: `supabase/migrations/20251105_app_users_and_sub_plans.sql`

### Login Fails with "Invalid credentials"

**Cause**: Username/password incorrect or user doesn't have admin role.

**Fix**:
1. Verify user exists and has admin role:
   ```sql
   SELECT username, role FROM app_users WHERE username = 'your-username';
   ```
2. If role is not 'admin', update:
   ```sql
   UPDATE app_users SET role = 'admin' WHERE username = 'your-username';
   ```
3. If password is wrong, reset:
   ```sql
   SELECT set_user_password('your-username', 'NewPassword123!', 'admin', null);
   ```

### Session Expires Too Quickly

**Cause**: Default `ADMIN_SESSION_MAX_AGE` is 300 seconds (5 minutes).

**Fix**:
1. Set `ADMIN_SESSION_MAX_AGE` environment variable to desired value (e.g., `1800` for 30 minutes)
2. Note: Minimum is 60 seconds; values below this use 300 seconds default
3. Redeploy after updating

### Build Fails with Secret Detection

**Cause**: Legacy secret values appear in build output.

**Fix**:
1. Run leak check: `npm run check-leaks`
2. Fix any code that includes secret values
3. Rotate exposed secrets
4. Rebuild

## Security Considerations

### What This Migration Improves

1. ✅ Removes hard-coded credentials from environment variables
2. ✅ Uses bcrypt password hashing in database
3. ✅ Enables easy admin user management
4. ✅ Reduces risk of accidental secret exposure
5. ✅ Provides early detection of secret leaks via automated scanning

### What Still Needs Protection

1. ⚠️ `SUPABASE_SERVICE_KEY` - Must remain secret (never commit to code)
2. ⚠️ `ADMIN_SESSION_SECRET` - Must remain secret and be rotated periodically
3. ⚠️ Admin passwords - Should be strong and rotated periodically

### Best Practices

1. Use strong, unique passwords for admin accounts
2. Rotate `ADMIN_SESSION_SECRET` periodically
3. Monitor Supabase logs for suspicious authentication attempts
4. Use runtime-only variables when possible to minimize build-time secret exposure
5. Run `npm run check-leaks` before each deployment

## Support

For issues or questions:
1. Check this documentation first
2. Review the troubleshooting section
3. Check Netlify deploy logs for error messages
4. Check Supabase logs for authentication errors
