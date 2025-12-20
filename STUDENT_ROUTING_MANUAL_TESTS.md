# Student Portal Routing - Manual Test Steps

## Prerequisites
- Access to the deployed site (production or preview deployment)
- Incognito/private browsing window (for fresh tests without cached auth)
- Browser dev tools (for inspection)

---

## Test 1: Direct Navigation Without Auth → Should Redirect to Hub

**Objective:** Verify that visiting `/student/` without auth redirects to `/hub/`

**Steps:**
1. Open a new **incognito/private** browsing window
2. Clear any existing site data (not usually needed in incognito)
3. Navigate to: `/student/` on your deployed site
4. Observe the page load behavior

**Expected Results:**
- ✅ URL should change from `/student/` to `/hub/`
- ✅ Hub login page should appear (dropdown selector)
- ✅ The gremlin login form (code + password fields) should **not** appear
- ✅ No flash of the login form during redirect
- ✅ Optional: May briefly see "Redirecting to Hub..." message

**Failure Indicators:**
- ❌ URL stays at `/student/`
- ❌ Gremlin login form appears
- ❌ Blank page or error message

**Dev Tools Check:**
```javascript
// In browser console, verify redirect happened:
console.log(window.location.pathname); // Should be '/hub/'
```

---

## Test 2: Auto-Login Deep Link → Should Load Portal

**Objective:** Verify that auto-login URLs load the student portal directly

**Steps:**
1. Open a new **incognito/private** browsing window
2. Navigate to: `/student/?auto=1&code=TESTCODE&name=TestStudent` on your deployed site
   (Replace TESTCODE with a valid student code from your system)
3. Observe the page load behavior

**Expected Results:**
- ✅ URL should **stay** at `/student/?auto=1&code=TESTCODE&name=TestStudent`
- ✅ Student dashboard should load directly
- ✅ No redirect to `/hub/`
- ✅ Student name should appear in the top bar
- ✅ Dashboard shows student's assignments and grades
- ✅ The gremlin login form should **never** appear

**Failure Indicators:**
- ❌ Redirects to `/hub/`
- ❌ Login form appears
- ❌ Error message or blank page

**Dev Tools Check:**
```javascript
// In browser console, verify:
console.log(window.location.search); // Should include '?auto=1&code=TESTCODE...'
console.log(document.querySelector('#loginView').classList.contains('hidden')); // Should be true
console.log(document.querySelector('#studentDashboardView').classList.contains('hidden')); // Should be false
```

---

## Test 3: Remembered Auth → Should Load Portal

**Objective:** Verify that remembered authentication (24h window) allows direct portal access

**Steps:**
1. In a **normal** (not incognito) browser window:
   a. Navigate to: `/hub/` on your deployed site
   b. Select a student from the dropdown
   c. Verify the portal loads
2. Close the browser completely (not just the tab)
3. Reopen the browser
4. Navigate to: `/student/` on your deployed site
5. Observe the page load behavior

**Expected Results:**
- ✅ URL should **stay** at `/student/`
- ✅ Student dashboard should load directly (no redirect)
- ✅ Student name from previous session should appear
- ✅ Dashboard shows student's assignments and grades

**Failure Indicators:**
- ❌ Redirects to `/hub/`
- ❌ Login form appears

**Dev Tools Check:**
```javascript
// In browser console, verify:
const auth = JSON.parse(localStorage.getItem('rc_auth'));
console.log(auth);
// Should show:
// { role: 'student', code: '<student-code>', expiresAt: <future timestamp> }
```

---

## Test 4: Expired Auth → Should Redirect to Hub

**Objective:** Verify that expired authentication triggers redirect

**Steps:**
1. In a **normal** browser window, log in as a student via Hub (see Test 3)
2. Open browser dev tools → Console
3. Manually expire the auth:
   ```javascript
   const auth = JSON.parse(localStorage.getItem('rc_auth'));
   auth.expiresAt = Date.now() - 1000; // Set to 1 second ago
   localStorage.setItem('rc_auth', JSON.stringify(auth));
   ```
4. Navigate to: `https://reinischclassroom.com/student/`
5. Observe the page load behavior

**Expected Results:**
- ✅ URL should change from `/student/` to `/hub/`
- ✅ Hub login page should appear
- ✅ Auth was detected as expired and redirect occurred

