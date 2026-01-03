# Deployment Verification Guide

This document provides checklists and validation procedures for verifying deployments of Reinisch Classroom.

## Pre-Deployment Checklist

- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build completes without errors
- [ ] No inline scripts detected (`npm run check:inline-scripts`)
- [ ] No environment leaks detected (`node scripts/check-env-leaks.js`)
- [ ] Documentation updated for any new features or changes

## Post-Deployment Verification

### 1. Content Security Policy (CSP) Validation

**Check CSP Headers:**

```bash
# Check enforced CSP header
curl -I https://your-domain.netlify.app/ | grep -i content-security-policy

# Expected (Stage 3B):
# Content-Security-Policy: default-src 'self'; frame-src 'self' https://app.netlify.com; script-src 'self' https://cdnjs.cloudflare.com https://*.supabase.co; ...
# (should NOT contain 'unsafe-inline' in script-src)

# Content-Security-Policy-Report-Only: default-src 'self'; frame-src 'self' https://app.netlify.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; ...
# (Report-Only mode SHOULD contain 'unsafe-inline' for monitoring)
```

**Verify No CSP Violations:**

1. Open Student Portal: https://your-domain.netlify.app/student/
2. Open Browser Developer Tools (F12)
3. Check Console for CSP violations
   - ❌ If violations appear: Inline scripts/handlers need to be fixed
   - ✅ No CSP violations: Policy is correctly configured

4. Open Teacher Center: https://your-domain.netlify.app/hub/
5. Repeat console check for CSP violations

6. Open Admin Login: https://your-domain.netlify.app/admin-login/
7. Verify no CSP violations (inline script externalized to `/web/admin-login.js`)

**Note:** Stage 3B CSP requires no inline scripts. Admin login error display logic has been externalized to `site/web/admin-login.js` to comply with the enforced CSP policy.

**Test Authentication Flow:**

1. Navigate to Student Portal
2. Enter student code and submit
3. Verify dashboard loads without CSP errors
4. Test logout redirect to root (/)
5. Verify login form appears again

### 2. Functionality Testing

**Student Portal:**

- [ ] Login form displays correctly
- [ ] Student login succeeds with valid code (server-side verification)
- [ ] Dashboard loads with assignments
- [ ] Assignment cards render properly
- [ ] Assignment detail modal opens
- [ ] Logout redirects to /
- [ ] Auto-login (24h remember-me) works after refresh

**Student Authentication (Server-Side):**

Verify the student-login function works correctly:

```bash
# Test successful login
curl -X POST https://your-domain.netlify.app/.netlify/functions/student-login \
  -H "Content-Type: application/json" \
  -d '{"code":"S001","password":"correct_password"}'

# Expected response (200):
# {"ok":true,"code":"S001","name":"S001"}

# Test failed login
curl -X POST https://your-domain.netlify.app/.netlify/functions/student-login \
  -H "Content-Type: application/json" \
  -d '{"code":"S001","password":"wrong_password"}'

# Expected response (401):
# {"ok":false,"error":"Invalid credentials"}
```

- [ ] POST to `/.netlify/functions/student-login` returns 200 for valid credentials
- [ ] POST returns 401 for invalid credentials
- [ ] Response includes `Cache-Control: no-store` header
- [ ] Hub student sign-in uses server-side verification
- [ ] Student portal login uses server-side verification
- [ ] Local fallback only works on localhost (disabled in production)

