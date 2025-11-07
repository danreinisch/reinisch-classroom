# Authentication Stabilization - Testing & Verification Guide

## Overview
This document provides step-by-step testing procedures to verify the authentication stability fixes for the Student Hub and Teacher Center.

## Prerequisites
- Access to the deployed site (Netlify or local server)
- Modern browser with console access (Chrome, Firefox, Edge)
- Multiple test student codes and teacher password

## Test Scenarios

### 1. Substitute Authentication (ReferenceError Fix)

**Objective**: Verify substitute login modal works without throwing ReferenceError

**Steps**:
1. Open browser console (F12)
2. Navigate to Hub page: `/site/hub/`
3. Click "Sign In" to open the sign-in modal
4. Click "Substitute" button
5. Enter substitute password
6. Click "Sign In"

**Expected Results**:
- ✅ No ReferenceError in console about `substituteModal`
- ✅ Modal opens and closes smoothly
- ✅ Console shows `[substitute-auth] Initialization complete`
- ✅ On success, redirects to `/sub/`
- ✅ On failure, shows error message without crashing

**Potential Issues**:
- ❌ Console shows: `ReferenceError: substituteModal is not defined`
- ❌ Modal doesn't open/close properly
- ❌ Multiple substitute buttons appear


### 2. Student Auto-Login Flow (24-Hour Remember Me)

**Objective**: Verify seamless student authentication from Hub to Student Portal

**Steps**:
1. Clear browser storage: `localStorage.clear(); sessionStorage.clear();`
2. Navigate to Hub: `/site/hub/`
3. Click "Sign In" → "Student"
4. Enter valid student code and password
5. Click "Sign In"

**Expected Results**:
- ✅ Console shows `[auth-handoff] Auth written: { role: 'student', code: 'XXX', expiresIn: '1440min' }`
- ✅ Redirects to `/student/?auto=1&code=XXX`
- ✅ Student dashboard loads WITHOUT showing login form (no flicker)
- ✅ Console shows `[Auto-login Bootstrap] Success: Bypassing login form`
- ✅ Dashboard displays student name and assignments

**Refresh Test**:
1. Refresh the page (F5)
2. Expected: Dashboard loads immediately, no login form shown
3. Console shows: `[Init] Early bootstrap succeeded, proceeding to dashboard`

**Expiry Test**:
1. Open browser console
2. Run: `localStorage.setItem('rc_auth', '{"role":"student","code":"TEST","expiresAt":1}')`
3. Refresh page
4. Expected: Login form shows (auth expired)
5. Console shows: `[Auto-login Bootstrap] Auth expired, clearing`

**Cross-Tab Test**:
1. Login to student in Tab 1
2. Open Tab 2 to `/student/`
3. Expected: Tab 2 auto-logs in via BroadcastChannel
4. Logout in Tab 1
5. Expected: Tab 2 shows login form after broadcast


### 3. Teacher Center Access

**Objective**: Verify teacher center loads without errors

**Steps**:
1. Navigate to Hub: `/site/hub/`
2. Click "Teacher Center 🔒"
3. Enter teacher password
4. Click "Sign In"

**Expected Results**:
- ✅ Console shows `[auth-handoff] Auth written: { role: 'teacher', ... }`
- ✅ Teacher Center view appears with tabs
- ✅ No JavaScript errors in console
- ✅ Console shows `[substitute-auth] Initialization complete`
- ✅ No duplicate substitute buttons
- ✅ IEP Progress, Assignments, and other features load


### 4. Idempotent Event Bindings

**Objective**: Verify no duplicate event handlers are attached

**Steps**:
1. Open Hub page
2. Open Console
3. Navigate away and back to Hub multiple times
4. Click substitute/teacher buttons multiple times
5. Check for duplicate console messages

**Expected Results**:
- ✅ Each action logs only once
- ✅ No message appears multiple times per action
- ✅ Console shows: `[auth-modal-extend] Already initialized, skipping` on re-init attempts
- ✅ If duplicates detected: `[substitute-auth] Removed X duplicate button(s)`


### 5. Diagnostics Utility

**Objective**: Verify diagnostics tool provides useful auth state information

**Steps**:
1. Navigate to Student Portal or Hub
2. Open browser console
3. Run: `window.__printDiagnostics()`

**Expected Output**:
```
=== AUTH DIAGNOSTICS ===
Timestamp: 2024-01-01T12:00:00.000Z
Status: OK
Summary: Authentication state looks healthy

Flags:
  __autoLoginOk: true
  __authModalExtendBound: true
  __sbClient: true

localStorage:
  rc_auth: {
    role: "student",
    code: "TESTCODE",
    name: "Test Student",
    expiresAt: "2024-01-02T12:00:00.000Z",
    isExpired: false,
    timeRemaining: 86400000
  }

sessionStorage:
  rc_user_code: "TESTCODE"
  rc_user_role: "student"

URL Parameters:
  auto: "1"
  code: "TESTCODE"

⚠️ Warnings: (if any)
❌ Errors: (if any)
```

