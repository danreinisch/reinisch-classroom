# Phase 302C: Role Separation Documentation

## Overview
Phase 302C enhances auth robustness, ensures clear role separation, and strengthens admin gating.

## Role Storage Pattern

### Primary Auth Storage: `rc_auth` (localStorage)
All authentication uses a single `rc_auth` key in localStorage with the following structure:

```javascript
{
  role: 'student' | 'teacher' | 'admin' | 'substitute',
  code: 'user_identifier',
  name: 'Display Name',
  issuedAt: 1234567890,
  expiresAt: 1234567890  // 24-hour TTL
}
```

### Role Separation Strategy

**Key Principle:** Single auth key (`rc_auth`) with explicit role field prevents role bleed.

#### Why Single Key Works:
1. **Atomic updates**: Only one auth object exists at a time
2. **Clear ownership**: Role is explicit in the auth object
3. **No ambiguity**: Can't have conflicting roles from multiple keys
4. **Easy cleanup**: Single key to clear on logout

#### Previous Vulnerabilities (Now Fixed):
- ❌ Multiple auth keys (rc_auth_student, rc_auth_teacher) could conflict
- ❌ sessionStorage + localStorage could have different roles
- ❌ Legacy role keys (rc_user_role) could override current auth

#### Current Pattern (Phase 302C):
- ✅ Single `rc_auth` localStorage key
- ✅ Explicit role field checked at every guard
- ✅ Admin guard checks role and blocks students
- ✅ Student auto-login preserved via role check
- ✅ Teacher/admin share authentication but role is distinguished

## Auth Guard Implementation

### Admin Guard (`admin-guard.js`)
```javascript
// Phase 302C: Check rc_auth role
const authStr = localStorage.getItem('rc_auth');
const auth = JSON.parse(authStr);

// Block students from admin areas
if (auth.role === 'student') {
  window.location.replace('/');
}

// Require auth for admin pages
if (isAdminPage && !auth.role) {
  const returnUrl = encodeURIComponent(window.location.pathname);
  window.location.replace('/admin-login/?return=' + returnUrl);
}
```

### Hub Gate (`hub-gate.js`)
```javascript
// Phase 302C: Gracefully handle 401 from teacher-session
async function hasPendingTeacherSession() {
  try {
    const response = await fetch('/.netlify/functions/teacher-session', {
      method: 'GET',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      return data.ok === true;
    }

    // Phase 302C: 401 is expected when no session - not an error
    if (response.status === 401) {
      console.log('[hub-gate] No active teacher session (expected)');
    }

    return false;
  } catch (err) {
    // Phase 302C: Network error - treat as no session, don't break UI
    console.warn('[hub-gate] Could not check session:', err.message);
    return false;
  }
}
```

### App Shell (`app-shell.js`)
```javascript
// Phase 302C: Defensive UI updates
function updateAuthState() {
  const rail = document.querySelector('.app-shell-rail');
  if (!rail) return;  // Defensive exit

  try {
    const authStr = localStorage.getItem('rc_auth');
    const auth = authStr ? JSON.parse(authStr) : null;
    
    // All UI updates check for element existence
    const signOutBtn = rail.querySelector('[data-shell-action="signout"]');
    if (signOutBtn) {
      // Update visibility
    }
    
    const adminLink = rail.querySelector('[data-admin-only]');
    if (adminLink) {
      // Show/hide based on role
    }
  } catch (err) {
    console.error('[app-shell] Error:', err);
  }
}
```

## Defensive Coding Patterns

### Pattern 1: Null-Check Before DOM Operations
```javascript
// ❌ Unsafe
document.querySelector('.element').classList.add('show');

// ✅ Phase 302C: Safe
const element = document.querySelector('.element');
if (element) {
  element.classList.add('show');
}
```

### Pattern 2: Graceful 401 Handling
```javascript
// ❌ Throws on 401
const data = await response.json();

// ✅ Phase 302C: Safe
if (response.ok) {
  const data = await response.json();
  return data.ok === true;
}

// 401 is expected, not an error
if (response.status === 401) {
  console.log('No session (expected)');
}

return false;
```

### Pattern 3: Try-Catch for localStorage
```javascript
// ✅ Phase 302C: Protected localStorage access
try {
  const authStr = localStorage.getItem('rc_auth');
  if (authStr) {
    const auth = JSON.parse(authStr);
    // Use auth
  }
} catch (err) {
  console.error('Error reading auth:', err);
  return null;
}
```

## Admin Access Flow

### For Unauthenticated Users:
1. User visits `/admin/` or `/admin/index.html`
2. `admin-guard.js` runs (client-side)
3. Checks `rc_auth` - finds no role
4. Redirects to `/admin-login/?return=/admin/`
5. User logs in
6. Redirected back to `/admin/`

### For Students:
1. Student (with `rc_auth.role === 'student'`) visits `/admin/`
2. `admin-guard.js` runs
3. Detects `role === 'student'`
4. Immediately redirects to `/` (home)
5. Student never sees admin UI

