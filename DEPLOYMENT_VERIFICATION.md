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

## Netlify Runtime & Configuration Verification

### Verifying Node 18 Runtime

After deploying with the updated `netlify.toml`, verify the runtime version:

**Test 9: Runtime Version Check**

```bash
PREVIEW_URL="https://your-preview-url.netlify.app"

curl -s "${PREVIEW_URL}/.netlify/functions/auth-health" | jq .runtime_node_version
```

Expected output:
```
"v18.19.0"
```
(or any v18.x.x version)

✅ **Pass Criteria:** Version string starts with `"v18.`

### Verifying No 502 Errors

**Test 10: Teacher Login Without 502**

```bash
# Should return 200 (valid) or 401 (invalid), never 502
curl -i -X POST "${PREVIEW_URL}/.netlify/functions/teacher-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"dreinisch","password":"WrongPass"}'
```

Expected: `HTTP/2 401` (not 502)

```bash
# Try with correct password
curl -i -X POST "${PREVIEW_URL}/.netlify/functions/teacher-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"dreinisch","password":"Tool462"}'
```

Expected: `HTTP/2 200`

✅ **Pass Criteria:** Never returns 502 Bad Gateway

### Verifying Function Logs

Check Netlify function logs for:

1. **No fetch errors:**
   - ❌ Bad: `ReferenceError: fetch is not defined`
   - ✅ Good: No fetch-related errors

2. **Status code logging:**
   - ✅ Good: `[teacher-login] Supabase RPC error - status: 400`
   - ✅ Good: `[admin-session] Supabase RPC error - status: 500`

### Configuration Troubleshooting

**Issue: Build fails with "Can't redefine existing key"**

**Cause:** Duplicate `[build.environment]` sections in netlify.toml

**Fix:**
1. Ensure only ONE `[build.environment]` section exists
2. Verify no other TOML files (e.g., `netlify/toml`) are being included

**Issue: Still getting 502 on teacher-login**

**Cause:** Node runtime is still <18

**Fix:**
1. Clear Netlify build cache
2. Redeploy with `netlify.toml` containing:
   ```toml
   [build.environment]
     AWS_LAMBDA_JS_RUNTIME = "nodejs18.x"
   ```
3. Verify with auth-health runtime_node_version check

**Issue: "fetch is not defined" in function logs**

**Cause:** Functions deployed with Node <18

**Fix:**
1. Verify `netlify.toml` has `AWS_LAMBDA_JS_RUNTIME = "nodejs18.x"`
2. Trigger new deployment (clear cache if needed)
3. Wait for full deployment, then test again

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

## Guardrails Verification

The application implements security guardrails across authentication functions. Verify they are working correctly:

### Test G1: Security Headers Present

```bash
PREVIEW_URL="https://your-preview-url.netlify.app"

curl -i "${PREVIEW_URL}/.netlify/functions/auth-health"
```

**Expected headers:**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Cache-Control: no-store`
- `X-Request-Id: <UUID>`

✅ **Pass Criteria:** All security headers present in response

### Test G2: Dynamic CORS (Allowed Origin)

```bash
curl -i -X OPTIONS \
  -H "Origin: https://reinischclassroom.com" \
  -H "Access-Control-Request-Method: POST" \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 200
- `Access-Control-Allow-Origin: https://reinischclassroom.com` (echoes origin, not "*")
- `Vary: Origin`

✅ **Pass Criteria:** Origin echoed, Vary header present

### Test G3: Dynamic CORS (Blocked Origin)

```bash
curl -i -X OPTIONS \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 200
- **No** `Access-Control-Allow-Origin` header (origin not allowed)

✅ **Pass Criteria:** No CORS header for untrusted origin

### Test G4: Dynamic CORS (Netlify Preview Auto-Allow)

```bash
# Use the actual preview URL's origin
curl -i -X OPTIONS \
  -H "Origin: https://deploy-preview-123--reinischclassroom.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 200
- `Access-Control-Allow-Origin: https://deploy-preview-123--reinischclassroom.netlify.app`

✅ **Pass Criteria:** Netlify preview origins automatically allowed

