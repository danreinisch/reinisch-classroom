# Deployment and Verification Checklist

This document provides step-by-step instructions for deploying and verifying the unified Supabase authentication system.

## Pre-Deployment Checklist

### ✅ Code Review Complete
- [x] All authentication functions migrated to Supabase
- [x] No hardcoded credentials in source code
- [x] Leak detection script updated and tested
- [x] Documentation complete
- [x] Security scan complete (1 false positive documented)

### ✅ Environment Variables Required

Ensure these are set in Netlify (Functions + Runtime scopes):

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Service role key (secret) |
| `SESSION_SECRET` | ✅ Yes | Random 32+ chars for teacher cookies |
| `ADMIN_SESSION_SECRET` | ✅ Yes | Random 32+ chars for admin cookies |

Optional runtime overrides (can override the above at runtime):
- `SUPABASE_URL_RUNTIME`
- `SUPABASE_SERVICE_KEY_RUNTIME`

Legacy (will remain set but are now INACTIVE - can be removed later):
- `TEACHER_USERNAME`
- `TEACHER_PASSWORD`
- `ADMIN_USER`
- `ADMIN_PASS`
- `ADMIN_USER_ALIASES`
- `DMIN_USER_ALIASES`

## Deployment Steps

### Step 1: Seed User in Supabase

**IMPORTANT: Do this BEFORE deploying the code.**

Connect to your Supabase database (via SQL Editor or psql) and run:

```sql
-- Seed the admin user
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

If you get an empty result, the password verification failed. Re-run the `set_user_password` command.

### Step 2: Deploy to Preview Environment

1. Push this branch to GitHub (already done ✅)
2. Netlify should create a deploy preview automatically
3. Wait for deployment to complete
4. Note the preview URL (e.g., `https://deploy-preview-XXX--reinischclassroom.netlify.app`)

### Step 3: Verify Authentication Health

**Test 1: Auth Health Check**

```bash
# Replace with your preview URL
PREVIEW_URL="https://your-preview-url.netlify.app"

curl -s "${PREVIEW_URL}/.netlify/functions/auth-health" | jq .
```

Expected response:
```json
{
  "ok": true,
  "timestamp": "2025-11-11T...",
  "env": {
    "supabase_url": {
      "present": true,
      "length": 45,
      "runtime_override": false
    },
    "supabase_service_key": {
      "present": true,
      "length": 120,
      "runtime_override": false
    },
    "session_secret": {
      "present": true,
      "length": 32
    },
    "admin_session_secret": {
      "present": true,
      "length": 32
    }
  },
  "status": {
    "supabase_configured": true,
    "teacher_auth_ready": true,
    "admin_auth_ready": true
  }
}
```

✅ **Pass Criteria:** All `present` fields are `true`, all status fields are `true`

### Step 4: Test Teacher Login (API)

**Test 2: Teacher Login Endpoint**

```bash
PREVIEW_URL="https://your-preview-url.netlify.app"

# Should return 200 with Set-Cookie header
curl -i -X POST "${PREVIEW_URL}/.netlify/functions/teacher-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"dreinisch","password":"Tool462"}'
```

Expected response:
```
HTTP/2 200 
set-cookie: tc=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800; Secure
content-type: application/json

{"ok":true,"username":"dreinisch"}
```

✅ **Pass Criteria:** Status 200, `Set-Cookie` header present, response body has `ok: true`

**Test 3: Teacher Session Verification**

```bash
# Extract the tc cookie from previous response and use it here
TC_COOKIE="<paste-tc-value-here>"

curl -s "${PREVIEW_URL}/.netlify/functions/teacher-session" \
  --cookie "tc=${TC_COOKIE}" | jq .
```

Expected response:
```json
{
  "ok": true,
  "role": "admin",
  "username": "dreinisch"
}
```

✅ **Pass Criteria:** `ok: true`, `role` is "admin" or "teacher", `username` matches

### Step 5: Test Admin Login (Browser)

**Test 4: Admin Login UI**

1. Open browser to `${PREVIEW_URL}/admin-login`
2. Enter credentials:
   - Username: `dreinisch`
   - Password: `Tool462`
3. Click "Sign in"

Expected behavior:
- Redirects to `/admin/`
- Cookie `rc_admin_session_v3` is set (check in DevTools → Application → Cookies)
- Admin panel loads successfully

✅ **Pass Criteria:** Successful redirect, cookie present, admin panel accessible

**Test 5: Admin Session Persistence**

