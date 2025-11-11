# Authentication Migration and Guardrails

This document describes the migration to Supabase-based authentication and the guardrails implemented to prevent credential leaks and security issues.

## Overview

All authentication now uses Supabase as the single source of truth for usernames and passwords. This eliminates the need for environment-based credentials (`TEACHER_USERNAME`, `TEACHER_PASSWORD`, `ADMIN_USER`, `ADMIN_PASS`) and prevents Netlify deployment failures caused by secret exposure.

## Architecture

### Components

1. **Teacher Center Login** (`/netlify/functions/teacher-login.js`)
   - Uses Supabase RPC `verify_user_password` for authentication
   - Accepts roles: `teacher`, `admin`
   - Sets HttpOnly cookie `tc` signed with `SESSION_SECRET`
   - Implements basic login throttling via attempt cookie

2. **Teacher Session Verification** (`/netlify/functions/teacher-session.js`)
   - Verifies `tc` cookie and returns user role/username
   - Accepts `teacher` and `admin` roles

3. **Admin Login** (`/netlify/functions/admin-session.js`)
   - Uses Supabase RPC `verify_user_password` for authentication
   - Accepts roles: `admin`, `teacher`
   - Sets HttpOnly cookie `rc_admin_session_v3` signed with `ADMIN_SESSION_SECRET`

4. **Admin Edge Guard** (`/netlify/edge-functions/admin-auth-guard.js`)
   - Validates `rc_admin_session_v3` cookie
   - Allows `admin` and `teacher` roles
   - Protects `/admin/*` and upload endpoints

5. **Auth Health Check** (`/netlify/functions/auth-health.js`)
   - Returns configuration status without exposing secret values
   - Can optionally test Supabase connectivity

### Environment Variables

#### Required Runtime Variables

- `SESSION_SECRET` - Used to sign teacher session cookies (min 32 chars)
- `ADMIN_SESSION_SECRET` - Used to sign admin session cookies (min 32 chars)
- `SUPABASE_URL` or `SUPABASE_URL_RUNTIME` - Supabase project URL
- `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_KEY_RUNTIME` - Supabase service role key

#### Runtime Override Pattern

For improved security, you can use runtime-only environment variables:
- `SUPABASE_URL_RUNTIME` - Takes precedence over `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY_RUNTIME` - Takes precedence over `SUPABASE_SERVICE_KEY`

This allows you to:
1. Set the `_RUNTIME` variables with "Functions" scope only (not "Build")
2. Keep them out of the build process entirely
3. Prevent any possibility of leakage into built assets

#### Legacy Variables (No Longer Used in Code)

These variables are no longer referenced in the codebase but may still exist in environment settings:
- `TEACHER_USERNAME`
- `TEACHER_PASSWORD`
- `ADMIN_USER`
- `ADMIN_PASS`
- `ADMIN_USER_ALIASES`
- `DMIN_USER_ALIASES`

You can safely remove these from your Netlify environment variables.

## Setting Up Users

### Using Supabase SQL Editor

Connect to your Supabase project and run the following SQL commands:

#### Set Password for a User

```sql
-- Set password for teacher role
select set_user_password('dreinisch', 'Tool462', 'admin', null);

-- Alternative: Set as teacher instead of admin
select set_user_password('dreinisch', 'Tool462', 'teacher', null);
```

Parameters:
- `p_username` (text): Username (will be normalized to lowercase)
- `p_password` (text): Password in plaintext (will be hashed with bcrypt)
- `p_role` (text): One of: `student`, `teacher`, `substitute`, `admin`
- `p_student_id` (bigint): Optional, for linking to student record

#### Verify Password

```sql
-- Test authentication (returns user info if successful, empty if failed)
select * from verify_user_password('dreinisch', 'Tool462');
```

#### Reset Password

To reset a password, simply call `set_user_password` again with the new password:

```sql
select set_user_password('dreinisch', 'NewPassword123!', 'admin', null);
```

### Bulk User Management

#### Sync Students from Students Table

If you have existing students and want to create user accounts for them:

```sql
-- Creates app_users for all students with default password: <student_code>!
-- For example, student S001 gets password "S001!"
select sync_app_users_from_students();
```

## Testing

### Manual Test Steps

#### 1. Set Up Test User in Supabase

```sql
select set_user_password('dreinisch', 'Tool462', 'admin', null);
```

#### 2. Test Teacher Center Login

Using curl:
```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/teacher-login \
  -H "Content-Type: application/json" \
  -d '{"username":"dreinisch","password":"Tool462"}' \
  -v
```