**Environment Variables Required:**
- [ ] `SUPABASE_URL` or `SUPABASE_URL_RUNTIME` configured in Netlify
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY_RUNTIME`, or `SUPABASE_SERVICE_KEY` configured in Netlify

**Teacher Center:**

- [ ] Hub page loads with correct navigation
- [ ] Teacher authentication modal works
- [ ] Area switching (Overview/Work/Data) functions
- [ ] Tab persistence works across page refreshes
- [ ] Student portal manager displays
- [ ] IEP progress tracking loads
- [ ] Theme toggle works (glass-bold)
- [ ] Module loading diagnostics display correctly

### 3. Security Headers Validation

**Check All Security Headers:**

```bash
curl -I https://your-domain.netlify.app/ | grep -E "Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options|Referrer-Policy|Permissions-Policy|Content-Security-Policy"
```

**Expected Headers:**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: default-src 'self'; frame-src 'self' https://app.netlify.com; script-src 'self' https://cdnjs.cloudflare.com https://*.supabase.co; style-src 'self' 'unsafe-inline'; ...
Content-Security-Policy-Report-Only: default-src 'self'; frame-src 'self' https://app.netlify.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; ...
```

### 4. CSP Report Monitoring

**Check CSP Reports:**

```bash
# View Netlify Function logs for CSP reports
netlify functions:list
netlify functions:log csp-report --tail

# Or check Netlify dashboard: Functions > csp-report > Logs
```

**What to Look For:**

- Blocked inline scripts (should be zero after Stage 3B)
- Blocked inline event handlers (should be zero for main pages)
- Unexpected external domains (indicates new dependencies)
- Report frequency (high frequency may indicate real issues)

### 5. Performance Checks

**Page Load Times:**

- [ ] Student Portal loads in < 3 seconds
- [ ] Teacher Center loads in < 5 seconds
- [ ] No JavaScript errors in console
- [ ] External module scripts load successfully

**Module Loading:**

- [ ] Check for "Module Load Issue" toast (should not appear)
- [ ] Verify hub-theme-boot.js loads
- [ ] Verify student-portal-failsafe.js runs
- [ ] Check Network tab for 404s on .js files

### 6. CI/CD Verification

**Verify CI Checks Pass:**

```bash
# Run locally to simulate CI
npm run postbuild
# Should run: check-env-leaks.js AND check-inline-scripts.cjs
# Both should exit with code 0 (success)
```

**Expected Output:**

```
✅ All checks passed! No inline scripts or event attributes found.
📦 Files checked: X
```

## Rollback Procedure

If critical issues are found post-deployment:

1. **Immediate:** Add 'unsafe-inline' back to enforced CSP in netlify.toml
2. **Identify:** Check CSP reports and browser console for violations
3. **Fix:** Address inline scripts or event handlers causing violations
4. **Redeploy:** Once fixed, remove 'unsafe-inline' again
5. **Monitor:** Watch CSP reports for 24-48 hours after deployment

## Common Issues & Solutions

### Issue: CSP blocks legitimate scripts

**Symptoms:** Console shows "Refused to load script" errors

**Solution:** Check script-src in netlify.toml includes necessary domains:
- `'self'` for local scripts
- `https://cdnjs.cloudflare.com` for CDN libraries
- `https://*.supabase.co` for Supabase client

### Issue: Inline event handlers break

**Symptoms:** Buttons don't respond, onclick doesn't work

**Solution:** Refactor to use addEventListener:

```javascript
// Replace: <button onclick="doThing()">
// With: <button id="myBtn" data-action="do-thing">
document.getElementById('myBtn').addEventListener('click', doThing);
```

### Issue: Dynamic content with inline handlers

**Symptoms:** Toast/modal buttons created via innerHTML don't work

**Solution:** Use data attributes and set up listeners after insertion:

```javascript
element.innerHTML = '<button data-action="dismiss">X</button>';
element.querySelector('[data-action="dismiss"]').addEventListener('click', handleDismiss);
```

### Issue: Module scripts fail to load

**Symptoms:** "Module loading error" banner, features unavailable

**Solution:**
1. Check Network tab for 404s
2. Verify script paths are correct (relative to HTML file)
3. Ensure scripts are deployed (check netlify deploy logs)
4. Clear browser cache and hard refresh

### Issue: Netlify Functions return 502 with multiple Set-Cookie headers

**Symptoms:** Function returns 502 error with message "error decoding lambda response: invalid type "[]interface {}" for "headers" key "Set-Cookie""