**Test Variations**:
- **No Auth**: Should show status: 'ok', localStorage.rc_auth: null
- **Expired Auth**: Should show warnings about expiry
- **Code Mismatch**: Should warn if URL code ≠ localStorage code


### 6. Network Resilience

**Objective**: Verify Supabase reconnection on network toggle

**Steps**:
1. Login to Hub or Student Portal
2. Open DevTools → Network tab
3. Toggle "Offline" mode
4. Wait 5 seconds
5. Toggle back "Online"

**Expected Results**:
- ✅ Console shows: `[supabase-client] Network offline`
- ✅ After online: `[supabase-client] Network online, attempting reconnect`
- ✅ Console shows: `[supabase-client] Reconnection successful`
- ✅ No errors or crashes
- ✅ UI remains functional


### 7. Redirect Path Verification

**Objective**: Ensure all redirects use /student/ not /site/student/

**Steps**:
1. Login as student from Hub
2. Check browser URL bar after redirect
3. Click "Student Portal" link in header
4. Check any assignment links

**Expected Results**:
- ✅ All URLs use `/student/` prefix
- ✅ No `/site/student/` URLs anywhere
- ✅ Deep links work: `/student/?code=XXX`
- ✅ Netlify redirects handle routes correctly


## Automated Test Commands

Run these in browser console for quick validation:

```javascript
// Test 1: Check diagnostics are loaded
typeof window.__diagnoseAuth === 'function'  // Should be true

// Test 2: Check auth handoff functions exist
typeof window.setAuth === 'function'  // Legacy alias
typeof window.clearAuth === 'function'  // Should be true

// Test 3: Get current auth state
window.__diagnoseAuth()

// Test 4: Check for duplicate buttons (run on Hub after sign-in modal opens)
document.querySelectorAll('button').forEach(b => {
  if (b.textContent.includes('Substitute')) console.log('Found:', b);
})

// Test 5: Manually trigger auto-login (for testing)
localStorage.setItem('rc_auth', JSON.stringify({
  role: 'student',
  code: 'TEST123',
  name: 'Test Student',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 24*60*60*1000
}));
location.reload();
```


## Common Issues & Solutions

### Issue: Login form flickers before dashboard
**Cause**: Early bootstrap script not executing
**Solution**: Check console for `[Auto-login Bootstrap]` messages. Verify rc_auth exists and not expired.

### Issue: ReferenceError: substituteModal is not defined
**Cause**: Old cached version of auth-modal-extend.js
**Solution**: Hard refresh (Ctrl+Shift+R) to clear cache

### Issue: Duplicate substitute buttons
**Cause**: Multiple initialization attempts
**Solution**: Check for `[substitute-auth] Removed X duplicate button(s)` in console - this is expected cleanup

### Issue: Teacher center doesn't load
**Cause**: JavaScript error in initialization
**Solution**: Check console for `[TeacherCenter]` prefixed errors

### Issue: Auto-login stops working after 24 hours
**Cause**: By design - auth expires after 24h
**Solution**: User should re-login. This is expected behavior.


## Success Criteria Checklist

- [ ] No ReferenceError about substituteModal
- [ ] Student auto-login works without login form flicker
- [ ] Dashboard persists on refresh within 24h
- [ ] Expired auth shows login form (no crash)
- [ ] Teacher center loads without errors
- [ ] No duplicate substitute buttons (or cleaned up automatically)
- [ ] Diagnostics utility returns expected data
- [ ] All redirects use /student/ prefix
- [ ] Network toggle doesn't crash the app
- [ ] Console shows concise, helpful messages


## Security Validation

Run CodeQL scanner:
```bash
# Expected: 0 alerts
codeql database analyze --format=sarif-latest --output=results.sarif
```

Check for:
- ✅ No secrets in localStorage (only code, role, name, timestamps)
- ✅ No XSS vulnerabilities (textContent used, not innerHTML for user data)
- ✅ No insecure redirects
- ✅ Auth expiry enforced


## Deployment Verification

After deployment to Netlify:

1. Visit production URL
2. Run all test scenarios above
3. Check Netlify function logs for auth endpoints
4. Verify _redirects file handles /student/* routes
5. Test on multiple browsers (Chrome, Firefox, Safari, Edge)
6. Test on mobile devices


## Rollback Plan

If critical issues found:

1. Revert PR merge
2. Deploy previous commit
3. Document issues in GitHub issue
4. Re-test locally before redeploying


## Contact

For issues or questions:
- Open GitHub issue with test scenario that failed
- Include console logs and screenshots
- Tag @danreinisch
