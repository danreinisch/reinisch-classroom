# Student Portal Access Changes

## Overview

The Student Portal at `/student/` no longer shows a direct login screen with username/password fields. Instead, students must access the portal through the Classroom Hub at `/hub/`.

**Server-Side Enforcement (PR #252):** A Netlify Edge Function now enforces this redirect at the edge, preventing the legacy student portal UI from ever being served to clients accessing `/student/` without valid auto-login parameters.

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

1. Checks for valid auto-login parameters (`auto=1` and `code`)
2. Checks for valid remembered authentication in localStorage
3. Redirects to `/hub/` if neither condition is met
4. Hides `#loginView` immediately when redirecting to prevent UI flash (CSP-compliant)

### Failsafe Adjustments

The failsafe script (`student-portal-failsafe.js`) has been updated to:

- Not show the login view when a redirect to hub is in progress
- Prevent the "phantom login screen" from flashing during redirects

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
   - Expected: Immediate redirect to `/hub/`

2. **Auto-login deep link**
   - Navigate to: `https://reinischclassroom.com/student/?auto=1&code=S001&name=TestStudent`
   - Expected: Student dashboard loads directly, no redirect, no login form flash

3. **Remembered authentication**
   - Log in via hub as a student
   - Close browser
   - Reopen and navigate to: `https://reinischclassroom.com/student/`
   - Expected: If within 24-hour window, dashboard loads; otherwise redirect to hub

4. **No login form flash**
   - Use any valid auto-login method
   - Expected: No visible login form at any point during the flow

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
