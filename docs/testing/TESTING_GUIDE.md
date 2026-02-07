# Student Portal Login Fix - Testing Guide

## Quick Summary
Fixed session persistence issue by removing unnecessary redirect after successful login.

## What Was Fixed
- **Issue**: "Portal resume failed" message appeared even after successful login
- **Root Cause**: Redirect after login created race condition with watchdog timer
- **Solution**: Show dashboard directly without redirect

## Changes
1. `site/web/student-portal-init.js`: Removed redirect, call `showDashboard()` directly
2. `tests/student-login-function.test.cjs`: Added 15 unit tests (all passing)
3. `tests/student-portal-login-pr315.spec.js`: Updated to match new behavior

## Pre-Deployment Testing

### Unit Tests
```bash
node tests/student-login-function.test.cjs
```
Expected: All 15 tests pass ✅

### Linting
```bash
npm run lint
```
Expected: 0 errors ✅

## Deploy Preview Testing

### Test 1: Dropdown Login
1. Go to `/student/`
2. Wait for roster to load (dropdown populates)
3. Select a student code
4. Enter password
5. Click "Login"
6. **Expected**: Dashboard appears directly (no URL change)
7. **Expected**: No "Portal resume failed" message
8. Check sessionStorage:
   - `rc_user_code` should be set
   - `rc_user_role` should be 'student'

### Test 2: Manual Entry Login
1. Go to `/student/`
2. Click "Enter code manually"
3. Type student code
4. Enter password
5. Click "Login"
6. **Expected**: Dashboard appears directly
7. **Expected**: No "Portal resume failed" message

### Test 3: Session Persistence
1. After successful login (Test 1 or 2)
2. Refresh the page (F5)
3. **Expected**: Dashboard shows immediately
4. **Expected**: No login form flash
5. **Expected**: No "Portal resume failed" message

### Test 4: Error Handling
1. Go to `/student/`
2. Select/enter a code
3. Enter WRONG password
4. Click "Login"
5. **Expected**: Error message displays
6. **Expected**: Stay on login form (no redirect)
7. **Expected**: Can retry login

### Test 5: Missing Credentials
1. Go to `/student/`
2. Click "Login" without selecting code
3. **Expected**: Validation error
4. Fill in code, leave password empty
5. Click "Login"
6. **Expected**: Validation error

### Test 6: Logout
1. After successful login
2. Click "Sign Out" button
3. **Expected**: Redirected to home page
4. **Expected**: Session cleared
5. Navigate back to `/student/`
6. **Expected**: Login form shows (no auto-login)

## Known Behaviors

### Expected Behaviors
- Login shows dashboard directly (no redirect)
- Session persists across page refreshes
- Logout clears session and redirects to home
- Error messages display clearly
- Watchdog timer doesn't interfere with successful logins

### Watchdog Behavior
- Watchdog still runs but dashboard shows before it fires
- If dashboard doesn't show within 8 seconds, watchdog redirects to login with reason parameter
- This is expected failsafe behavior (rarely triggers with fix)

## Console Checks

Open browser DevTools Console and check for:

### Successful Login
```
[student-portal] Attempting login for: SXXX
[student-portal] Login successful
[student-portal] Showing dashboard for: SXXX
```

### Session Restore (after refresh)
```
[student-portal] Already authenticated, showing dashboard
```

### Watchdog (should NOT trigger on successful login)
Should NOT see:
```
[student-portal] Boot watchdog: dashboard not visible after 8000ms
```

## Rollback Plan

If issues are found:
1. Revert commit `cec2258` (main fix)
2. Revert commit `bd6f11e` (test update)
3. Keep commit `0920a3e` (unit tests - these are standalone)

## Questions?

Check the following files for implementation details:
- `/site/web/student-portal-init.js` (lines 847-853) - Main fix
- `/tests/student-login-function.test.cjs` - Unit tests
- `/netlify/functions/student-login.js` - Server-side login handler