**Failure Indicators:**
- ❌ Portal loads despite expired auth
- ❌ Error or blank page

---

## Test 5: No Login Form Flash

**Objective:** Verify that the gremlin login form never flashes during any legitimate flow

**Steps:**
1. Perform Test 2 (auto-login deep link) again
2. Watch carefully during page load
3. Use browser dev tools to record/slow down the page load if needed

**Expected Results:**
- ✅ At no point should the login form with code/password fields be visible
- ✅ Either the dashboard loads directly, or "Redirecting to Hub..." message appears briefly

**Failure Indicators:**
- ❌ Login form flashes for even a split second
- ❌ Form fields are visible before redirect

**Dev Tools Check:**
```javascript
// In browser console, immediately after page load:
const loginView = document.querySelector('#loginView');
console.log(loginView.style.display); // Should be 'none' or hidden
console.log(loginView.classList.contains('hidden')); // Should be true
```

---

## Test 6: Script Loading Verification

**Objective:** Verify that `student-portal-redirect.js` is loaded on the page

**Steps:**
1. Navigate to: `/student/?auto=1&code=TESTCODE&name=TestStudent` on your deployed site
2. Open browser dev tools → Sources tab
3. Look in the file tree for: `web/student-portal-redirect.js`

**Expected Results:**
- ✅ `student-portal-redirect.js` should be present in the Sources panel
- ✅ Opening the file should show the redirect logic code
- ✅ Console should show log messages: `[student-portal-redirect] ...`

**Failure Indicators:**
- ❌ Script is not in the file tree
- ❌ No console log messages from the redirect script

**Dev Tools Check:**
```javascript
// In browser console:
const scripts = Array.from(document.scripts);
const redirectScript = scripts.find(s => s.src.includes('student-portal-redirect.js'));
console.log(redirectScript); // Should exist
console.log(redirectScript.src); // Should show the full URL
```

---

## Test 7: Different Path Variations

**Objective:** Verify that all URL variations are handled correctly

**Test each of these URLs in incognito mode:**

| URL Path | Expected Behavior |
|-----|-------------------|
| `/student` | Redirect to `/hub/` |
| `/student/` | Redirect to `/hub/` |
| `/student/?auto=1&code=TESTCODE` | Load portal |
| `/student?auto=1&code=TESTCODE` | Load portal |

Note: Test these paths on your deployed site (prepend your domain).

**Expected Results:**
- ✅ All paths redirect correctly OR load portal as appropriate
- ✅ No 404 errors
- ✅ No broken pages

---

## Success Criteria Summary

All tests pass when:
- ✅ `/student/` without auth → redirects to `/hub/`
- ✅ `/student/?auto=1&code=...` → loads portal
- ✅ `/student/` with valid remembered auth → loads portal
- ✅ `/student/` with expired auth → redirects to `/hub/`
- ✅ No gremlin login form ever appears
- ✅ `student-portal-redirect.js` is loaded and executing
- ✅ All URL path variations work correctly

---

## Troubleshooting

### Issue: Redirect script not loading
**Check:**
1. Verify `site/student/index.html` has: `<script src="../web/student-portal-redirect.js"></script>`
2. Verify file exists at: `site/web/student-portal-redirect.js`
3. Check browser Network tab for 404 errors
4. Check CSP errors in browser console

### Issue: Login form still appears
**Check:**
1. Verify redirect script is executing (check console logs)
2. Verify redirect conditions are met (no auto-login params, no valid auth)
3. Check that failsafe script respects `window.__redirectingToHub` flag

### Issue: Auto-login doesn't work
**Check:**
1. Verify URL has correct query parameters: `?auto=1&code=XXX&name=XXX`
2. Check browser console for errors in redirect script
3. Verify `student-portal-auto-login.js` is also loading

### Issue: Remembered auth doesn't work
**Check:**
1. Verify `localStorage` has `rc_auth` key
2. Check that `expiresAt` is in the future
3. Verify `role === 'student'`

---

## Notes

- All tests should be performed in both desktop and mobile browsers
- Tests should be repeated after deployment to verify production behavior
- Keep browser dev tools open during testing to catch any console errors
- If any test fails, document the exact behavior and browser/environment details
