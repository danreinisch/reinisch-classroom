# PR1 Admin Not Configured UX - Visual Guide

## Problem Statement
Previously, when admin environment variables were not configured:
- Users visiting `/admin` saw raw "Admin not configured" text or were redirected to `/admin-not-configured`
- The flow was confusing and didn't provide clear guidance on how to fix the issue

## Solution Implemented

### Flow When Admin Env Vars Missing

```
User visits /admin
        ↓
Edge guard (admin-auth-guard.js)
  - Checks ADMIN_SESSION_SECRET
  - Missing? → Redirect to /admin-login
        ↓
/admin-login page loads
        ↓
admin-login.js calls admin-session-check
  - Returns 503 with ADMIN_NOT_CONFIGURED
        ↓
Display friendly setup message:

╔════════════════════════════════════════════╗
║  ⚠️ Admin Setup Required                   ║
║                                            ║
║  The admin interface is not configured.    ║
║  Required environment variables missing:   ║
║                                            ║
║  • ADMIN_SESSION_SECRET                    ║
║  • ADMIN_USER                              ║
║  • ADMIN_PASS                              ║
║                                            ║
║  Configure these in:                       ║
║  Netlify → Site settings →                 ║
║  Environment variables                     ║
║                                            ║
║  See documentation for details.            ║
╚════════════════════════════════════════════╝

[Login form is disabled]
```

### Flow When Admin Env Vars Present

```
User visits /admin
        ↓
Edge guard checks ADMIN_SESSION_SECRET
  - Present ✓
  - Checks session cookie
        ↓
No session?
  - Redirect to /admin-login
  - Show normal login form
        ↓
Valid session?
  - Allow access
  - Load Admin Uploader
```

## Key Improvements

1. **No Raw Error Text**: Users never see plain "Admin not configured" text
2. **Clear Guidance**: Setup message shows exactly what env vars are needed
3. **Actionable Instructions**: Tells users where to configure (Netlify settings)
4. **Unified Flow**: All /admin access goes through /admin-login for better UX
5. **Backwards Compatible**: /admin-not-configured page still exists if needed

## Headers Verification

All admin routes include:
- `Cache-Control: no-store, no-cache, must-revalidate`
- `X-Robots-Tag: noindex`

Applied to:
- `/admin` and `/admin/*` (via site/_headers)
- `/admin-login` (via site/_headers)
- Edge function redirects (via admin-auth-guard.js)
- Function responses (via admin-session-check.js)

## Documentation Added

Created `docs/README.md` with:
- Quick setup guide for Netlify
- Path: Site settings → Environment variables
- List of required vars
- Link to detailed ADMIN_SETUP.md

## Testing Notes

Local testing limitations:
- Edge functions only run on Netlify (not in local dev)
- Playwright tests run against static server (no edge functions)
- Full flow requires Deploy Preview on Netlify

CI/CD:
- Lint checks: ✅ Passed (no errors)
- Playwright tests: Run in CI with browser support
- Deploy Preview: Will show actual behavior

## Deploy Preview Verification Checklist

When Deploy Preview is ready:
1. Visit /admin without env vars configured
2. Should redirect to /admin-login
3. Should show "Admin Setup Required" message
4. Should list ADMIN_SESSION_SECRET, ADMIN_USER, ADMIN_PASS
5. Form should be disabled
6. No console errors (except network debug logs)
7. Hard refresh should maintain same behavior

With env vars configured:
1. Visit /admin without session
2. Should redirect to /admin-login
3. Should show normal login form
4. After login, should show Admin Uploader
