# Teacher Authentication Migration to Supabase

## Overview

This document describes the migration of Teacher Center authentication from environment variable-based credentials (`TEACHER_USERNAME`/`TEACHER_PASSWORD`) to Supabase RPC-based authentication.

## Motivation

- **Unified Authentication**: Aligns teacher authentication with the admin flow already migrated to Supabase
- **Security**: Eliminates exposed-secret false positives tied to teacher credentials in environment variables
- **Reliability**: Fixes 401/502 login errors caused by credential rotation misalignment
- **Flexibility**: Allows for easier credential management and rotation through database

## Changes

### Backend Functions

1. **netlify/functions/teacher-login.js**
   - Removed dependency on `TEACHER_USERNAME` and `TEACHER_PASSWORD` environment variables
   - Now calls Supabase RPC `verify_user_password` to authenticate users
   - Accepts both `teacher` and `admin` roles for Teacher Center access
   - Returns proper 401 for invalid credentials (not 502)

2. **netlify/functions/_lib/auth.js**
   - Updated `requireTeacher()` to accept both `teacher` and `admin` roles
   - Maintains backward compatibility with existing cookie/session semantics

3. **netlify/functions/_lib/supa.js**
   - Added `rpc()` helper function for calling Supabase stored procedures

### Frontend

4. **site/teacher/index.html**
   - Updated login form to include username field
   - Modified `doLogin()` to submit both username and password

## Environment Variables

### Required (Runtime)

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (has admin privileges)
- `SESSION_SECRET` - Secret for signing teacher session cookies

### Deprecated (No Longer Used)

- `TEACHER_USERNAME` - ❌ No longer used
- `TEACHER_PASSWORD` - ❌ No longer used

## Setup Instructions

### 1. Ensure Supabase Schema is Deployed

The required tables and functions should already be in place from migration `20251105_app_users_and_sub_plans.sql`:

- `app_users` table with bcrypt password hashing
- `verify_user_password(p_username, p_password)` RPC function
- `set_user_password(p_username, p_password, p_role, p_student_id)` RPC function

### 2. Seed Teacher User in Supabase

You need to create the teacher user in Supabase. Run this SQL in your Supabase SQL Editor:

```sql
-- Create teacher user with username 'dreinisch' and password 'Tool462'
select set_user_password('dreinisch', 'Tool462', 'teacher', null);
```

Or for an admin user:

```sql
-- Create admin user (can also access Teacher Center)
select set_user_password('admin', 'AdminPass123!', 'admin', null);
```

### 3. Configure Environment Variables

In Netlify (or your hosting platform):

1. Go to Site Settings → Environment Variables
2. Ensure these are set with "Runtime" scope:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
3. You can remove `TEACHER_USERNAME` and `TEACHER_PASSWORD` (they are no longer used)

### 4. Deploy

Deploy your site. The teacher login will now authenticate against Supabase.

## Testing

### Manual Test

1. Navigate to `/teacher/` on your deployed site
2. Enter username: `dreinisch`
3. Enter password: `Tool462`
4. Click Login
5. You should see the Teacher Center interface
6. Navigate to `/.netlify/functions/teacher-session` - should return `{ ok: true, role: "teacher", username: "dreinisch" }`

### Invalid Credentials Test

1. Navigate to `/teacher/`
2. Enter incorrect username or password
3. Should see "Invalid credentials" message
4. Should receive 401 status (not 502)

### Admin Access Test

1. Create an admin user in Supabase (see step 2 above)
2. Log in with admin credentials
3. Admin users should be able to access Teacher Center

## Rollback Plan

If you need to revert to the old authentication method:

1. Revert this PR/merge
2. Restore `TEACHER_USERNAME` and `TEACHER_PASSWORD` environment variables
3. Redeploy

The old code will work immediately without any database changes needed.

## Security Notes

- Passwords are hashed using bcrypt (cost factor 8) in the Supabase database
- Session cookies are signed with `SESSION_SECRET` and are HttpOnly
- RPC calls use `SUPABASE_SERVICE_ROLE_KEY` which should be kept secret
- Invalid login attempts are logged (username only, no passwords)
- Both 'teacher' and 'admin' roles can access Teacher Center

## Troubleshooting

### "Server not configured" error

- Check that `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SESSION_SECRET` are set in environment variables
- Ensure environment variables have "Runtime" scope in Netlify

### "Authentication service error" (502)

- Check Supabase connection - verify URL and service key are correct
- Ensure the `verify_user_password` function exists in your Supabase database
- Check Supabase logs for RPC errors

### "Invalid username or password" (401)

- Verify the user exists in the `app_users` table in Supabase
- Verify the user's role is either 'teacher' or 'admin'
- Try resetting the password using `set_user_password()` function

### Session not persisting

- Check that `SESSION_SECRET` is set and consistent across deployments
- Check browser cookies - the 'tc' cookie should be present and HttpOnly
- Verify cookie is not being blocked by browser security settings