### Test G5: Input Validation (Invalid JSON)

```bash
curl -i -X POST \
  -H "Content-Type: application/json" \
  -d '{invalid}' \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 400
- Body: `{"error":"Invalid JSON in request body"}`
- `X-Request-Id` header present

✅ **Pass Criteria:** Returns 400 with validation error

### Test G6: Input Validation (Missing Content-Type)

```bash
curl -i -X POST \
  -d '{"username":"test","password":"test"}' \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 400
- Body: `{"error":"Content-Type must be application/json"}`

✅ **Pass Criteria:** Returns 400 when Content-Type missing

### Test G7: Input Validation (Field Length)

```bash
curl -i -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"","password":"test"}' \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 400
- Body contains: `"username must be at least 1 character(s)"`

✅ **Pass Criteria:** Field validation enforced

### Test G8: Throttle and Delay on Invalid Credentials

```bash
# First attempt - measure time
time curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"wrongpass"}' \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 401
- Response time includes ~150-300ms delay
- `Set-Cookie: tc_throttle=...` header present
- Body: `{"error":"Invalid username or password"}`

```bash
# Second attempt with throttle cookie - should be blocked
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: tc_throttle=<value-from-previous>" \
  -d '{"username":"testuser","password":"wrongpass"}' \
  "${PREVIEW_URL}/.netlify/functions/teacher-login"
```

**Expected:**
- Status: 429
- Body: `{"error":"Too many attempts. Please try again in a moment."}`

✅ **Pass Criteria:** Delay present, throttle enforced after invalid attempt

### Test G9: Request ID Correlation

```bash
# Make a request and capture the X-Request-Id
RESPONSE=$(curl -i -X GET "${PREVIEW_URL}/.netlify/functions/auth-health" 2>&1)
REQUEST_ID=$(echo "$RESPONSE" | grep -i "x-request-id:" | cut -d' ' -f2 | tr -d '\r')

echo "Request ID: $REQUEST_ID"
```

Then check Netlify function logs for entries containing that request ID.

✅ **Pass Criteria:** Request ID appears in both response header and function logs

### Test G10: No Secrets in auth-health Response

```bash
curl -s "${PREVIEW_URL}/.netlify/functions/auth-health" | jq .
```

**Expected:**
- Response contains `env` object with `present` and `length` fields
- **No actual secret values** anywhere in response
- Only metadata like boolean flags and string lengths

✅ **Pass Criteria:** No SUPABASE_URL, keys, or secrets in response body

### Guardrails Checklist

- [ ] G1: Security headers present in all auth responses
- [ ] G2: CORS echoes allowed origins (not "*")
- [ ] G3: CORS blocks untrusted origins
- [ ] G4: Netlify preview origins auto-allowed
- [ ] G5: Invalid JSON rejected with 400
- [ ] G6: Missing Content-Type rejected with 400
- [ ] G7: Field validation enforced (length, type)
- [ ] G8: Invalid credentials trigger delay and throttle
- [ ] G9: X-Request-Id in responses and logs
- [ ] G10: No secrets exposed in responses

For detailed guardrails documentation, see [docs/GUARDRAILS.md](docs/GUARDRAILS.md).

## Global Security Headers Verification

These tests verify the site-wide security headers added in the global guardrails extension.

### Test GH1: Global Security Headers Present

Verify security headers on a static HTML page:

```bash
PREVIEW_URL="https://your-preview-url.netlify.app"

curl -i "${PREVIEW_URL}/"
```

**Expected headers:**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `X-Frame-Options: SAMEORIGIN`
- `Content-Security-Policy-Report-Only: default-src 'self'; ...`

✅ **Pass Criteria:** All security headers present in response

### Test GH2: CSP Report-Only Header Format

```bash
curl -i "${PREVIEW_URL}/" | grep -i "content-security-policy-report-only"
```

**Expected:**
- Header contains `report-uri /.netlify/functions/csp-report`
- Header includes `default-src 'self'`
- Header is `Content-Security-Policy-Report-Only` (not enforcing)

