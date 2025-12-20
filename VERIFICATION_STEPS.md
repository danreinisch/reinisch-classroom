# Manual Verification Steps for Login View Flash Fix

## Overview
This document outlines the manual verification steps for the PR that eliminates login-view flash on deep links.

## Changes Made

### 1. `site/web/student-portal-redirect.js`
- **Valid deep links** (`auto=1` with non-empty `code`): Now immediately hides `#loginView` and sets `window.__deepLinkAutoLogin = true`
- **Invalid deep links** (`auto=1` without `code` or with empty/whitespace `code`): Now redirects to `/hub/` before showing any UI
- **No auth**: Continues to redirect to `/hub/` as before

### 2. `site/web/student-portal-failsafe.js`
- Now checks for `window.__deepLinkAutoLogin` flag and skips failsafe if true
- Prevents login view from being force-shown during valid deep-link authentication

### 3. `netlify/edge-functions/student-entry-redirect.js`
- Added server-side validation for invalid deep links
- Redirects `auto=1` with missing/empty `code` to `/hub/` before HTML is served

### 4. `tests/student-portal-redirect.spec.js`
- Added test cases for empty code parameter
- Added test case for whitespace-only code parameter

## Manual Verification (Production/Staging Environment)

### Test Case 1: Valid Deep Link (No Flash)
**URL**: `https://yourdomain.com/student/?auto=1&code=STUDENT_CODE&name=StudentName`
(Replace with actual domain and student code)

**Expected Behavior**:
1. Login form should NEVER be visible
2. Page should show either:
   - A loading state, OR
   - Direct transition to student dashboard
3. No flashing of the code+password login form

**How to Verify**:
1. Open browser DevTools (F12)
2. Navigate to the URL
3. Watch for `#loginView` element - it should never have `display: block` or be visible
4. Check console logs for: `[student-portal-redirect] Valid auto-login detected, hiding login view`

### Test Case 2: Invalid Deep Link - Missing Code
**URL**: `https://yourdomain.com/student/?auto=1`

**Expected Behavior**:
1. Immediate redirect to `/hub/`
2. Login form should not be visible during redirect
3. May briefly show "Redirecting to Hub..." message

**How to Verify**:
1. Navigate to the URL
2. Should immediately redirect to hub
3. Check Network tab: May see 302 redirect from edge function
4. Check console logs for: `[student-portal-redirect] Invalid auto-login detected (missing or empty code), redirecting to hub`

### Test Case 3: Invalid Deep Link - Empty Code
**URL**: `https://yourdomain.com/student/?auto=1&code=`

**Expected Behavior**:
- Same as Test Case 2

### Test Case 4: Invalid Deep Link - Whitespace Code
**URL**: `https://yourdomain.com/student/?auto=1&code=%20%20%20`

**Expected Behavior**:
- Same as Test Case 2

### Test Case 5: Direct Access (No Parameters)
**URL**: `https://yourdomain.com/student/`

**Expected Behavior**:
1. Redirect to `/hub/` (either via edge function 302 or client-side redirect)
2. No login form visible

## Code Flow Diagram

```
User navigates to /student/?auto=1&code=STUDENT_CODE
    ↓
Edge Function checks parameters
    ↓
    ├─→ Valid (auto=1 AND code non-empty)
    │       ↓
    │   Serve HTML
    │       ↓
    │   student-portal-redirect.js loads
    │       ↓
    │   Detects valid deep link
    │       ↓
    │   Hides #loginView immediately
    │       ↓
    │   Sets window.__deepLinkAutoLogin = true
    │       ↓
    │   student-portal-failsafe.js checks flag
    │       ↓
    │   Skips failsafe (doesn't show login)
    │       ↓
    │   Main portal JS loads and shows dashboard
    │
    └─→ Invalid (auto=1 but code missing/empty)
            ↓
        Edge Function: 302 redirect to /hub/
            ↓
        (If edge function bypassed)
        Client-side redirect.js detects invalid
            ↓
        Hides #loginView, shows "Redirecting..."
            ↓
        window.location.replace('/hub/')
```

## Key Points

1. **CSP Compliance**: All changes use external JS files, no inline scripts added
2. **Defense in Depth**: Both edge function and client-side code handle invalid deep links
3. **No Breaking Changes**: Existing valid auth flows (remembered auth, valid deep links) continue to work
4. **Performance**: Login view hiding happens synchronously before DOM renders

## Browser Console Commands for Testing

To manually test the redirect logic in browser console:

```javascript
// Test invalid deep link detection
const urlParams = new URLSearchParams('?auto=1');
const auto = urlParams.get('auto');
const code = urlParams.get('code');
console.log('Should redirect:', auto === '1' && (!code || code.trim().length === 0));
// Expected: true

// Test valid deep link detection  
const urlParams2 = new URLSearchParams('?auto=1&code=STUDENT_CODE');
const auto2 = urlParams2.get('auto');
const code2 = urlParams2.get('code');
console.log('Should allow:', auto2 === '1' && code2 && code2.trim().length > 0);
// Expected: true
```

## Troubleshooting

### If login form still flashes:
1. Check if `student-portal-redirect.js` is loaded first (before other scripts)
2. Check browser console for any JavaScript errors
3. Verify `window.__deepLinkAutoLogin` is set to `true` for valid deep links
4. Check if `student-portal-failsafe.js` is checking the flag correctly

### If redirects not working:
1. Check Network tab for 302 responses from edge function
2. Check console for redirect logs
3. Verify `/hub/` path exists and is accessible
4. Check for any CSP violations in console

## Notes for CI/CD

The automated tests in `tests/student-portal-redirect.spec.js` may fail in local environments due to path differences between local dev server and production. The tests are configured for production paths and should pass in the actual Netlify deployment environment.

For local testing, the key is to manually verify the behavior in a browser rather than relying solely on automated tests.
