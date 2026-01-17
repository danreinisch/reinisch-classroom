# Teacher Entry Redirect & Admin Upload Error Fix

## Summary

This PR fixes two production issues:

1. **Teacher Entry Redirect Reliability**: Ensures `/hub/?entry=teacher` redirects to `/teacher/` after authentication
2. **Admin Upload Error Visibility**: Surfaces incremental-deploy failures with status code and response body

## Changes Made

### 1. Hub Teacher Redirect Logic (site/hub/index.html)

Enhanced the redirect logic in both the login success handler (~line 3583) and session resume handler (~line 3743):

**Improvements:**
- **Priority-based redirect checks**: 
  1. `next` parameter pointing to `/teacher/*` (highest priority)
  2. `entry=teacher` parameter when not already on `/teacher/`
  3. Any other `next` parameter
  4. No redirect (stay on `/hub/`)
- **Loop prevention**: Guards against redirect loops by checking if already on `/teacher/` path
- **Debug logging**: Added conditional logging (gated by `window.rc_debug`) to diagnose redirect issues in production
- **Preserved parameters**: Both `entry` and `next` params are properly checked and preserved

**Code locations:**
- Login success: Lines ~3583-3625
- Session resume: Lines ~3743-3795

### 2. Admin Upload Error Messages (site/admin/app.js)

Enhanced error handling in the upload and delete operations:

**Improvements:**
- **Clear error formatting**: Status code shown prominently with response body
- **Comprehensive logging**: All errors logged to both console and on-screen log
- **Consistent handling**: Same error format for upload (~line 388) and delete (~line 616) operations
- **Full error details**: Console.error logs complete error objects for debugging

**Example error message format:**
```
Upload failed with status 401:

{"error":"Bad credentials","message":"GitHub API authentication failed"}
```

## Testing

### Manual Testing - Teacher Redirect

1. **Test entry=teacher redirect:**
   ```
   1. Navigate to: https://reinischclassroom.com/hub/?entry=teacher
   2. Log in with teacher credentials
   3. Verify redirect to /teacher/ occurs
   4. Check browser console for "[Teacher Auth] entry=teacher detected, redirecting to /teacher/"
   ```

2. **Test next=/teacher/* redirect:**
   ```
   1. Navigate to: https://reinischclassroom.com/hub/?next=/teacher/students
   2. Log in with teacher credentials
   3. Verify redirect to /teacher/students occurs
   4. Check console for "[Teacher Auth] Redirecting to next (teacher path) on login:"
   ```

3. **Test no redirect (normal flow):**
   ```
   1. Navigate to: https://reinischclassroom.com/hub/
   2. Click "Teacher Center" button in gate
   3. Log in with teacher credentials
   4. Verify stays on /hub/ with teacher UI visible
   5. No redirect should occur
   ```

4. **Test loop prevention:**
   ```
   1. Already logged in as teacher
   2. Navigate directly to: https://reinischclassroom.com/teacher/
   3. Verify no redirect loop occurs
   4. Page loads normally
   ```

### Manual Testing - Admin Upload Errors

1. **Test 401 error visibility:**
   ```
   1. Log in to Admin UI at /admin/
   2. Try to upload a presentation (will fail if GitHub token is invalid)
   3. Verify alert shows: "Upload failed with status 401: ..." with response body
   4. Verify console.error shows full error details
   5. Verify on-screen log shows "ERROR: Upload failed with status 401: ..."
   ```

2. **Test success flow unchanged:**
   ```
   1. Upload with valid credentials
   2. Verify success flow works as before
   3. No extra error messages should appear
   ```

### Debug Mode

To enable debug logging for redirect decisions in production:

```javascript
// In browser console before navigating to /hub/?entry=teacher
window.rc_debug = true;
```

This will log redirect decision details:
```
[Teacher Redirect Debug] {
  currentPath: '/hub/',
  entryParam: 'teacher',
  nextParam: null,
  alreadyOnTeacher: false
}
[Teacher Auth] entry=teacher detected, redirecting to /teacher/
```

## Automated Tests

Existing Playwright tests validate the redirect logic:
- `tests/teacher-entry-redirect.spec.js` - Comprehensive redirect scenarios
- Tests cover: entry=teacher, next=/teacher/*, no redirect, loop prevention

Run with:
```bash
npm test -- tests/teacher-entry-redirect.spec.js
```

## Rollback Plan

If issues occur, revert to previous commit:
```bash
git revert HEAD
git push origin main
```

The changes are isolated to two files and don't affect core authentication logic.

## Notes

- No backend or environment variable changes required
- Changes are client-side only (hub/index.html and admin/app.js)
- Debug logging is production-safe (only activates when `window.rc_debug = true`)
- Error message improvements don't change success flow behavior