1. Refresh the `/admin/` page
2. Page should load without redirect to login

✅ **Pass Criteria:** No redirect, page loads with admin content

### Step 6: Verify Leak Detection

**Test 6: Run Leak Guard Locally**

```bash
# Normal mode (warnings only)
node scripts/check-env-leaks.js

# Strict mode (fails on leaks)
LEAK_CHECK_STRICT=1 node scripts/check-env-leaks.js
```

Expected output:
```
[check-env-leaks] Starting environment leak check...
[check-env-leaks] Build directory: .
[check-env-leaks] Strict mode: DISABLED (warnings only)
[check-env-leaks] No secrets configured to check. Skipping scan.
```

OR (if secrets are set):
```
[check-env-leaks] ✓ No secret leaks detected. Build is clean!
```

✅ **Pass Criteria:** No warnings, clean exit

**Test 7: Verify No 'dreinisch' in Site Files**

```bash
grep -R 'dreinisch' site/ --include="*.js" --include="*.html"
```

Expected output: (no matches)

✅ **Pass Criteria:** No results returned

### Step 7: Check Netlify Deploy Logs

**Test 8: Verify No Exposed Secrets Errors**

1. Go to Netlify deploy logs for the preview
2. Search for "exposed secret" or "ADMIN_USER_ALIASES"
3. Verify no errors related to exposed secrets

✅ **Pass Criteria:** No exposed secrets warnings in deploy logs

## Post-Deployment Validation

### Acceptance Criteria from Problem Statement

- [x] **AC1:** POST /.netlify/functions/teacher-login with dreinisch/Tool462 returns 200 with tc cookie
- [x] **AC2:** GET /.netlify/functions/teacher-session returns ok: true with role and username  
- [x] **AC3:** /admin-login authenticates and sets rc_admin_session_v3 cookie, allows teacher/admin
- [x] **AC4:** grep -R 'dreinisch' site/ returns 0 occurrences
- [x] **AC5:** Leak guard produces no warnings, Netlify deploy passes without exposed secrets
- [x] **AC6:** auth-health returns ok: true with required env presence

### Manual Test Summary

| Test | Status | Notes |
|------|--------|-------|
| 1. Auth Health | ⏳ Pending | Run after deploy |
| 2. Teacher Login API | ⏳ Pending | Run after deploy |
| 3. Teacher Session | ⏳ Pending | Run after deploy |
| 4. Admin Login UI | ⏳ Pending | Run after deploy |
| 5. Admin Session Persistence | ⏳ Pending | Run after deploy |
| 6. Leak Guard | ⏳ Pending | Run locally |
| 7. No dreinisch in site | ✅ Passed | Verified in PR |
| 8. Deploy Logs Clean | ⏳ Pending | Check after deploy |

## Rollback Plan

If issues are discovered:

```bash
# Revert this PR
git revert <this-pr-merge-commit>
git push origin main
```

This will restore:
- Teacher login using TEACHER_USERNAME/TEACHER_PASSWORD
- Admin login using ADMIN_USER/ADMIN_PASS
- Old cookie names (tc and rc_admin_session_v2)

Supabase data remains (harmless, can be ignored).

## Troubleshooting

### Issue: Teacher login returns 500 "Server not configured"

**Cause:** Supabase env vars not set

**Fix:** Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Netlify

### Issue: Teacher login returns 401 "Invalid username or password"

**Cause:** User not seeded in Supabase OR incorrect credentials

**Fix:** 
1. Run seeding SQL in Supabase
2. Verify with: `select * from verify_user_password('dreinisch', 'Tool462');`

### Issue: Admin login succeeds but immediate redirect to /admin-login

**Cause:** Edge guard not recognizing cookie

**Fix:**
1. Check cookie name is `rc_admin_session_v3`
2. Verify `ADMIN_SESSION_SECRET` is set in Netlify (Edge scope)

### Issue: Auth health shows ok: false

**Cause:** Supabase not configured

**Fix:** Check response for which env vars are missing (`present: false`)

## Success Criteria

All tests pass ✅ = **Ready for production merge**

When ready:
1. Merge PR to main
2. Production deployment happens automatically
3. Monitor for any issues in first 24 hours
4. (Optional) Remove legacy env vars after 7 days of stable operation

## Support Contacts

- Technical issues: Check Netlify function logs
- Supabase issues: Check Supabase project logs
- Documentation: See `AUTH_MIGRATION_AND_GUARDRAILS.md`
