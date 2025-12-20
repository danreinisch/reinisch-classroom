# Student Portal Routing Fix

## Problem Statement

Production users visiting `https://reinischclassroom.com/student/` were seeing the legacy "Student Portal" code+password login UI (the "gremlin") instead of being redirected to the Hub. Investigation revealed that `student-portal-redirect.js` was not being loaded, indicating that `/student/` was being served by a different artifact than `site/student/index.html`.

## Solution

### Routing Configuration

Updated `site/_redirects` to explicitly handle all variations of the `/student` path:

```
/student           /site/student/index.html  200
/student/          /site/student/index.html  200
/student/*         /site/student/index.html  200
```

**Why this matters:**
- `/student` (no trailing slash) and `/student/` (with trailing slash) are treated as different paths by Netlify
- Without an explicit rule for `/student/`, Netlify might fall through to a different handler
- Now all three patterns explicitly serve `/site/student/index.html`, which contains the redirect logic

### Client-Side Redirect Logic

The redirect logic is implemented in `/site/web/student-portal-redirect.js`, which is loaded early in `/site/student/index.html` (line 811):

```html
<script src="../web/student-portal-redirect.js"></script>
```

**This script performs the following checks (in order):**

1. **Check for valid auto-login deep link:**
   - URL parameters: `?auto=1&code=...`
   - If present → Allow access to portal (no redirect)

2. **Check for valid remembered authentication:**
   - localStorage key: `rc_auth`
   - Must be: `role === 'student'`, valid `code`, not expired
   - If valid → Allow access to portal (no redirect)

3. **No valid authentication:**
   - Sets flag: `window.__redirectingToHub = true`
   - Hides login view immediately (CSP-compliant styling)
   - Shows "Redirecting to Hub..." message
   - Redirects to `/hub/` using `window.location.replace()`

## Behavior

### Scenario 1: Direct navigation without authentication
**User action:** Navigate to `https://reinischclassroom.com/student/`

**Expected behavior:**
1. Netlify serves `/site/student/index.html` (200 rewrite)
2. Page loads, `student-portal-redirect.js` executes
3. No auto-login params found
4. No valid remembered auth found
5. Login view is hidden, "Redirecting to Hub..." message appears
6. Browser redirects to `/hub/`

**Result:** User sees Hub login dropdown instead of gremlin

### Scenario 2: Auto-login deep link
**User action:** Navigate to `https://reinischclassroom.com/student/?auto=1&code=S033&name=S033`

**Expected behavior:**
1. Netlify serves `/site/student/index.html` (200 rewrite)
2. Page loads, `student-portal-redirect.js` executes
3. Valid auto-login params detected
4. Script returns early, no redirect
5. Page continues loading, portal dashboard appears

**Result:** Student sees their dashboard immediately

### Scenario 3: Remembered authentication
**User action:** 
1. User logs in via Hub as student
2. User closes browser
3. Within 24 hours, user navigates to `https://reinischclassroom.com/student/`

**Expected behavior:**
1. Netlify serves `/site/student/index.html` (200 rewrite)
2. Page loads, `student-portal-redirect.js` executes
3. No auto-login params
4. Valid remembered auth found in localStorage
5. Script returns early, no redirect
6. Page continues loading, portal dashboard appears

**Result:** Student sees their dashboard immediately (remembered session)

## Why Not Server-Side Redirect?

You might ask: "Why not redirect `/student/` → `/hub/` at the Netlify level?"

**Answer:** Netlify redirects cannot conditionally redirect based on query parameters.

If we added:
```
/student/    /hub/    302
```

Then **both** of these would redirect:
- `/student/` → `/hub/` ✅ (wanted)
- `/student/?auto=1&code=S033` → `/hub/?auto=1&code=S033` ❌ (unwanted)

The auto-login deep link would break because it would redirect to the Hub with query params that the Hub doesn't understand.

**Therefore, the client-side approach is necessary** to:
1. Preserve deep-link functionality
2. Check for remembered authentication
3. Only redirect when neither condition is met

## Security & Performance

