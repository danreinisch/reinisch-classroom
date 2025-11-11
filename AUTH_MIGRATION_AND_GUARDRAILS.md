# Auth Migration and Guardrails

## Overview

This document describes the unified authentication system for Teacher and Admin access using Supabase, along with security guardrails and deployment best practices.

## Migration Summary

### Before
- **Teacher Login**: Used `TEACHER_USERNAME` and `TEACHER_PASSWORD` environment variables
- **Admin Login**: Used `ADMIN_USER` and `ADMIN_PASS` environment variables
- **Issues**: 
  - Multiple credential sources
  - Environment variable leaks in deployment scans
  - No unified user management

### After
- **Unified Authentication**: Both Teacher and Admin use Supabase `app_users` table
- **Single Source of Truth**: All credentials stored securely in Supabase with bcrypt hashing
- **Role-Based Access**: Users have roles (teacher, admin) verified via RPC
- **Improved Security**: Throttling, health checks, leak detection

## Architecture

### Components

1. **Supabase app_users Table**
   - Stores users with bcrypt-hashed passwords
   - Roles: student, teacher, substitute, admin
   - Migration: `supabase/migrations/20251105_app_users_and_sub_plans.sql`

2. **RPC Functions**
   - `verify_user_password(username, password)`: Authenticates and returns user info
   - `set_user_password(username, password, role, student_id)`: Creates/updates users

3. **Authentication Endpoints**
   - `/.netlify/functions/teacher-login`: POST with {username, password}
   - `/.netlify/functions/teacher-session`: GET to verify session
   - `/.netlify/functions/admin-session`: POST form for admin login
   - `/.netlify/functions/admin-session-check`: GET to verify admin session