### For Teachers:
1. Teacher visits `/admin/`
2. `admin-auth-guard.js` (edge function) checks cookie
3. No valid admin session → redirect to `/admin-login/`
4. Teacher cannot access admin (needs admin credentials)

### For Admins:
1. Admin (with admin cookie) visits `/admin/`
2. `admin-auth-guard.js` validates admin session
3. Access granted
4. `admin-guard.js` also passes (no redirect)

## Edge Function + Client Guard Defense in Depth

### Layer 1: Edge Function (`admin-auth-guard.js`)
- Validates HttpOnly session cookie
- Blocks access before page loads
- Redirects to `/admin-login/` if no valid session

### Layer 2: Client Script (`admin-guard.js`)
- Phase 302C: Checks `rc_auth` role
- Blocks students explicitly
- Redirects unauthenticated users with return URL
- Provides UX feedback before edge function

Both layers complement each other:
- Edge function prevents unauthorized API access
- Client guard provides immediate UX (no flash)
- Together ensure robust admin protection

## Student Auto-Login Preservation

Student auto-login is preserved through role-aware routing:

```javascript
// Student portal checks rc_auth role
const authStr = localStorage.getItem('rc_auth');
const auth = authStr ? JSON.parse(authStr) : null;

if (auth && auth.role === 'student') {
  // Auto-login student, skip login form
  loadStudentPortal(auth.code);
} else {
  // Show login form
  showLoginForm();
}
```

Key points:
- ✅ Students with valid `rc_auth` auto-login
- ✅ Teachers with `role: 'teacher'` don't auto-login as students
- ✅ No role bleed because role is explicit
- ✅ 24-hour TTL preserves session between visits

## Changes Made in Phase 302C

### 1. Enhanced `hub-gate.js`
- ✅ Graceful 401 handling in `hasPendingTeacherSession()`
- ✅ Defensive null-checks for DOM elements
- ✅ Improved error messages (logged as info, not errors)

### 2. Enhanced `admin-guard.js`
- ✅ Primary check uses `rc_auth` from localStorage
- ✅ Explicit student blocking with role check
- ✅ Redirect unauthenticated users to `/admin-login/?return=`
- ✅ Fallback to legacy sessionStorage for compatibility

### 3. Enhanced `app-shell.js`
- ✅ Defensive null-checks before toggle element access
- ✅ Fallback behavior if toggle doesn't exist
- ✅ All UI updates protected with element existence checks

### 4. Documentation
- ✅ This file documenting role separation pattern
- ✅ Clear explanation of single-key auth strategy
- ✅ Defensive coding patterns documented

## Testing Recommendations

### Test 1: Teacher Session 401 Handling
1. Visit `/hub/` without teacher session
2. Verify no console errors
3. Verify login gate appears
4. Verify UI remains functional

### Test 2: Student Admin Blocking
1. Log in as student (set `rc_auth` with `role: 'student'`)
2. Try to visit `/admin/`
3. Should redirect to `/` immediately
4. Try to visit `/admin-login/`
5. Should redirect to `/` immediately

### Test 3: Unauthenticated Admin Access
1. Clear all auth (remove `rc_auth`)
2. Visit `/admin/`
3. Should redirect to `/admin-login/?return=/admin/`
4. Login form should appear
5. After login, should return to `/admin/`

### Test 4: Missing DOM Elements
1. Remove optional elements (e.g., `#teacherResumeBanner`)
2. Load `/hub/`
3. Verify no runtime exceptions
4. Verify hub still functions normally

### Test 5: Role Separation
1. Log in as student
2. Verify student portal access works
3. Log out
4. Log in as teacher
5. Verify hub/teacher access works
6. Verify no student data bleeding into teacher view

## Security Considerations

### Threat Model
1. **Student accessing admin**: Blocked by admin-guard.js checking role
2. **Role bleed**: Prevented by single rc_auth key with explicit role
3. **401 breaking UI**: Fixed by defensive error handling
4. **Missing elements causing exceptions**: Fixed by null-checks
5. **Unauthenticated admin access**: Redirected to login with return URL

### Defense Layers
1. **Edge Function**: `admin-auth-guard.js` validates cookies
2. **Client Guard**: `admin-guard.js` validates localStorage role
3. **Defensive UI**: All DOM operations null-checked
4. **Graceful Errors**: 401 treated as expected state, not error

## Backwards Compatibility

Phase 302C maintains compatibility with:
- ✅ Existing `rc_auth` localStorage format
- ✅ 24-hour TTL for student sessions
- ✅ Teacher/admin session cookies
- ✅ Legacy sessionStorage fallback (cleanup path)
- ✅ Existing auth flow in student/teacher portals

No breaking changes to:
- Student auto-login behavior
- Teacher login workflow
- Admin authentication
- Substitute access patterns

## Conclusion

Phase 302C achieves:
1. ✅ Robust 401 handling (teacher-session endpoint)
2. ✅ Clear role separation (single rc_auth key with explicit role)
3. ✅ Defensive UI coding (null-checks throughout)
4. ✅ Correct admin gating (student blocking + redirect with return URL)

All goals met with minimal, surgical changes to existing code.
