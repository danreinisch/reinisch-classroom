# Student Portal Access Changes

## Overview

The Student Portal at `/student/` no longer shows a direct login screen with username/password fields. Instead, students must access the portal through the Classroom Hub at `/hub/`.

**Server-Side Enforcement (PR #252):** A Netlify Edge Function now enforces this redirect at the edge, preventing the legacy student portal UI from ever being served to clients accessing `/student/` without valid auto-login parameters.

**UI Cleanup (PR A):** The student portal now uses only the Portal B top bar for logout UI. The legacy header with duplicate logout button has been removed for students (kept for teacher center).

**Login Flash Elimination (PR A):** Valid deep-link URLs (`?auto=1&code=...`) now load directly to the dashboard without any login form flash. Invalid deep links (`?auto=1` without code) immediately redirect to the hub.

## Access Methods

### For Students (via Hub)

1. Navigate to https://reinischclassroom.com/hub/
2. Use the student dropdown selector in the hub to choose your name
3. The hub will automatically redirect you to your personalized student portal

### Auto-Login Deep Links (for teachers/admins)

Direct links to the student portal are still supported for administrative purposes:

```
https://reinischclassroom.com/student/?auto=1&code=S001&name=StudentName
```

These links bypass the hub and directly load the student dashboard.

## Implementation Details

### Server-Side Edge Function (Primary Enforcement)

**Location:** `netlify/edge-functions/student-entry-redirect.js`

The edge function runs at Netlify's edge (before any HTML is served) and:

1. Intercepts requests to `/student` and `/student/`
2. Checks for valid auto-login parameters (`auto=1` AND `code` present and non-empty)
3. **Allows** the request to proceed if valid auto-login params are detected
4. **Redirects** to `/hub/` with HTTP 302 if no valid params (before any UI is rendered)

**Configuration:** Registered in `netlify.toml`:
```toml
[[edge_functions]]
  path = "/student/*"
  function = "student-entry-redirect"
```

### Client-Side Redirect Logic (Fallback)

The redirect is implemented in `/site/web/student-portal-redirect.js`, which:

1. **Valid deep links** (`auto=1` AND non-empty `code`):
   - Hides `#loginView` immediately to prevent any login form flash
   - Sets `window.__deepLinkAutoLogin = true` flag
   - Allows portal to continue loading and boot normally

2. **Invalid deep links** (`auto=1` but missing/blank `code`):
   - Sets `window.__redirectingToHub = true` flag
   - Hides `#loginView` immediately
   - Shows "Redirecting to Hub..." message
   - Redirects to `/hub/` before any UI renders

3. **Remembered authentication** (valid `rc_auth` in localStorage):
   - Checks for valid student auth that hasn't expired
   - Allows portal to continue loading if valid

4. **No valid authentication**:
   - Shows redirect message and redirects to `/hub/`

### UI Cleanup (PR A)

The student portal UI has been simplified:

- **Student dashboard**: Only the Portal B top bar (`#portalTopBar`) with `#portalLogoutBtn` is shown
- **Legacy header**: Hidden for student view (still shown for teacher center)
- **No duplicate logout buttons**: Students see only one logout button in the Portal B top bar

### Failsafe Adjustments (PR A)

The failsafe script (`student-portal-failsafe.js`) has been updated to:

- **Deep-link mode detection**: Identifies valid deep links (`auto=1` and non-empty `code`)
- **Failsafe redirect**: If deep-link mode and `window.authReady` is still false after timeout, redirects to `/hub/` instead of showing login view
- **Preserve existing behavior**: Skips when `__redirectingToHub` is true (already redirecting)
- **No login flash**: Prevents the "phantom login screen" from flashing during deep-link loads or redirects

### Script Loading Order

Critical scripts load in this order in `/site/student/index.html`:

1. `student-portal-redirect.js` - Checks auth and redirects if needed
2. `student-portal-failsafe.js` - Ensures UI doesn't hang (respects redirect flag)
3. `student-portal-error-handler.js` - Global error capture
4. `student-portal-auto-login.js` - 24-hour remember-me bootstrap

## Testing

### Verification Command

Test the edge function redirect behavior:

```bash
# Should return HTTP/2 302 with Location: /hub/
curl -sSIL https://reinischclassroom.com/student/

# Should return HTTP/2 302 with Location: /hub/
curl -sSIL https://reinischclassroom.com/student

# Should return HTTP/2 200 (allowed through)
curl -sSIL 'https://reinischclassroom.com/student/?auto=1&code=S010'
```

### Manual Test Cases

1. **Direct navigation without auth**
   - Navigate to: `https://reinischclassroom.com/student/`
   - Expected: Immediate redirect to `/hub/`, no login form visible

2. **Valid auto-login deep link (PR A acceptance criteria)**
   - Navigate to: `https://reinischclassroom.com/student/?auto=1&code=S010&name=S010`
   - Expected: Student dashboard loads directly
   - Expected: **No login form flash at any point** ✅
   - Expected: Only one logout button visible (Portal B top bar) ✅

3. **Invalid deep link - missing code (PR A acceptance criteria)**
   - Navigate to: `https://reinischclassroom.com/student/?auto=1`
   - Expected: Immediate redirect to `/hub/` ✅
   - Expected: No login form visible at any point

4. **Invalid deep link - empty code (PR A acceptance criteria)**
   - Navigate to: `https://reinischclassroom.com/student/?auto=1&code=`
   - Expected: Immediate redirect to `/hub/` ✅
   - Expected: No login form visible at any point

5. **Remembered authentication**
   - Log in via hub as a student
   - Close browser
   - Reopen and navigate to: `https://reinischclassroom.com/student/`
   - Expected: If within 24-hour window, dashboard loads; otherwise redirect to hub

6. **Single logout button for students (PR A acceptance criteria)**
   - Log in as student (any method)
   - Expected: Only Portal B top bar logout button visible ✅
   - Expected: No legacy header logout button visible for students

7. **Teacher center still has logout button**
   - Log in as teacher
   - Expected: Legacy header with logout button is visible (teacher center not affected by PR A changes)

## Configuration

No configuration is needed. The redirect behavior is automatic based on URL parameters and localStorage state.

## Rollback

If the edge function needs to be disabled:

1. Remove or comment out the edge function declaration in `netlify.toml`:
   ```toml
   # [[edge_functions]]
   #   path = "/student/*"
   #   function = "student-entry-redirect"
   ```
2. Redeploy to Netlify

The client-side redirect in `student-portal-redirect.js` will continue to function as a fallback.

Alternatively, to fully revert to the original behavior:
1. Remove the edge function declaration from `netlify.toml`
2. Remove the `<script src="../web/student-portal-redirect.js"></script>` line from `/site/student/index.html`
3. Revert changes to `/site/web/student-portal-failsafe.js`

## Related Files

- `/netlify/edge-functions/student-entry-redirect.js` - **NEW**: Server-side edge redirect (primary enforcement)
- `/netlify.toml` - **UPDATED**: Edge function registration
- `/site/web/student-portal-redirect.js` - Client-side redirect logic (fallback)
- `/site/web/student-portal-failsafe.js` - Updated failsafe (respects redirect flag)
- `/site/student/index.html` - Updated script loading order
- `/site/hub/index.html` - Hub entry point (unchanged)