**Solution:** Netlify Functions require multiple `Set-Cookie` values to be returned using `multiValueHeaders`:

```javascript
// ❌ Incorrect - will cause 502 error
return {
  statusCode: 302,
  headers: {
    Location: '/path',
    'Set-Cookie': ['cookie1=value1; ...', 'cookie2=value2; ...']
  }
};

// ✅ Correct - use multiValueHeaders for arrays
return {
  statusCode: 302,
  headers: {
    Location: '/path',
    'Cache-Control': 'no-store'
  },
  multiValueHeaders: {
    'Set-Cookie': ['cookie1=value1; ...', 'cookie2=value2; ...']
  }
};
```

**Note:** Single cookie values can remain in `headers['Set-Cookie']` as a string. Only arrays need `multiValueHeaders`.

## Related Documentation

- [GUARDRAILS.md](./GUARDRAILS.md) - Complete security guardrails guide
- [README.md](../README.md) - Project overview and setup
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase configuration guide

## Telemetry Verification (Optional)

The application includes opt-in client error telemetry. Verify it works correctly in production.

### 1. Enable Diagnostics

**Method 1: URL Parameter**
```
https://your-domain.netlify.app/student/?diag=1
```

**Method 2: localStorage**
```javascript
// In browser console
localStorage.setItem('rcDiagEnabled', '1');
// Then reload page
```

### 2. Verify Telemetry Initialization

**Check Console Output:**
- [ ] `[rcDiag] Diagnostic mode enabled` appears
- [ ] `[rcDiag] Telemetry system initializing...` appears
- [ ] `[rcDiag] Error handlers installed` appears
- [ ] `[rcDiag] Telemetry system initialized` appears
- [ ] `window.rcTelemetry` is available in console

### 3. Test Error Capture

**Trigger a Test Error:**

```javascript
// In browser console
setTimeout(() => { throw new Error('diagnostic test error'); }, 0);
```

**Verify:**
- [ ] Console shows `[rcDiag] Capturing error: diagnostic test error`
- [ ] Network tab shows POST to `/.netlify/functions/client-error`
- [ ] Response status is `204 No Content`
- [ ] Response includes `X-Request-Id` header

**Check Function Logs:**

```bash
netlify functions:log client-error --live
```

**Expected Output:**
```
[client-error] [<request-id>] Request received
[client-error] [<request-id>] Client Request ID: <client-id>
[client-error] [<request-id>] ERROR - page: /student/, name: Error, message: diagnostic test error
```

### 4. Test Metric Recording

**Record a Test Metric:**

```javascript
// In browser console
window.rcTelemetry.recordMetric('test-metric', 123, 'verification test');
```

**Verify:**
- [ ] Console shows `[rcDiag] Recording metric: test-metric 123ms`
- [ ] Within 5 seconds, POST request to `/.netlify/functions/client-error`
- [ ] Response status is `204 No Content`

**Check Function Logs:**

```bash
netlify functions:log client-error
```

**Expected Output:**
```
[client-error] [<request-id>] METRIC - page: /student/, name: test-metric, durationMs: 123
[client-error] [<request-id>]   detail: verification test
```

### 5. Test Throttling

**Trigger Multiple Errors Rapidly:**

```javascript
// In browser console
for (let i = 0; i < 12; i++) {
  setTimeout(() => {
    throw new Error('throttle test ' + i);
  }, i * 100);
}
```

**Verify:**
- [ ] First 10 errors get `204 No Content` responses
- [ ] 11th and 12th errors get `429 Too Many Requests` responses
- [ ] Console shows `[rcDiag] Telemetry throttled (429)`
- [ ] Response includes `Set-Cookie: ce_throttle=...` header

**Wait 60 Seconds and Retry:**
- [ ] After throttle window expires, new errors get `204` again

### 6. Test Diagnostics Disabled

**Navigate Without diag Flag:**
```
https://your-domain.netlify.app/student/
```

**Trigger Error:**
```javascript
// In browser console
throw new Error('should not send telemetry');
```

