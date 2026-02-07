# Netlify Preview Deploy Compatibility Guide

## Overview

This application is fully compatible with Netlify preview deploys (`*.netlify.app`). All Netlify Function calls use **same-origin relative URLs** to ensure session cookies and authentication work correctly across all deployment environments.

## How It Works

### Cookie Scoping
Session cookies set by Netlify Functions are scoped to the **request host**:
- Production cookies: Only sent to `reinischclassroom.com`
- Preview cookies: Only sent to `deploy-preview-123--site.netlify.app`
- Local cookies: Only sent to `localhost:8888`

### Same-Origin Relative URLs

All Netlify Function calls use relative URLs without hardcoded domains:

✅ **CORRECT:**
```javascript
fetch('/.netlify/functions/teacher-session', {
  method: 'GET',
  credentials: 'include'
})
```

❌ **INCORRECT:**
```javascript
fetch('https://reinischclassroom.com/.netlify/functions/teacher-session', {
  method: 'GET',
  credentials: 'include'
})
```

The incorrect version would fail on preview deploys with `401 Unauthorized` because:
1. The preview deploy sets cookies scoped to `*.netlify.app`
2. But the fetch goes to `reinischclassroom.com`
3. Cookies don't cross domain boundaries
4. The function sees no session cookie and returns 401

## Supported Environments

The application works identically on:

| Environment | URL Example | Session Cookies |
|------------|-------------|-----------------|
| **Production** | `https://reinischclassroom.com/hub/` | `reinischclassroom.com` |
| **Preview** | `https://deploy-preview-42--site.netlify.app/hub/` | `*.netlify.app` |
| **Localhost** | `http://localhost:8888/hub/` | `localhost` |

## Implementation Details

### Hub (`/site/hub/index.html`)
- `teacher-session` - Check existing teacher session
- `teacher-login` - Teacher authentication
- `student-login` - Student authentication
- `student-roster` - Load student list
- `fetch-html-url` - Fetch external HTML content

### Student Portal (`/site/student/index.html`)
- `student-login` - Student authentication

### Teacher Portal (`/site/teacher/index.html`)
- `teacher-login` - Teacher authentication
- `assignment-create` - Create assignments
- `assignments-admin-list` - List assignments
- `submissions-list` - View submissions

### Diagnostics (`/site/web/diagnostics.js`)
- `client-error` - Error telemetry

## Configuration

**No special configuration is needed** for preview deploys to work. The same code works across all environments because:

1. **No hardcoded domains** in client-side code
2. **No environment variables** control base URLs
3. **Relative URLs** automatically resolve to the current host
4. **Cookies** automatically scope to the request host

## Testing Preview Deploys

1. Create a pull request
2. Netlify automatically creates a preview deploy
3. Visit the preview URL (e.g., `https://deploy-preview-123--site.netlify.app/hub/`)
4. Log in as a teacher or student
5. Authentication should work exactly as on production

## Troubleshooting

### 401 Unauthorized on Preview Deploys

If you see 401 errors on preview deploys, check:

1. **Are you using absolute URLs?**
   - Search code for `https://reinischclassroom.com/.netlify/functions/`
   - Replace with relative URLs: `/.netlify/functions/`

2. **Are cookies being set?**
   - Open browser DevTools → Application → Cookies
   - Verify cookies exist for the preview domain
   - Check `HttpOnly`, `Secure`, `SameSite` attributes

3. **Are you mixing environments?**
   - Don't copy cookies from production to preview
   - Always log in fresh on each environment

## Maintenance

When adding new Netlify Function calls:

1. ✅ **Always use relative URLs:** `/.netlify/functions/new-function`
2. ✅ **Include credentials:** `credentials: 'include'` for authenticated endpoints
3. ✅ **Add a comment:** Explain same-origin requirement for future developers
4. ❌ **Never hardcode domains:** No `https://reinischclassroom.com` in fetch URLs
5. ❌ **Never use environment variables for base URLs:** Breaks preview compatibility

## Related Documentation

- [DEPLOYMENT_VERIFICATION.md](./DEPLOYMENT_VERIFICATION.md) - Full deployment checklist
- [SESSION_HARDENING_SUMMARY.md](./SESSION_HARDENING_SUMMARY.md) - Session security
- [AUTH_MIGRATION_AND_GUARDRAILS.md](./AUTH_MIGRATION_AND_GUARDRAILS.md) - Auth architecture
