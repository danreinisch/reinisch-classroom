# Admin Redirect/Auth and Student Portal Flicker Fix

## Overview
This PR addresses two critical UX issues in the Reinisch Classroom application:
1. Admin area authentication and redirect flow
2. Student portal login UI flicker and double-login issues

## Issues Fixed

### 1. Admin Redirect/Auth
**Problem**: Admin area redirected unauthenticated users to `/hub/?entry=teacher`, causing confusion. Users with teacher sessions but no admin privileges would bounce between pages.

**Solution**:
- Created dedicated `/admin-login` page with clear messaging
- Updated all redirect logic to point to `/admin-login` with diagnostic reason parameter
- Enhanced Teacher Center Admin button to check session before navigation
- Added user-friendly error messages for different failure scenarios

### 2. Student Portal Flicker
**Problem**: Student portal showed login form briefly before checking authentication, causing visible flicker. Race conditions could trigger multiple auth checks.

**Solution**:
- Added dedicated loading view shown by default
- Login view hidden until auth check completes
- Implemented `window.__rcStudentAuthInProgress` flag to prevent race conditions
- Ensured all API calls use relative URLs with `credentials: "include"`

## Technical Changes

### Files Modified
1. **netlify/edge-functions/admin-auth-guard.js**
   - Changed redirect destination from `/hub/` to `/admin-login/`
   - Added `reason` query parameter support

2. **site/admin-login/index.html** (NEW)
   - Clean, accessible admin login required page
   - Diagnostic message display based on query parameter
   - Links to Teacher Center and home page

3. **site/admin/gate.js**
   - Updated client-side redirect to `/admin-login`
   - Consistent with edge function behavior

4. **site/hub/index.html**
   - Admin button now checks teacher session before navigation
   - Prevents unnecessary redirects
   - Better UX for users without admin access

5. **site/student/index.html**
   - Added `#loadingView` element shown by default
   - Login view hidden initially
   - Smooth transition between states

6. **site/web/student-portal.js**
   - Added `window.__rcStudentAuthInProgress` flag
   - Updated `showLogin()` and `showStudentDashboard()` to handle loading state
   - Added `credentials: "include"` to all fetch calls
   - Removed unused legacy loading functions
   - Improved error handling

7. **netlify.toml**
   - Configured `/admin-login` route to serve index.html
   - Removed legacy redirects

### Tests Added/Updated
1. **tests/admin-access-guard.spec.js**
   - Updated to validate `/admin-login` redirect
   - Added test for diagnostic message display
   - Validates clear user messaging

2. **tests/student-portal-flicker.spec.js** (NEW)
   - Tests loading view visibility on page load
   - Validates smooth transition from loading to login
   - Checks auth flag is set during initialization
   - Verifies all API calls use relative URLs

## Security Considerations
- All changes passed CodeQL security scan (0 alerts)
- No new security vulnerabilities introduced
- Credentials properly included in same-origin fetch calls
- No secrets or sensitive data exposed in diagnostic messages

## Testing Notes
- Automated tests added for both fixes
- Tests validate expected behavior in local environment
- Full end-to-end testing requires deploy preview:
  - Edge functions only run on Netlify
  - Session cookies need production environment

## Manual Verification Steps

### Admin Flow
1. Navigate to `/admin` while not logged in
2. Should redirect to `/admin-login` with diagnostic message
3. Click "Go to Teacher Center" → should land on `/hub/?entry=teacher`
4. After Teacher Center login, click Admin button
5. Should navigate to `/admin` successfully
6. Refresh `/admin` → should persist without redirect

### Student Portal Flow
1. Navigate to `/student/` in fresh incognito window
2. Should see loading spinner (⏳), NOT login form
3. After ~1-2 seconds, should transition to login form smoothly
4. No visible flicker or double UI switches
5. Login with valid credentials
6. Should show dashboard immediately
7. Refresh page → should persist session (loading → dashboard)
8. Close tab → reopen → should show loading → login (session-only auth)

## Performance Impact
- Minimal: Single flag check added to init flow
- Loading view adds ~1KB to HTML
- No additional network requests
- Race condition prevention improves reliability

## Browser Compatibility
- All changes use standard Web APIs
- No new browser-specific features required
- Compatible with modern browsers (Chrome, Firefox, Safari, Edge)

## Rollback Plan
If issues arise:
1. Revert PR commits
2. Admin flow reverts to `/hub` redirect
3. Student portal reverts to showing login immediately
4. No database or environment changes needed

## Related Documentation
- ADMIN_LOGIN_ERROR_CODES.md (existing)
- STUDENT_PORTAL_REDIRECT.md (existing)
- This implementation follows patterns from PR #336 and related fixes

## Security Summary
✅ CodeQL scan passed with 0 alerts
✅ No new vulnerabilities introduced
✅ Credentials properly handled in fetch calls
✅ No sensitive data in diagnostic messages