4. **Edge Guard**
   - `netlify/edge-functions/admin-auth-guard.js`: Protects /admin/* routes

5. **Health Check**
   - `/.netlify/functions/auth-health`: Returns env configuration status

## Seeding Users

### Production Seeding

Connect to your Supabase database and run:

```sql
-- Seed admin user (dreinisch / Tool462)
select set_user_password('dreinisch', 'Tool462', 'admin', null);

-- Verify it worked
select * from verify_user_password('dreinisch', 'Tool462');
```

Expected output:
```
 username  | role  | student_id | user_id
-----------+-------+------------+---------
 dreinisch | admin |       null |       1
```

### Additional Users

```sql
-- Add a teacher
select set_user_password('teacher_username', 'SecurePass123!', 'teacher', null);

-- Add a substitute
select set_user_password('substitute', 'SubPass456!', 'substitute', null);

-- Add a student (linked to student record)
select set_user_password('S001', 'StudentPass!', 'student', 123);
```

## Environment Variables

### Required for Supabase Auth

| Variable | Scope | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | Functions, Runtime | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions, Runtime | Service role key (secret) |
| `SESSION_SECRET` | Functions | Secret for signing teacher session cookies |
| `ADMIN_SESSION_SECRET` | Functions, Edge | Secret for signing admin session cookies |

### Runtime Overrides (Optional)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL_RUNTIME` | Override `SUPABASE_URL` at runtime |
| `SUPABASE_SERVICE_KEY_RUNTIME` | Override `SUPABASE_SERVICE_ROLE_KEY` at runtime |

These allow switching Supabase instances without redeploying.

### Legacy Variables (Inactive)

These are **no longer used** but may remain set in Netlify for backwards compatibility:
- `TEACHER_USERNAME`
- `TEACHER_PASSWORD`
- `ADMIN_USER`
- `ADMIN_PASS`
- `ADMIN_USER_ALIASES`
- `DMIN_USER_ALIASES` (typo variant)

**Note**: The leak guard script monitors for these in published files to prevent accidental exposure.

## Guardrails

### 1. Throttling

Teacher login implements simple per-IP throttling:
- Failed login attempts set a 60-second throttle cookie
- Subsequent attempts within the window return 429 (Too Many Requests)
- Helps mitigate brute force attacks

### 2. Health Diagnostics

Check auth configuration health:

```bash
curl https://yoursite.com/.netlify/functions/auth-health
```

Returns:
```json
{
  "ok": true,
  "env": {
    "supabase_url": { "present": true, "length": 45, "runtime_override": false },
    "supabase_service_key": { "present": true, "length": 120, "runtime_override": false },
    "session_secret": { "present": true, "length": 32 },
    "admin_session_secret": { "present": true, "length": 32 }
  },
  "status": {
    "supabase_configured": true,
    "teacher_auth_ready": true,
    "admin_auth_ready": true
  }
}
```

### 3. Leak Guard

Script: `scripts/check-env-leaks.js`

Scans build output for accidentally included secrets.

**Usage (Normal Mode - Warnings Only):**
```bash
node scripts/check-env-leaks.js
```

**Usage (Strict Mode - Fails on Leaks):**
```bash
LEAK_CHECK_STRICT=1 node scripts/check-env-leaks.js
```

Automatically runs as postbuild step (see `package.json`).

## Cookie Strategy

### Teacher Cookie: `tc`
- Set by: `/.netlify/functions/teacher-login`
- Duration: 8 hours
- Payload: `{ role: 'teacher'|'admin', username: '...' }`
- Verified by: `/.netlify/functions/teacher-session`

### Admin Cookie: `rc_admin_session_v3`
- Set by: `/.netlify/functions/admin-session`
- Duration: 8 hours (configurable via `MAX_AGE_SECONDS`)
- Payload: `{ u: '...', role: '...', exp: ..., n: '...' }`
- Verified by: Edge guard and `/.netlify/functions/admin-session-check`

**Legacy cookies** (v2, v1) are still recognized for backwards compatibility.

## Manual Testing

### 1. Seed User in Supabase

```sql
select set_user_password('dreinisch', 'Tool462', 'admin', null);
```

### 2. Test Teacher Login

```bash
curl -i -X POST https://reinischclassroom.com/.netlify/functions/teacher-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"dreinisch","password":"Tool462"}'
```

Expected: `200 OK` with `Set-Cookie: tc=...`

### 3. Test Teacher Session

```bash
curl -i https://reinischclassroom.com/.netlify/functions/teacher-session \
  --cookie "tc=<token_from_step_2>"
```

Expected: `{"ok":true,"role":"admin","username":"dreinisch"}`

### 4. Test Admin Login

Visit: `https://reinischclassroom.com/admin-login`
- Username: `dreinisch`
- Password: `Tool462`

Expected: Redirect to `/admin/` with `rc_admin_session_v3` cookie set

### 5. Test Leak Guard

```bash
# Should pass with no warnings
node scripts/check-env-leaks.js

# Should still pass (strict mode)
LEAK_CHECK_STRICT=1 node scripts/check-env-leaks.js
```

### 6. Test Auth Health

```bash
curl https://reinischclassroom.com/.netlify/functions/auth-health
```

Expected: `{"ok":true, ...}`

## Verification Checklist

- [ ] POST `/teacher-login` with dreinisch/Tool462 returns 200
- [ ] GET `/teacher-session` returns `ok: true` with role and username
- [ ] Admin login at `/admin-login` succeeds and redirects to `/admin/`
- [ ] Edge guard allows access to `/admin/` with valid cookie
- [ ] `grep -R 'dreinisch' site/` returns 0 results (excluding docs)
- [ ] Leak guard produces no warnings on clean build
- [ ] Netlify deploy passes without exposed secrets failure
- [ ] Auth health endpoint returns `ok: true`

## Rollback Plan

### Quick Rollback

If issues arise, revert this PR to restore previous env-based authentication:

```bash
git revert <this-pr-commit>
```

### What Gets Restored
- Teacher login uses `TEACHER_USERNAME` / `TEACHER_PASSWORD`
- Admin login uses `ADMIN_USER` / `ADMIN_PASS`
- Cookies: `tc` and `rc_admin_session_v2` revert to old logic

### What Remains
- Supabase `app_users` table (harmless, can be ignored)
- Users seeded in Supabase (no impact on reverted system)

## Security Considerations

### ✅ Improvements
- Single credential store (Supabase) reduces drift
- Bcrypt password hashing (not plaintext)
- Throttling mitigates brute force attempts
- Leak guard prevents accidental secret exposure
- Role-based access control
- Detailed health diagnostics

### ⚠️ Limitations
- No MFA (multi-factor authentication) yet
- No password reset flow
- No account lockout after repeated failures
- Throttling is IP-based (can be bypassed with proxies)

### 🔒 Best Practices
- Use strong, unique passwords
- Rotate `SESSION_SECRET` and `ADMIN_SESSION_SECRET` periodically
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret and never commit to source
- Monitor Supabase audit logs for suspicious activity
- Use HTTPS for all production traffic

## Non-Goals

These are explicitly **out of scope** for this migration:

- ❌ MFA or OTP authentication
- ❌ Password reset/forgot password flows
- ❌ Self-service user registration
- ❌ Removing legacy env vars from Netlify (done later after confidence)
- ❌ Account lockout policies
- ❌ Session refresh tokens

## Support

For issues or questions:
1. Check auth health: `curl /.netlify/functions/auth-health`
2. Review logs in Netlify function logs
3. Check Supabase logs for RPC call failures
4. Verify environment variables are set correctly

## References

- Supabase Migration: `supabase/migrations/20251105_app_users_and_sub_plans.sql`
- Teacher Login: `netlify/functions/teacher-login.js`
- Admin Session: `netlify/functions/admin-session.js`
- Edge Guard: `netlify/edge-functions/admin-auth-guard.js`
- Leak Guard: `scripts/check-env-leaks.js`
