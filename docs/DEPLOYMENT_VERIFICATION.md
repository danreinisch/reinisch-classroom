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
# Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://*.supabase.co; ...
# (should NOT contain 'unsafe-inline' in script-src)

# Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; ...
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

**Test Authentication Flow:**

1. Navigate to Student Portal
2. Enter student code and submit
3. Verify dashboard loads without CSP errors
4. Test logout redirect to root (/)
5. Verify login form appears again

### 2. Functionality Testing

**Student Portal:**

- [ ] Login form displays correctly
- [ ] Student login succeeds with valid code
- [ ] Dashboard loads with assignments
- [ ] Assignment cards render properly
- [ ] Assignment detail modal opens
- [ ] Logout redirects to /
- [ ] Auto-login (24h remember-me) works after refresh

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
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://*.supabase.co; style-src 'self' 'unsafe-inline'; ...
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; ...
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

## Telemetry Verification

The application includes opt-in client error telemetry for diagnostics. This section covers testing the telemetry system.

### Prerequisites

- Deployment must be live (local or production)
- Access to Netlify function logs
- Browser with DevTools

### Test 1: Enable Telemetry with URL Flag

**Steps:**
1. Navigate to: `https://your-domain.netlify.app/student/?diag=1`
2. Open DevTools Console
3. Look for message: `[rcDiag] Diagnostic mode enabled`
4. Verify: `window.rcDiag.enabled` is `true`

**Expected:**
✅ Diagnostic mode enabled message appears
✅ `rcDiag.enabled` is `true`
✅ Telemetry functions available: `window.captureError`, `window.recordMetric`

### Test 2: Capture Test Error

**Steps:**
1. Ensure telemetry is enabled (?diag=1)
2. Open DevTools Console
3. Run: `setTimeout(() => { throw new Error('test telemetry error'); }, 0)`
4. Open Network tab, filter for "client-error"
5. Wait up to 5 seconds for batch flush
6. Check for POST request to `/.netlify/functions/client-error`

**Expected:**
✅ Request appears in Network tab
✅ Response status: `204 No Content`
✅ Request headers include: `Content-Type: application/json`, `X-Client-Request-Id`
✅ Request body includes:
```json
{
  "type": "error",
  "page": "/student/",
  "ts": <timestamp>,
  "payload": {
    "message": "test telemetry error",
    "name": "Error",
    "stack": "Error: test telemetry error..."
  }
}
```

### Test 3: Verify Function Logs

**Steps:**
1. After Test 2, open Netlify dashboard
2. Navigate to Functions > client-error > Logs
3. Search for recent request (use X-Request-Id from response headers)

**Expected:**
✅ Log entry shows:
```
[client-error] [<request-id>] Telemetry event received:
[client-error] [<request-id>]   type: error
[client-error] [<request-id>]   page: /student/
[client-error] [<request-id>]   error.message: test telemetry error
[client-error] [<request-id>]   error.name: Error
```

### Test 4: Record Performance Metric

**Steps:**
1. Ensure telemetry is enabled (?diag=1)
2. Open DevTools Console
3. Run: `window.recordMetric('manual-test-metric', 123.45, 'test-detail')`
4. Check Network tab for POST to client-error
5. Verify response: `204 No Content`

**Expected:**
✅ Request succeeds with 204
✅ Request body:
```json
{
  "type": "metric",
  "page": "/student/",
  "ts": <timestamp>,
  "payload": {
    "name": "manual-test-metric",
    "durationMs": 123.45,
    "detail": "test-detail"
  }
}
```

### Test 5: Verify Throttling

**Steps:**
1. Ensure telemetry is enabled (?diag=1)
2. Open DevTools Console
3. Run this script to fire 12 rapid errors:
```javascript
for (let i = 0; i < 12; i++) {
  window.captureError(new Error(`throttle test ${i}`));
}
```
4. Wait 5 seconds for batch to flush
5. Check Network tab for client-error requests

**Expected:**
✅ First batch (up to 10 events): Response `204 No Content`
✅ Subsequent requests within 1 minute: Response `429 Too Many Requests`
✅ `Set-Cookie: ce_throttle=...` header present
✅ Console shows: `[rcDiag] Telemetry: Throttled by server` (if logging enabled)

### Test 6: Telemetry Disabled by Default

**Steps:**
1. Navigate to: `https://your-domain.netlify.app/student/` (NO ?diag=1)
2. Open DevTools Console
3. Verify NO message: `[rcDiag] Diagnostic mode enabled`
4. Check: `window.rcDiag.enabled` is `false`
5. Run: `setTimeout(() => { throw new Error('should not send'); }, 0)`
6. Wait 10 seconds
7. Check Network tab for client-error requests

