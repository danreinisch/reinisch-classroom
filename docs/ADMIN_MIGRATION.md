# Admin Authentication Migration Guide

## Overview

This guide documents the migration from environment variable-based admin authentication (`ADMIN_USER` / `ADMIN_PASS`) to Supabase-backed authentication using the `app_users` table and `verify_user_password` RPC.

## Migration Option C: Supabase-Backed Authentication

### What Changed

**Before:**
- Admin login used environment variables `ADMIN_USER` and `ADMIN_PASS`
- Session cookie name: `rc_admin_session_v2`
- Build failures when `ADMIN_USER` value appeared in UI (exposed secret detection)

**After:**
- Admin login uses Supabase `app_users` table with `verify_user_password` RPC
- Session cookie name: `rc_admin_session_v3`
- Role-based access control (only `admin` and `teacher` roles allowed)
- No dependency on `ADMIN_USER` / `ADMIN_PASS` environment variables
- Default session length: 300 seconds (5 minutes) instead of 5 seconds

### Benefits

1. **Unified Authentication**: All users (students, teachers, admins) use the same Supabase authentication system
2. **No More False Positives**: Eliminates build failures from exposed-secret detection on `ADMIN_USER`
3. **Role-Based Access**: Proper role enforcement with `admin` and `teacher` roles
4. **Secure Password Storage**: Uses bcrypt hashing via pgcrypto extension
5. **Easier Management**: Add/update admin users via SQL without redeploying

### Required Environment Variables

**Keep (no changes required):**
- `ADMIN_SESSION_SECRET` - Still used to sign session cookies
- `SUPABASE_URL` - Already configured (runtime only)
- `SUPABASE_SERVICE_ROLE_KEY` - Already configured (runtime only)

**Can remain but unused:**
- `ADMIN_USER` - Left in place to avoid removal constraints
- `ADMIN_PASS` - Left in place to avoid removal constraints

### Migration Steps

#### 1. Seed Admin User in Supabase

Run the following SQL in your Supabase SQL Editor to create the admin user:

```sql
-- Create admin user 'dreinisch' with password 'ChangeMe123!'
select set_user_password('dreinisch', 'ChangeMe123!', 'admin', null);
```

**Important:** Change the password to a secure value in production!

To create additional admin or teacher users:

```sql
-- Add another admin user
select set_user_password('johndoe', 'SecurePassword123!', 'admin', null);

-- Add a teacher user
select set_user_password('janedoe', 'TeacherPass456!', 'teacher', null);
```

#### 2. Deploy the Changes

Deploy the branch with the updated authentication code:

```bash
# Merge PR and deploy to production
git push origin main
```

Netlify will automatically deploy the changes.

#### 3. Verify the Migration

1. Navigate to `https://your-site.netlify.app/admin-login`
2. Log in with username `dreinisch` and password `ChangeMe123!` (or your custom password)
3. Verify redirect to `/admin/`
4. Check that you can access admin functionality
5. Open browser DevTools → Application → Cookies
6. Verify cookie `rc_admin_session_v3` exists
7. Decode the cookie value (base64url decode the part before the dot)
8. Verify the payload contains: `{ u: "dreinisch", r: "admin", exp: ..., n: "..." }`

#### 4. Test Authentication Failure Cases

1. **Wrong password**: Verify login fails and redirects to `/admin-login?e=1`
2. **Wrong username**: Verify login fails and redirects to `/admin-login?e=1`
3. **Tampered cookie**: 
   - Modify the cookie value in DevTools
   - Try accessing `/admin/`
   - Verify redirect to `/admin-login`
4. **No role user**: Create a student user and try to log in as admin (should fail)

```sql
-- Test with a student user (should be rejected)
select set_user_password('student123', 'TestPass!', 'student', null);
-- Attempting to log in as 'student123' at /admin-login should fail
```

### Rollback Plan

If issues arise, revert the changes:

1. **Via GitHub:**
   ```bash
   git revert <commit-sha>
   git push origin main
   ```

2. **Behavior After Rollback:**
   - Cookie name reverts to `rc_admin_session_v2`
   - Authentication uses `ADMIN_USER` / `ADMIN_PASS` environment variables
   - All existing v2 sessions remain valid
   - New v3 sessions are invalidated

3. **Environment Variables:**
   - Ensure `ADMIN_USER` and `ADMIN_PASS` are still set in Netlify
   - No need to remove or change `ADMIN_SESSION_SECRET`

### Security Considerations

1. **Session Cookie Security:**
   - Cookie is HttpOnly (not accessible via JavaScript)
   - Cookie is Secure (HTTPS only)
   - Cookie uses SameSite=Lax (CSRF protection)
   - Cookie contains HMAC signature (tamper-proof)

2. **Password Security:**
   - Passwords are bcrypt-hashed with cost factor 8
   - Never stored in plaintext
   - Verified using timing-safe comparison

3. **Role Validation:**
   - Enforced at login time (only `admin` and `teacher` allowed)
   - Verified on every protected request via edge function
   - Checked again in session check endpoint

### Troubleshooting

**Login fails with redirect to `/admin-login?e=1`:**
- Check that admin user exists in `app_users` table
- Verify password is correct
- Check Netlify function logs for error messages
- Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

**Environment variable errors:**
```
admin-session: Missing required env vars
```
Solution: Verify in Netlify dashboard → Site settings → Environment variables:
- `ADMIN_SESSION_SECRET` is set
- `SUPABASE_URL` is set
- `SUPABASE_SERVICE_ROLE_KEY` is set

**RPC errors:**
```
admin-session: Supabase RPC error
```
Solution:
- Check Supabase logs for RPC execution errors
- Verify pgcrypto extension is enabled: `create extension if not exists pgcrypto;`
- Ensure `verify_user_password` function exists in public schema

**Role validation fails:**
```
admin-session: User role not allowed
```
Solution: Check user role in database:
```sql
select username, role from app_users where username = 'dreinisch';
```
Ensure role is either `'admin'` or `'teacher'`.

### FAQ

**Q: Can I remove the `ADMIN_USER` and `ADMIN_PASS` environment variables?**  
A: Technically yes, but they are left in place to avoid removal constraints. They are no longer referenced in code after this migration.

**Q: What happens to existing v2 sessions?**  
A: They are automatically invalidated because the edge guard and functions now look for `rc_admin_session_v3` cookies. Users will need to log in again.

**Q: Can I change the session timeout?**  
A: Yes, set the `MAX_AGE_SECONDS` environment variable. Default is 300 seconds (5 minutes). Example: `MAX_AGE_SECONDS=600` for 10 minutes.

**Q: Can substitute users log in to admin area?**  
A: No, only users with role `'admin'` or `'teacher'` are allowed. Substitute users have role `'substitute'` and will be rejected.

**Q: How do I rotate admin passwords?**  
A: Run the `set_user_password` RPC again with the new password:
```sql
select set_user_password('dreinisch', 'NewSecurePassword!', 'admin', null);
```

**Q: Can I have multiple admin users?**  
A: Yes, create as many as needed using `set_user_password` with role `'admin'`.

## Summary

This migration modernizes admin authentication to use Supabase's secure, role-based system. It eliminates false exposed-secret build failures and provides better security and manageability. The old environment variables remain in place but are no longer used by the code.