Expected:
- HTTP 200
- Response body: `{"ok":true,"username":"dreinisch","role":"admin"}`
- Set-Cookie header with `tc` cookie

#### 3. Test Teacher Session Verification

```bash
curl https://your-site.netlify.app/.netlify/functions/teacher-session \
  --cookie "tc=<token_from_login>" \
  -v
```

Expected:
- HTTP 200
- Response body: `{"ok":true,"role":"admin","username":"dreinisch"}`

#### 4. Test Admin Login

Navigate to `https://your-site.netlify.app/admin-login` and enter:
- Username: `dreinisch`
- Password: `Tool462`

Expected:
- Redirect to `/admin/`
- Cookie `rc_admin_session_v3` set

#### 5. Test Auth Health Endpoint

```bash
curl https://your-site.netlify.app/.netlify/functions/auth-health
```

Expected response:
```json
{
  "ok": true,
  "supabase": true,
  "secrets": true,
  "details": {
    "supabase_url": true,
    "supabase_key": true,
    "session_secret": true,
    "admin_secret": true
  }
}
```

#### 6. Test Connectivity (Optional)

```bash
curl "https://your-site.netlify.app/.netlify/functions/auth-health?test_connectivity=true"
```

This will additionally test if Supabase is reachable.

## Security Features

### Login Attempt Throttling

Teacher login implements basic brute-force protection:
- Max 5 attempts per client within 60 seconds
- Tracked via signed attempt cookie
- HTTP 429 returned when limit exceeded
- Automatically resets after successful login

### Environment Leak Detection

The build process includes a leak detection script (`scripts/check-env-leaks.js`) that:
- Scans built output for legacy secret values
- Warns if secrets appear in browser-deliverable files
- Can fail builds in strict mode (set `LEAK_CHECK_STRICT=1`)

To run manually:
```bash
npm run postbuild
```

### No Personal Credentials in Code

- All personal usernames/passwords removed from source code
- Generic `teacher_local` account only works on `localhost`
- No credentials shipped in browser bundles

## Troubleshooting

### Login Fails with 401

1. Check user exists in Supabase:
   ```sql
   select * from app_users where username = 'dreinisch';
   ```

2. Verify password:
   ```sql
   select * from verify_user_password('dreinisch', 'Tool462');
   ```

3. Check Supabase connectivity:
   ```bash
   curl "https://your-site.netlify.app/.netlify/functions/auth-health?test_connectivity=true"
   ```

### Login Fails with 500

1. Check environment variables are set (Netlify dashboard → Site settings → Environment variables)
2. Verify `SESSION_SECRET` and `ADMIN_SESSION_SECRET` are at least 32 characters
3. Check Netlify function logs for specific error messages

### Admin Area Returns 503

This means environment variables are not configured. Check:
- `ADMIN_SESSION_SECRET` is set
- Variable has "Functions" or "All" scope (not just "Build")

### "Too Many Attempts" Error

Wait 60 seconds and try again. The throttle window resets after 1 minute.

## Rollback Procedure

If you need to rollback to the previous authentication system:

1. **Revert this PR**
   ```bash
   git revert <commit-hash>
   git push
   ```

2. **Re-enable legacy environment variables**
   - Set `TEACHER_USERNAME` and `TEACHER_PASSWORD` in Netlify
   - Set `ADMIN_USER` and `ADMIN_PASS` in Netlify

3. **Redeploy**
   - Trigger a new deployment from Netlify dashboard

Note: Old session cookies will be invalidated, requiring users to log in again.

## Migration Checklist

- [ ] Supabase project set up with `app_users` table
- [ ] Migration `20251105_app_users_and_sub_plans.sql` applied
- [ ] Admin user created: `select set_user_password('dreinisch','Tool462','admin',null);`
- [ ] Environment variables configured:
  - [ ] `SESSION_SECRET` (min 32 chars)
  - [ ] `ADMIN_SESSION_SECRET` (min 32 chars)
  - [ ] `SUPABASE_URL` or `SUPABASE_URL_RUNTIME`
  - [ ] `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_KEY_RUNTIME`
- [ ] Deploy preview tested
- [ ] Teacher Center login tested
- [ ] Admin login tested
- [ ] Auth health endpoint verified
- [ ] Leak check script passes
- [ ] Legacy environment variables removed (optional)

## Additional Resources

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [pgcrypto Extension](https://www.postgresql.org/docs/current/pgcrypto.html)
- [Netlify Environment Variables](https://docs.netlify.com/configure-builds/environment-variables/)