**Verify:**
- [ ] Error appears in console
- [ ] No POST request to `/.netlify/functions/client-error` in Network tab
- [ ] Console does NOT show `[rcDiag]` messages
- [ ] `window.rcTelemetry` exists but is inactive

### 7. Test Payload Sanitization

**Trigger Error with HTML:**

```javascript
// In browser console
throw new Error('<script>alert("xss")</script>');
```

**Check Function Logs:**
- [ ] Logged message has angle brackets removed
- [ ] No script tags in logs: `scriptalert("xss")/script`

**Trigger Error with Long Message:**

```javascript
throw new Error('A'.repeat(1000));
```

**Check Function Logs:**
- [ ] Message truncated to 512 characters
- [ ] Ends with `...` to indicate truncation

### 8. Test Dynamic Import Metric (If Implemented)

**Navigate to Student Portal:**
```
https://your-domain.netlify.app/student/?diag=1
```

**Wait for Portal to Load:**
- [ ] Check function logs for dynamic import metrics
- [ ] Look for metrics like `dynamic-import-student-portal`

**Expected Output:**
```
[client-error] [<request-id>] METRIC - page: /student/, name: dynamic-import-student-portal, durationMs: <time>
```

### 9. Verify CORS Headers

**Test Preflight Request:**

```bash
curl -i -X OPTIONS \
  -H "Origin: https://your-domain.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, X-Client-Request-Id" \
  https://your-domain.netlify.app/.netlify/functions/client-error
```

**Expected:**
- Status: `200 OK`
- `Access-Control-Allow-Origin: https://your-domain.netlify.app`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-Client-Request-Id`
- `Vary: Origin`

### 10. Test Invalid Payloads

**Test Oversized Body:**

```javascript
// Create ~30KB payload (exceeds 25KB limit)
const largePayload = {
  type: 'error',
  clientId: window.rcClientRequestId,
  page: '/test',
  ts: Date.now(),
  payload: {
    message: 'A'.repeat(30000),
  }
};

fetch('/.netlify/functions/client-error', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(largePayload),
}).then(r => console.log('Status:', r.status));
```

**Expected:**
- Status: `400 Bad Request`
- Error: "Request body too large"

**Test Invalid Type:**

```javascript
const invalidPayload = {
  type: 'invalid-type',
  clientId: window.rcClientRequestId,
  page: '/test',
  ts: Date.now(),
  payload: { message: 'test' }
};

fetch('/.netlify/functions/client-error', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(invalidPayload),
}).then(r => console.log('Status:', r.status));
```

**Expected:**
- Status: `400 Bad Request`
- Error: "type must be \"error\" or \"metric\""

### Telemetry Verification Checklist

- [ ] Diagnostics can be enabled via `?diag=1`
- [ ] Diagnostics can be enabled via `localStorage.rcDiagEnabled`
- [ ] Error events are captured and sent
- [ ] Metric events are recorded and sent
- [ ] Throttling works after 10 events per minute
- [ ] Diagnostics disabled = no telemetry sent
- [ ] Payload sanitization removes angle brackets
- [ ] Long messages are truncated
- [ ] Function logs show sanitized telemetry data
- [ ] CORS headers are correct
- [ ] Invalid payloads return 400 errors
- [ ] Oversized payloads are rejected

### Common Issues

**Issue: Telemetry not sending**
- **Cause**: Diagnostics not enabled
- **Fix**: Ensure `?diag=1` is in URL or localStorage flag is set

**Issue: 429 Too Many Requests**
- **Cause**: Exceeded 10 events per minute
- **Fix**: Wait 60 seconds for throttle window to reset

**Issue: No console output**
- **Cause**: `window.rcDiag` not available or diagnostics disabled
- **Fix**: Verify diagnostics.js is loaded and diag mode is enabled

**Issue: CORS error**
- **Cause**: Request from non-allowed origin
- **Fix**: Check that origin is in TRUSTED_ORIGINS list in _lib/http.js