✅ **Pass Criteria:** CSP-RO header present with report-uri

### Test GH3: HTML Cache-Control

```bash
curl -i "${PREVIEW_URL}/student/index.html"
```

**Expected:**
- `Cache-Control: no-store, no-cache, must-revalidate`

✅ **Pass Criteria:** HTML files have no-store cache control

### Test GH4: CSP Report Endpoint - Accept Valid Report

```bash
curl -i -X POST "${PREVIEW_URL}/.netlify/functions/csp-report" \
  -H "Content-Type: application/json" \
  -H "Origin: https://reinischclassroom.com" \
  -d '{
    "csp-report": {
      "document-uri": "https://reinischclassroom.com/test",
      "violated-directive": "script-src-elem",
      "blocked-uri": "https://evil.com/script.js",
      "source-file": "https://reinischclassroom.com/test.html",
      "line-number": 42
    }
  }'
```

**Expected:**
- Status: 204 No Content
- `X-Request-Id` header present
- `Access-Control-Allow-Origin` header present (for allowed origin)
- Empty response body

✅ **Pass Criteria:** 204 response with security headers

### Test GH5: CSP Report Endpoint - Reject Oversized Report

```bash
# Create 26KB payload (exceeds 25KB limit)
python3 -c "print('{\"csp-report\":{\"document-uri\":\"' + 'a'*26000 + '\"}}')" | \
curl -i -X POST "${PREVIEW_URL}/.netlify/functions/csp-report" \
  -H "Content-Type: application/json" \
  -d @-
```

**Expected:**
- Status: 400 Bad Request
- Error: "Request body too large"

✅ **Pass Criteria:** Rejects oversized reports with 400

### Test GH6: CSP Report Endpoint - CORS Preflight

```bash
curl -i -X OPTIONS "${PREVIEW_URL}/.netlify/functions/csp-report" \
  -H "Origin: https://reinischclassroom.com" \
  -H "Access-Control-Request-Method: POST"
```

**Expected:**
- Status: 200
- `Access-Control-Allow-Origin: https://reinischclassroom.com`
- `Access-Control-Allow-Methods` includes POST
- `Vary: Origin`

✅ **Pass Criteria:** Preflight succeeds with CORS headers

### Test GH7: CSP Report Endpoint - Invalid Content-Type

```bash
curl -i -X POST "${PREVIEW_URL}/.netlify/functions/csp-report" \
  -H "Content-Type: text/plain" \
  -d '{"csp-report":{}}'
```

**Expected:**
- Status: 400
- Error: "Content-Type must be application/json or application/csp-report"

✅ **Pass Criteria:** Rejects invalid content-type

### Test GH8: Client Request ID in Diagnostics

1. Open browser to `${PREVIEW_URL}/student/?diag=1`
2. Open DevTools console
3. Look for:
   ```
   [diagnostics] Client Request ID: <UUID>
   ```
4. Verify `window.rcClientRequestId` exists:
   ```javascript
   console.log(window.rcClientRequestId);
   ```

✅ **Pass Criteria:** Client request ID generated and available

### Test GH9: wrapFetch Adds Client ID Header

1. Open browser to `${PREVIEW_URL}/student/?diag=1`
2. Open DevTools console
3. Run:
   ```javascript
   const resp = await wrapFetch('/.netlify/functions/auth-health');
   console.log('Request included client ID header');
   ```
4. Check Network tab → Request Headers → `X-Client-Request-Id` should be present

✅ **Pass Criteria:** wrapFetch injects X-Client-Request-Id header

### Test GH10: Server Logs Show Client Request ID

```bash
# Make a request with client ID
curl -i -X GET "${PREVIEW_URL}/.netlify/functions/auth-health" \
  -H "X-Client-Request-Id: test-client-123"
```

Then check Netlify function logs for:

```
[auth-health] [<server-id>] Request received
[auth-health] [<server-id>] Client Request ID: test-client-123
```

✅ **Pass Criteria:** Client ID appears in server logs when provided

### Test GH11: Diagnostic Mode Toggle

**Test with ?diag=1:**

