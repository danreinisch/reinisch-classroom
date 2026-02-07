# Manual Test Guide for Teacher Center Redirect Fix

## Overview
This guide validates the teacher center redirect fix for the `entry=teacher` parameter.

## Test Environment Setup
1. Open browser devtools (F12)
2. Navigate to the Console tab
3. Clear localStorage if needed: `localStorage.clear()`

---

## Test Case 1: Redirect with entry=teacher Parameter

**Action:**
1. Navigate to `/hub/?entry=teacher`
2. Wait for teacher login modal to appear
3. Enter valid teacher credentials
4. Click "Unlock" button

**Expected Behavior:**
- Console shows: `[Teacher Auth] entry=teacher detected, redirecting to /teacher/`
- Browser redirects to `/teacher/` (Teacher Center landing page)
- URL is `/teacher/`
- No longer on `/hub/`

**Verification:**
- Teacher Center interface is visible
- URL bar shows `/teacher/`
- Browser back button returns to previous page (not `/hub/`)

---

## Test Case 2: Redirect with next=/teacher/... Parameter

**Action:**
1. Navigate to `/hub/?next=/teacher/students`
2. Wait for teacher login modal to appear (or gate to show)
3. Enter valid teacher credentials
4. Click "Unlock" button

**Expected Behavior:**
- Console shows: `[Teacher Auth] Redirecting to next on login: /teacher/students`
- Browser redirects to `/teacher/students` (Teacher Center Students page)
- URL is `/teacher/students`

**Verification:**
- Teacher Center Students interface is visible
- URL bar shows `/teacher/students`

---

## Test Case 3: No Redirect Without entry=teacher

**Action:**
1. Navigate to `/hub/` (no query parameters)
2. Click the "Teacher Center" button in the gate panel
3. Enter valid teacher credentials
4. Click "Unlock" button

**Expected Behavior:**
- Console shows: `[Teacher Auth] Calling showTeacher() after successful login`
- Browser stays on `/hub/`
- Teacher view is shown within the hub interface
- URL remains `/hub/`

**Verification:**
- Still on `/hub/` (no redirect)
- Teacher interface is visible within the hub shell
- Hub topbar is visible

---

## Test Case 4: Session Resume with entry=teacher

**Setup:**
1. Have a pending teacher session (from previous login)
2. Navigate to `/hub/?entry=teacher`

**Action:**
1. Click the "Resume Session" button

**Expected Behavior:**
- Console shows: `[Teacher Auth] entry=teacher detected on resume, redirecting to /teacher/`
- Browser redirects to `/teacher/`
- URL is `/teacher/`

**Verification:**
- Teacher Center interface is visible
- URL bar shows `/teacher/`

---

## Test Case 5: No Redirect Loop (Guard Logic)

**Setup:**
1. Already authenticated as teacher
2. Set localStorage: 
```javascript
localStorage.setItem('rc_auth', JSON.stringify({
  role: 'teacher',
  code: 'test-teacher',
  name: 'Test Teacher',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 24 * 60 * 60 * 1000
}));
```

**Action:**
1. Navigate directly to `/teacher/?entry=teacher` (simulating potential loop)

**Expected Behavior:**
- No redirect occurs
- Console does NOT show redirect messages
- Stays on `/teacher/` page
- No infinite loop or multiple redirects

**Verification:**
- URL remains `/teacher/`
- Page loads normally
- Network tab shows no multiple page loads

---

## Test Case 6: entry=teacher with Invalid Credentials

**Action:**
1. Navigate to `/hub/?entry=teacher`
2. Enter invalid credentials
3. Click "Unlock" button

**Expected Behavior:**
- Error message appears
- No redirect occurs
- Stays on `/hub/` with modal visible
- Can retry login

**Verification:**
- Error message: "Invalid username or password"
- Modal remains visible
- URL is still `/hub/?entry=teacher`

---

## Console Logging to Watch For

Successful flow should show:
```
[Teacher Auth] Sending authentication request...
[Teacher Auth] Authentication successful for user: test-teacher
[Teacher Auth] Calling showTeacher() after successful login
[Teacher Auth] entry=teacher detected, redirecting to /teacher/
```

---

## Regression Testing

### Other Roles Should Not Be Affected
1. Navigate to `/hub/?entry=student` - should work as before
2. Navigate to `/hub/` as student - should not redirect to teacher
3. Navigate to `/hub/` as substitute - should work as before

### Admin Flow
1. Navigate to `/hub/?entry=admin` - should work as before
2. Verify admin functionality is not affected

---

## Quick Validation Checklist
- [ ] `/hub/?entry=teacher` redirects to `/teacher/` after login
- [ ] `/hub/?next=/teacher/students` redirects to `/teacher/students`
- [ ] `/hub/` without parameters stays on `/hub/` after login
- [ ] Resume session with `entry=teacher` redirects to `/teacher/`
- [ ] No redirect loop when already on `/teacher/`
- [ ] Invalid credentials don't cause redirect
- [ ] Other roles (student, substitute) are not affected
- [ ] Console logs show appropriate messages
- [ ] Browser history is clean (back button doesn't loop)
