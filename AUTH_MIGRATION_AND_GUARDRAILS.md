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

## Netlify Runtime & Config Fix

### Problem
PR #181 encountered Netlify Deploy Preview failures with two related issues:

1. **Config Parse Error**: Duplicate `[build.environment]` table definitions in `netlify.toml` caused Netlify to reject the configuration with error: `Can't redefine existing key at row 7, col 19...`

2. **502 Bad Gateway Errors**: Teacher login endpoint returned 502 responses due to `ReferenceError: fetch is not defined` when running on Node.js versions older than 18 where native `fetch` is unavailable.

### Root Cause
- **Configuration**: The `netlify.toml` file lacked explicit Node.js runtime version pinning, allowing Netlify to use older runtimes (Node 14/16) that don't include native `fetch`.
- **Fetch Dependency**: Code in `netlify/functions/_lib/supa.js` relies on the global `fetch` API without polyfill, causing runtime errors in older Node environments.

### Resolution Steps

#### 1. Fix netlify.toml Configuration
Updated `netlify.toml` to pin the Lambda runtime to Node 18:

```toml
[build]
  publish = "."
  command = "node scripts/check-env-leaks.js || true"
  functions = "netlify/functions"

[build.environment]
  AWS_LAMBDA_JS_RUNTIME = "nodejs18.x"

[functions]
  node_bundler = "esbuild"
```

**Key changes:**
- Added `[build.environment]` section with `AWS_LAMBDA_JS_RUNTIME = "nodejs18.x"`
- Ensures all functions run on Node 18+ where native `fetch` is available
- Single, non-duplicate environment section

#### 2. Rely on Native Node 18 Fetch
No code changes needed - existing code already uses native `fetch`:
- `netlify/functions/_lib/supa.js` uses global `fetch` directly
- No polyfill required with Node 18+
- Added clarifying comment documenting Node 18+ requirement

#### 3. Enhanced Error Logging
Improved diagnostic logging for RPC failures:

**teacher-login.js:**
```javascript
if (!verifyRes.ok) {
  console.error('[teacher-login] Supabase RPC error - status:', verifyRes.status);
  return { statusCode: 500, ... };
}
```

**admin-session.js:**
```javascript
if (!verifyRes.ok) {
  console.error('[admin-session] Supabase RPC error - status:', verifyRes.status);
  return redirect('/admin-login?e=1');
}
```

Logs now include:
- RPC HTTP status codes (400, 404, 500, etc.)
- Distinguishes between configuration errors (500), RPC failures (500), invalid credentials (401), and throttling (429)
- No sensitive data (passwords, tokens) logged

#### 4. Runtime Version Diagnostics
Added `runtime_node_version` field to auth health check:

```bash
curl https://yoursite.com/.netlify/functions/auth-health
```

Returns:
```json
{
  "ok": true,
  "timestamp": "2025-11-12T01:42:00.000Z",
  "runtime_node_version": "v18.19.0",
  "env": { ... },
  "status": { ... }
}
```

This allows immediate verification of runtime version in deployment previews.

### Verification
After deploying with the fix:

1. **Config Parse**: Deploy preview builds successfully without TOML errors
2. **Runtime Version**: `curl /.netlify/functions/auth-health | jq .runtime_node_version` shows `v18.x.x`
3. **No 502 Errors**: `POST /.netlify/functions/teacher-login` returns 200 (valid creds) or 401 (invalid), never 502
4. **Logs Clean**: Function logs show no `ReferenceError: fetch is not defined` errors
5. **Status Codes**: Logs include `[teacher-login] Supabase RPC error - status: 400` on failures

### Troubleshooting

**Symptom**: 502 Bad Gateway on teacher-login  
**Check**: `curl /.netlify/functions/auth-health | jq .runtime_node_version`  
**Fix**: Ensure `netlify.toml` has `AWS_LAMBDA_JS_RUNTIME = "nodejs18.x"`

**Symptom**: `ReferenceError: fetch is not defined`  
**Check**: Netlify function logs  
**Fix**: Clear build cache, redeploy with Node 18 pinned

**Symptom**: Config parse error on deploy  
**Check**: `netlify.toml` for duplicate `[build.environment]` sections  
**Fix**: Consolidate into single `[build.environment]` block

**Symptom**: `Runtime.HandlerNotFound: teacher-login.handler is undefined or not exported`  
**Check**: Netlify function logs, module system configuration  
**Fix**: Ensure `netlify/functions/package.json` exists with `{"type": "commonjs"}`

#### Netlify Functions Module System

**Problem:**  
The repository root defines `"type": "module"` in `package.json`, which tells Node.js to treat `.js` files as ES modules by default. However, Netlify Functions under `netlify/functions/` are authored using CommonJS syntax (`require()`, `exports.handler = ...`).

When Netlify builds and deploys functions, it may treat `.js` files as ESM if the nearest `package.json` declares `"type": "module"`. Under ESM, `exports` is not available, which can result in the handler function not being exported properly, leading to `Runtime.HandlerNotFound` errors.

**Solution:**  
Add a `netlify/functions/package.json` file with `{"type": "commonjs"}` to explicitly mark all `.js` files in the functions directory (and its subdirectories like `_lib/`) as CommonJS modules. This overrides the root package.json setting for the functions directory only.

**File:** `netlify/functions/package.json`
```json
{
  "type": "commonjs"
}
```

This ensures that:
- Functions can use `require()` and `exports.handler` syntax
- The handler is properly exported at runtime
- No code changes are needed to the function files themselves

**Verification:**  
After deploying with this fix, the cold-start logs for `teacher-login` should show:
```
[teacher-login] Module loaded successfully
```

This confirms the module loads correctly and the handler is available.

### Related Files
- `netlify.toml` - Runtime configuration
- `netlify/functions/_lib/supa.js` - Uses native fetch
- `netlify/functions/auth-health.js` - Runtime version diagnostics
- `netlify/functions/teacher-login.js` - Enhanced logging
- `netlify/functions/admin-session.js` - Enhanced logging

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