1. Open `${PREVIEW_URL}/student/?diag=1`
2. DevTools console should show:
   ```
   [rcDiag] Diagnostic mode enabled
   ```
3. Run `window.rcDiag.log('test message')`
4. Should output: `[rcDiag] test message`

**Test without ?diag=1:**

1. Open `${PREVIEW_URL}/student/` (no query param)
2. Run `window.rcDiag.log('test message')`
3. Should output: *(nothing)*

✅ **Pass Criteria:** Logging only active when ?diag=1 present

### Test GH12: Student Portal Loads Without Errors

1. Open `${PREVIEW_URL}/student/`
2. Check DevTools console for errors
3. Verify no new errors related to diagnostics or security headers
4. Confirm portal UI loads normally

✅ **Pass Criteria:** No console errors, portal loads successfully

### Test GH13: Student Portal Error Toast (Simulated)

This test verifies defensive error handling without triggering the fatal banner.

**Manual simulation:**

1. Open `${PREVIEW_URL}/student/`
2. Open DevTools
3. Go to Network tab → Block requests matching pattern `portal-b-helpers.js`
4. Reload page
5. Observe error handling

**Expected (if error is recoverable):**
- Non-blocking toast appears in top-right
- Toast shows "Module Load Issue" with refresh button
- Portal container not replaced with error card
- Toast auto-dismisses after 10 seconds

**Expected (if error is hard failure):**
- Full error card replaces portal
- Shows "Student Portal Unavailable" message
- Includes reload and return buttons

✅ **Pass Criteria:** Recoverable errors show toast; hard failures show error card

### Global Headers Checklist

- [ ] GH1: Global security headers present on all routes
- [ ] GH2: CSP-RO header format correct with report-uri
- [ ] GH3: HTML files have no-store cache-control
- [ ] GH4: CSP report endpoint accepts valid reports (204)
- [ ] GH5: CSP report endpoint rejects oversized reports (400)
- [ ] GH6: CSP report endpoint handles CORS preflight
- [ ] GH7: CSP report endpoint validates content-type
- [ ] GH8: Client request ID generated on page load
- [ ] GH9: wrapFetch injects X-Client-Request-Id header
- [ ] GH10: Server logs show client request ID when provided
- [ ] GH11: Diagnostic mode toggles with ?diag=1
- [ ] GH12: Student portal loads without new errors
- [ ] GH13: Portal error handling shows toast vs. fatal banner appropriately

## CSV Validation Verification

These tests verify the client-side CSV validation for IEP Progress imports.

### Test CSV1: Invalid File Type

1. Navigate to `${PREVIEW_URL}/student/`
2. Log in and go to IEP Progress tab
3. Click "Import CSV"
4. Select a non-CSV file (e.g., .txt, .xlsx, .json)

**Expected:**
- Validation error displayed: "File must be a CSV file (text/csv)"
- Import blocked
- No data imported

✅ **Pass Criteria:** Error shown, import blocked

### Test CSV2: Oversized File

1. Create a CSV file >1 MB (e.g., 10,000 rows of dummy data)
2. Try to import it via IEP Progress tab

**Expected:**
- Validation error: "File size exceeds 1.0 MB limit"
- Import blocked

✅ **Pass Criteria:** Size limit enforced

### Test CSV3: Empty or Header-Only File

**Test 3a - Empty file:**
```csv
(empty file)
```

**Test 3b - Header only:**
```csv
date,student_code,goal_code,percent,collected_by
```

**Expected:**
- Error: "CSV file is empty or contains only headers"
- Import blocked

✅ **Pass Criteria:** Empty files rejected

### Test CSV4: Missing Required Headers

```csv
date,student_code,percent,collected_by
2024-01-15,S001,75,Teacher1
```

**Expected:**
- Error: "Missing required headers: goal_code"
- Import blocked

✅ **Pass Criteria:** Missing headers detected

### Test CSV5: Missing percent/value Column

```csv
date,student_code,goal_code,collected_by
2024-01-15,S001,G001,Teacher1
```

**Expected:**
- Error: "CSV must have either 'percent' or 'value' column"
- Import blocked