### CSP Compliance
The redirect script uses only external JavaScript files (no inline scripts), maintaining strict CSP compliance.

The hiding of the login view during redirect is done by:
1. Creating an external `<style>` element with CSP-compliant styles
2. Injecting it into `<head>` before the DOM loads
3. This prevents the gremlin login UI from flashing

### Performance
The redirect script:
- Loads early in the document (before main content)
- Executes immediately (not deferred)
- Redirects before the page fully renders (if needed)
- Minimal overhead: ~3KB total

### Failsafe Protection
The `student-portal-failsafe.js` script (loaded after redirect script) respects the `window.__redirectingToHub` flag and will not show the login view if a redirect is in progress.

## Testing

### Manual Test Cases

#### Test 1: Direct navigation without auth (incognito)
1. Open incognito/private browsing window
2. Navigate to: `https://reinischclassroom.com/student/`
3. **Expected:** Should redirect to `/hub/` without showing gremlin login
4. **Verify:** URL changes to `/hub/`, Hub login dropdown is visible

#### Test 2: Auto-login deep link
1. Open incognito/private browsing window
2. Navigate to: `https://reinischclassroom.com/student/?auto=1&code=S033&name=S033`
3. **Expected:** Should load student dashboard directly, no redirect
4. **Verify:** URL stays at `/student/?auto=1&code=S033&name=S033`, dashboard visible

#### Test 3: Remembered authentication
1. Log in via Hub as student
2. Note the current student code
3. Close browser
4. Within 24 hours, navigate to: `https://reinischclassroom.com/student/`
5. **Expected:** Should load student dashboard directly, no redirect
6. **Verify:** Dashboard loads with correct student info

#### Test 4: Expired authentication
1. Log in via Hub as student
2. Manually edit localStorage `rc_auth` to set `expiresAt` to a past timestamp
3. Navigate to: `https://reinischclassroom.com/student/`
4. **Expected:** Should redirect to `/hub/` (auth expired)
5. **Verify:** URL changes to `/hub/`

#### Test 5: No login flash
1. Use any valid auto-login or remembered auth method
2. Navigate to: `https://reinischclassroom.com/student/?auto=1&code=TEST`
3. **Expected:** No visible login form at any point during load
4. **Verify:** Only dashboard or "Redirecting..." message appears

### Automated Testing

The repository can add a simple Playwright test to verify routing:

```javascript
// tests/student-routing.spec.js
import { test, expect } from '@playwright/test';

test('Direct navigation to /student/ redirects to /hub/', async ({ page }) => {
  // Clear localStorage to simulate no remembered auth
  await page.goto('https://reinischclassroom.com/student/');
  
  // Should redirect to hub
  await expect(page).toHaveURL(/\/hub\//);
});

test('Auto-login deep link loads student portal', async ({ page }) => {
  await page.goto('https://reinischclassroom.com/student/?auto=1&code=TEST&name=TEST');
  
  // Should stay on student portal
  await expect(page).toHaveURL(/\/student\//);
  
  // Should see dashboard (not login form)
  const loginView = page.locator('#loginView');
  await expect(loginView).toBeHidden();
});
```

## Rollback

If this fix needs to be reverted:

1. Remove the explicit `/student/` rule from `site/_redirects`:
   ```diff
   - /student/          /site/student/index.html  200
   ```

2. Optionally remove or disable `student-portal-redirect.js`:
   ```diff
   - <script src="../web/student-portal-redirect.js"></script>
   ```

## Related Files

- **`site/_redirects`** - Netlify redirect configuration (explicitly handles `/student/`)
- **`site/student/index.html`** - Student portal page (loads redirect script)
- **`site/web/student-portal-redirect.js`** - Client-side redirect logic
- **`site/web/student-portal-failsafe.js`** - Failsafe timer (respects redirect flag)
- **`STUDENT_PORTAL_REDIRECT.md`** - Original documentation for redirect feature

## References

- Original PR: "Remove/disable direct Student Portal code+password login UI"
- Netlify Redirects Documentation: https://docs.netlify.com/routing/redirects/
- CSP Stage 3B: Removed inline scripts for strict CSP compliance