**Expected:**
✅ NO diagnostic mode message
✅ `rcDiag.enabled` is `false`
✅ NO requests to client-error endpoint
✅ Error still appears in console (not suppressed)

### Test 7: localStorage Persistence

**Steps:**
1. Navigate to: `https://your-domain.netlify.app/student/` (no ?diag=1)
2. Open DevTools Console
3. Run: `localStorage.setItem('rcDiagEnabled', '1')`
4. Reload page
5. Verify: `window.rcDiag.enabled` is `true`
6. Trigger test error: `setTimeout(() => { throw new Error('test'); }, 0)`
7. Verify telemetry request sent

**Cleanup:**
8. Run: `localStorage.removeItem('rcDiagEnabled')`
9. Reload page
10. Verify: `window.rcDiag.enabled` is `false`

**Expected:**
✅ After setting localStorage: telemetry enabled
✅ After removing localStorage: telemetry disabled

### Test 8: Measure Async Operation

**Steps:**
1. Ensure telemetry is enabled (?diag=1)
2. Open DevTools Console
3. Run:
```javascript
await window.measureAsync('test-fetch', async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return 'done';
});
```
4. Check Network tab for metric POST

**Expected:**
✅ Request sent with type: `metric`
✅ Payload includes: `name: "test-fetch"`, `durationMs: ~100`

### Test 9: Auto-Capture Unhandled Rejection

**Steps:**
1. Ensure telemetry is enabled (?diag=1)
2. Open DevTools Console
3. Run:
```javascript
Promise.reject(new Error('unhandled rejection test'));
```
4. Wait 5 seconds
5. Check Network tab for error POST

**Expected:**
✅ Error captured and sent
✅ Payload message: "unhandled rejection test"
✅ Type: "error"

### Test 10: Validate Request Size Limit

**Steps:**
1. Ensure telemetry is enabled (?diag=1)
2. Open DevTools Console
3. Create oversized error:
```javascript
const hugeStack = 'A'.repeat(50000);
fetch('/.netlify/functions/client-error', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'error',
    page: '/test',
    ts: Date.now(),
    payload: {
      message: 'test',
      stack: hugeStack
    }
  })
}).then(r => console.log('Status:', r.status));
```

**Expected:**
✅ Response: `400 Bad Request`
✅ Error: "Request body too large"

### Test 11: Verify Payload Sanitization

**Steps:**
1. Ensure telemetry is enabled (?diag=1)
2. Send error with angle brackets:
```javascript
window.captureError(new Error('Error with <script>alert("xss")</script> tags'));
```
3. Check Netlify function logs
4. Verify angle brackets removed

**Expected:**
✅ Logged message: "Error with scriptalert("xss")/script tags" (brackets removed)

### Test 12: Check CORS Headers

**Steps:**
1. Use curl to test CORS preflight:
```bash
curl -i -X OPTIONS \
  -H "Origin: https://your-domain.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://your-domain.netlify.app/.netlify/functions/client-error
```

**Expected:**
✅ Status: `200 OK`
✅ Headers include:
  - `Access-Control-Allow-Origin: https://your-domain.netlify.app`
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, X-Client-Request-Id`
  - `Vary: Origin`

### Troubleshooting Telemetry

**Issue: Telemetry enabled but no requests sent**

**Check:**
1. Verify `window.rcDiag.enabled` is `true`
2. Check console for errors
3. Verify `window.captureError` exists
4. Check browser is online: `navigator.onLine`
5. Look for throttle messages in console

**Issue: 429 Too Many Requests**

**Cause:** More than 10 events in 1 minute

**Solution:**
1. Wait 60 seconds for throttle window to expire
2. Clear throttle cookie: DevTools > Application > Cookies > Delete `ce_throttle`
3. Reduce event frequency

**Issue: 400 Bad Request**

**Possible causes:**
1. Invalid JSON format
2. Missing required fields (type, page, ts, payload)
3. Invalid timestamp (not within 24h of server time)
4. Payload validation failed

**Check:**
- Request body in Network tab
- Error details in response
- Function logs for validation errors

**Issue: Events not flushing**

**Check:**
1. Wait at least 5 seconds (batch interval)
2. Verify queue has events: `window.telemetryQueue` (not exposed by default)
3. Check for offline status
4. Look for send failures in console

## Related Documentation

- [GUARDRAILS.md](./GUARDRAILS.md) - Complete security guardrails guide (includes Telemetry section)
- [README.md](../README.md) - Project overview and setup
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase configuration guide
