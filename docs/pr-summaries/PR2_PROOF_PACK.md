# PR2 Deployment Verification - Proof Pack

## Overview
This document provides instructions for verifying the admin-not-configured UX improvements in a Deploy Preview environment.

## Verification Steps

### 1. Deploy Preview Setup
1. Create a Deploy Preview from the `copilot/fix-admin-not-configured-ux` branch
2. **Ensure `ADMIN_SESSION_SECRET` is NOT set** in the Deploy Preview context
   - Go to Netlify Dashboard → Site settings → Environment variables
   - Verify that `ADMIN_SESSION_SECRET` is either:
     - Not set at all, OR
     - Only scoped to Production (not Deploy previews)

### 2. Navigate to Admin Area
1. Open the Deploy Preview URL in your browser
2. Navigate to `/admin/` 
   - Example: `https://deploy-preview-XXX--your-site.netlify.app/admin/`

### 3. Expected Behavior
You should see the **Admin Not Configured** page with:

- ⚠️ Warning icon in emerald theme styling
- Clear heading: "Admin Not Configured"
- Explanation text about why admin is disabled
- **Required Environment Variables** section listing:
  - `ADMIN_SESSION_SECRET`
  - `ADMIN_USER`
  - `ADMIN_PASS`
- **How to Configure in Netlify** section with 5 numbered steps
- Navigation buttons:
  - "Go to Home" (primary button)
  - "Admin Login" (secondary button)
- Note about Deploy Preview context at the bottom

### 4. Browser Console Check
1. Open browser DevTools (F12)
2. Go to Console tab
3. **Hard reload the page** (Ctrl+Shift+R or Cmd+Shift+R)
4. Wait 2-3 seconds
5. Verify: **No relevant red errors**
   - CSP warnings are expected/acceptable
   - 503 status on session-check is expected (admin not configured)
   - Look for JavaScript errors or functional issues

### 5. Network Tab Verification
1. Open DevTools → Network tab
2. Hard reload the page
3. Check the response for `/admin-not-configured/`:
   - Status: 200 OK
   - Headers should include:
     - `Cache-Control: no-store, no-cache, must-revalidate`
     - `X-Robots-Tag: noindex`

### 6. Navigation Testing
1. Click "Go to Home" button → should navigate to `/`
2. Navigate back to `/admin/` → should redirect to `/admin-not-configured/`
3. Click "Admin Login" button → should navigate to `/admin-login/`

### 7. Screenshots to Include
Take screenshots showing:
1. The admin-not-configured page (full page screenshot recommended)
2. Browser console with no relevant errors (after hard reload + 2-3s wait)
3. Network tab showing the 200 response for `/admin-not-configured/`

## Proof Pack Checklist

For the PR description, include:

- [ ] Deploy Preview URL (e.g., `https://deploy-preview-XXX--site.netlify.app`)
- [ ] Commit SHA of the deployed code
- [ ] Screenshot of `/admin-not-configured/` page
- [ ] Screenshot of browser console (2-3s after hard reload, showing no relevant errors)
- [ ] Confirmation that ADMIN_SESSION_SECRET is not configured in Deploy Preview
- [ ] Verification that navigation links work correctly

## Example PR Description Addition

```markdown
## Deploy Preview Verification

**Deploy Preview URL:** https://deploy-preview-XXX--reinisch-classroom.netlify.app
**Commit SHA:** 83908fe

### Screenshots

#### Admin Not Configured Page
![Admin Not Configured](screenshot-url)

#### Browser Console (No Errors)
![Console Clean](console-screenshot-url)

### Test Results
- ✅ /admin/ redirects to /admin-not-configured/ when ADMIN_SESSION_SECRET not set
- ✅ Page displays with correct styling and emerald theme
- ✅ All required environment variables listed
- ✅ Netlify setup instructions displayed
- ✅ Navigation buttons work correctly
- ✅ No relevant console errors after hard reload + 2-3s wait
- ✅ Proper headers set (Cache-Control: no-store, X-Robots-Tag: noindex)
```

## Troubleshooting

### If page doesn't load
- Verify the branch is deployed correctly
- Check that static files are published from the `site/` directory
- Confirm netlify.toml is present and correct

### If you're redirected to admin-login instead
- ADMIN_SESSION_SECRET is likely still set in the Deploy Preview context
- Remove it or change its scope to Production only

### If you see console errors
- Verify which errors are relevant vs. expected (CSP, external resource loading)
- Check that all JavaScript files are loading correctly
- Confirm the emerald theme CSS is loaded

## Notes
- The admin-not-configured page is intentionally fail-closed for security
- No secrets or environment variable values are ever displayed
- The page is designed to be helpful while maintaining security