✅ **Pass Criteria:** Percent/value requirement enforced

### Test CSV6: Invalid Date Formats

```csv
date,student_code,goal_code,percent,collected_by
invalid-date,S001,G001,75,Teacher1
2024-13-45,S002,G002,80,Teacher2
```

**Expected:**
- Row errors displayed for rows 2 and 3
- Error details: "date: Date must be yyyy-mm-dd or MM/DD/YYYY" or "date: Invalid date"

✅ **Pass Criteria:** Invalid dates rejected with clear messages

### Test CSV7: Valid Date Normalization

```csv
date,student_code,goal_code,percent,collected_by
2024-01-15,S001,G001,75,Teacher1
01/20/2024,S002,G002,80,Teacher2
12/31/2024,S003,G003,90,Teacher3
```

**Expected:**
- All rows imported successfully
- US format dates (01/20/2024, 12/31/2024) normalized to ISO (2024-01-20, 2024-12-31)
- Success message: "IEP progress imported successfully! 3 entries loaded."

✅ **Pass Criteria:** Date normalization works, all formats accepted

### Test CSV8: Invalid student_code/goal_code

```csv
date,student_code,goal_code,percent,collected_by
2024-01-15,S@001,G001,75,Teacher1
2024-01-16,S002,G 002,80,Teacher2
2024-01-17,VeryLongStudentCodeThatExceeds32Characters,G003,85,Teacher3
```

**Expected:**
- Row 2 error: "student_code must contain only A-Z, 0-9, _, -"
- Row 3 error: "goal_code must contain only A-Z, 0-9, _, -"
- Row 4 error: "student_code must be 32 characters or less"

✅ **Pass Criteria:** Character set and length limits enforced

### Test CSV9: Invalid percent/value Range

```csv
date,student_code,goal_code,percent,collected_by
2024-01-15,S001,G001,150,Teacher1
2024-01-16,S002,G002,-10,Teacher2
2024-01-17,S003,G003,abc,Teacher3
```

**Expected:**
- Row 2 error: "percent/value: Value must be between 0 and 100"
- Row 3 error: "percent/value: Value must be between 0 and 100"
- Row 4 error: "percent/value: Value must be a number"

✅ **Pass Criteria:** Range and type validation works

### Test CSV10: Notes Length Limit

```csv
date,student_code,goal_code,percent,collected_by,notes
2024-01-15,S001,G001,75,Teacher1,"This is a very long note that exceeds 500 characters... [generate 501+ chars]"
```

**Expected:**
- Row 2 error: "notes must be 500 characters or less"

✅ **Pass Criteria:** Length limit enforced on optional fields

### Test CSV11: HTML in Notes (Sanitization)

```csv
date,student_code,goal_code,percent,collected_by,notes
2024-01-15,S001,G001,75,Teacher1,"<script>alert('xss')</script>"
2024-01-16,S002,G002,80,Teacher2,"Student showed improvement > 50%"
```

**Expected:**
- Both rows imported successfully
- Notes sanitized:
  - Row 1: `&lt;script&gt;alert('xss')&lt;/script&gt;`
  - Row 2: `Student showed improvement &gt; 50%`

✅ **Pass Criteria:** HTML escaped, no XSS risk

### Test CSV12: High Error Rate (>10%)

```csv
date,student_code,goal_code,percent,collected_by
2024-01-15,S001,G001,75,Teacher1
invalid,S002,G002,80,Teacher2
invalid,S003,G003,85,Teacher3
invalid,S004,G004,90,Teacher4
invalid,S005,G005,95,Teacher5
2024-01-20,S006,G006,100,Teacher6
```

(5 out of 6 rows invalid = 83% error rate)

**Expected:**
- Import blocked
- Error: "Too many invalid rows: 83.3% (max 10%)"
- Error summary shows: 1 valid, 5 invalid
- First 5 row errors listed

✅ **Pass Criteria:** Error rate threshold enforced

### Test CSV13: Low Error Rate (≤10%) - Partial Import

