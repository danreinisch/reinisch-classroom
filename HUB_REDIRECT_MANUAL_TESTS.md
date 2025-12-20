# Manual Test Guide for Hub Student Redirect (PR E)

## Test Setup
1. Open browser devtools (F12)
2. Navigate to the Console tab
3. Navigate to the Application tab > Local Storage

## Test Cases

### Test 1: Valid Student Auth - Should Redirect
**Setup:**
```javascript
// In browser console:
localStorage.setItem('rc_auth', JSON.stringify({
  role: 'student',
  code: 'S001',
  name: 'Test Student',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 24 * 60 * 60 * 1000
}));
```

**Action:** Navigate to `/hub/`

**Expected:**
- Console shows: `[hub-student-redirect] Valid student auth found, redirecting to student portal`
- Browser redirects to `/student/`
- No hub UI elements visible
- URL is `/student/`
- `window.__redirectingToStudentPortal === true`

---

### Test 2: Expired Student Auth - Should Continue to Hub
**Setup:**
```javascript
// In browser console:
localStorage.setItem('rc_auth', JSON.stringify({
  role: 'student',
  code: 'S001',
  name: 'Test Student',
  issuedAt: Date.now() - 25 * 60 * 60 * 1000,
  expiresAt: Date.now() - 1000
}));
```

**Action:** Navigate to `/hub/`

**Expected:**
- Console shows: `[hub-student-redirect] Auth token expired, clearing and continuing to hub`
- Browser stays on `/hub/`
- Hub UI loads normally
- localStorage.rc_auth is cleared

---

### Test 3: Teacher Auth - Should Continue to Hub
**Setup:**
```javascript
// In browser console:
localStorage.setItem('rc_auth', JSON.stringify({
  role: 'teacher',
  code: 'TEACHER1',
  name: 'Test Teacher',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 24 * 60 * 60 * 1000
}));
```

**Action:** Navigate to `/hub/`

**Expected:**
- Console shows: `[hub-student-redirect] Non-student role (teacher), continuing to hub`
- Browser stays on `/hub/`
- Hub UI loads normally
- localStorage.rc_auth remains intact

---

### Test 4: No Auth - Should Continue to Hub
**Setup:**
```javascript
// In browser console:
localStorage.removeItem('rc_auth');
```

**Action:** Navigate to `/hub/`

**Expected:**
- Console shows: `[hub-student-redirect] No auth token found, continuing to hub`
- Browser stays on `/hub/`
- Hub UI loads normally

---

### Test 5: Invalid JSON - Should Continue to Hub
**Setup:**
```javascript
// In browser console:
localStorage.setItem('rc_auth', 'not valid json {]');
```

**Action:** Navigate to `/hub/`

**Expected:**
- Console shows: `[hub-student-redirect] Invalid JSON in auth token, clearing and continuing to hub`
- Browser stays on `/hub/`
- Hub UI loads normally
- localStorage.rc_auth is cleared

---

### Test 6: Missing Required Fields - Should Continue to Hub
**Setup:**
```javascript
// In browser console:
localStorage.setItem('rc_auth', JSON.stringify({
  name: 'Test Student',
  expiresAt: Date.now() + 24 * 60 * 60 * 1000
}));
```

**Action:** Navigate to `/hub/`

**Expected:**
- Console shows: `[hub-student-redirect] Auth missing required fields (role, code), clearing and continuing to hub`
- Browser stays on `/hub/`
- Hub UI loads normally
- localStorage.rc_auth is cleared

---

### Test 7: No Redirect Loop
**Setup:**
```javascript
// In browser console:
localStorage.setItem('rc_auth', JSON.stringify({
  role: 'student',
  code: 'S001',
  name: 'Test Student',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 24 * 60 * 60 * 1000
}));
```

**Action:**
1. Navigate to `/hub/` (should redirect to `/student/`)
2. Navigate to `/student/` directly

**Expected:**
- First navigation redirects from `/hub/` to `/student/`
- Second navigation stays on `/student/` (no redirect loop)
- `window.__redirectingToStudentPortal` is only true on hub page, not on student portal page

---

### Test 8: History Not Polluted
**Setup:**
```javascript
// In browser console:
localStorage.setItem('rc_auth', JSON.stringify({
  role: 'student',
  code: 'S001',
  name: 'Test Student',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 24 * 60 * 60 * 1000
}));
```

**Action:**
1. Navigate to home page `/`
2. Navigate to `/hub/` (should redirect to `/student/`)
3. Click browser back button

**Expected:**
- After step 2, user is on `/student/`
- After step 3, user is back at home page `/`, NOT at `/hub/`
- This confirms `location.replace()` is used correctly

---

## Quick Validation Checklist
- [ ] Valid student auth redirects to /student/
- [ ] Expired auth clears and continues to hub
- [ ] Teacher auth continues to hub
- [ ] No auth continues to hub
- [ ] Invalid JSON clears and continues to hub
- [ ] Missing fields clears and continues to hub
- [ ] No redirect loop occurs
- [ ] History not polluted (back button skips hub)
- [ ] Global flag `__redirectingToStudentPortal` is set on redirect
- [ ] Script runs before hub initialization (hub UI never renders for students)