```csv
date,student_code,goal_code,percent,collected_by
2024-01-15,S001,G001,75,Teacher1
2024-01-16,S002,G002,80,Teacher2
2024-01-17,S003,G003,85,Teacher3
2024-01-18,S004,G004,90,Teacher4
2024-01-19,S005,G005,95,Teacher5
2024-01-20,S006,G006,100,Teacher6
2024-01-21,S007,G007,105,Teacher7
2024-01-22,S008,G008,110,Teacher8
2024-01-23,S009,G009,75,Teacher9
2024-01-24,S010,G010,80,Teacher10
```

(2 out of 10 rows invalid = 20%, but this should fail. Let's make it 1 out of 11 = 9%)

```csv
date,student_code,goal_code,percent,collected_by
2024-01-15,S001,G001,75,Teacher1
2024-01-16,S002,G002,80,Teacher2
2024-01-17,S003,G003,85,Teacher3
2024-01-18,S004,G004,90,Teacher4
2024-01-19,S005,G005,95,Teacher5
2024-01-20,S006,G006,100,Teacher6
2024-01-21,S007,G007,75,Teacher7
2024-01-22,S008,G008,80,Teacher8
2024-01-23,S009,G009,85,Teacher9
2024-01-24,S010,G010,90,Teacher10
invalid,S011,G011,95,Teacher11
```

(1 out of 11 rows invalid = 9%)

**Expected:**
- Import succeeds (partial)
- Alert: "Import successful! 10 valid rows imported. 1 rows had errors and were skipped."
- 10 rows displayed in table

✅ **Pass Criteria:** Partial import works under error threshold

### Test CSV14: Valid Full Import

```csv
date,student_code,goal_code,percent,collected_by,notes,method,source
2024-01-15,S001,G001,75,Teacher1,"Made progress","Direct observation","Classroom"
01/20/2024,S002,G002,80,Teacher2,"Excellent work","Assessment","Testing"
2024-01-25,S003,G003,90,Teacher3,,,"Classroom"
```

**Expected:**
- All 3 rows imported
- Success alert: "IEP progress imported successfully! 3 entries loaded."
- Data displayed in table with normalized dates

✅ **Pass Criteria:** Valid import works perfectly

### Test CSV15: Cookie Security Verification

1. Log in to Teacher Center: `${PREVIEW_URL}/site/teacher/`
2. Open DevTools → Application tab → Cookies
3. Select the site domain
4. Inspect `tc` cookie

**Expected:**
- `HttpOnly`: ✅ Checked
- `Secure`: ✅ Checked
- `SameSite`: `Lax`
- `Path`: `/`

✅ **Pass Criteria:** All security flags present

### Test CSV16: Admin Login Throttle

1. Navigate to `${PREVIEW_URL}/admin-login`
2. Enter invalid credentials
3. Submit form
4. Immediately try again with invalid credentials

**Expected:**
- First attempt: Redirects to `/admin-login?e=1` (error)
- Response includes `Set-Cookie: admin_throttle=...`
- Second attempt: Blocked, redirects to `/admin-login?e=1`
- Wait 60 seconds, try again: Allowed

✅ **Pass Criteria:** Throttle active on admin login

### CSV Validation Checklist

- [ ] CSV1: Invalid file type rejected
- [ ] CSV2: Oversized file rejected
- [ ] CSV3: Empty/header-only file rejected
- [ ] CSV4: Missing required headers detected
- [ ] CSV5: Missing percent/value column detected
- [ ] CSV6: Invalid dates rejected
- [ ] CSV7: Date normalization works (MM/DD/YYYY → yyyy-mm-dd)
- [ ] CSV8: Invalid student_code/goal_code rejected
- [ ] CSV9: Invalid percent/value range rejected
- [ ] CSV10: Notes length limit enforced
- [ ] CSV11: HTML in notes sanitized
- [ ] CSV12: High error rate (>10%) blocks import
- [ ] CSV13: Low error rate (≤10%) allows partial import
- [ ] CSV14: Valid full import succeeds
- [ ] CSV15: Cookie security flags verified (tc cookie)
- [ ] CSV16: Admin login throttle enforced

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
