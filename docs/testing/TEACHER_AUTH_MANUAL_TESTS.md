# Teacher Authentication Manual Testing Guide

This document provides manual testing procedures for verifying the teacher authentication improvements in PR 307.

## Overview

PR 307 adds diagnostics and improves CORS handling for teacher authentication without loosening CSP or exposing secrets.

## Changes Made

1. **Explicit SESSION_SECRET validation** - Returns 500 with clear error message if missing
2. **Request metadata logging** - Logs host/origin for debugging
3. **Cookie presence logging** - Logs boolean tc cookie presence (no token values)
4. **Set-Cookie diagnostics** - Logs that Set-Cookie header is being sent
5. **CORS credentials** - Adds Access-Control-Allow-Credentials header

## Prerequisites

- Access to Netlify Functions logs (Netlify dashboard or local dev server)
- SESSION_SECRET environment variable configured
- Valid teacher credentials in Supabase

## Test Cases

### Test 1: Teacher Login Flow

**Objective**: Verify successful teacher login establishes a session and sets cookie correctly.

**Steps**:
1. Navigate to `/hub/?entry=teacher`
2. Enter valid teacher credentials
3. Click "Sign In"
4. Check Netlify Functions logs for:
   ```
   [teacher-login] [...] Request received - host: ..., origin: ...
   [teacher-login] [...] Successful login for user: ... role: teacher
   [teacher-login] [...] Set-Cookie header will be sent (secure=true, SameSite=Lax, HttpOnly, Path=/)
   ```
5. Verify response includes `Set-Cookie` header with:
   - `tc=...` (token value)
   - `Path=/`
   - `HttpOnly`
   - `SameSite=Lax`
   - `Secure` (on production)

**Expected Result**: 
- Login succeeds with 200 response
- Cookie is set correctly
- Hub loads teacher interface
- Logs show diagnostic information without exposing token

### Test 2: Session Persistence

**Objective**: Verify teacher session persists across page refreshes.

**Steps**:
1. Complete Test 1 (successful login)
2. Refresh the page
3. Check Netlify Functions logs for:
   ```
   [teacher-session] [...] Request received - host: ..., origin: ..., tc cookie present: true
   [teacher-session] [...] Valid session for user: ...
   ```

**Expected Result**:
- Page loads directly to teacher interface
- No re-login required
- Logs show cookie was present and valid

### Test 3: No Session State

**Objective**: Verify graceful handling when no session exists.

**Steps**:
1. Clear all cookies for the site
2. Navigate to `/hub/`
3. Check Netlify Functions logs for:
   ```
   [teacher-session] [...] Request received - host: ..., origin: ..., tc cookie present: false
   [teacher-session] [...] Unauthorized access attempt
   ```

**Expected Result**:
- Hub shows login gate or prompts for login
- 401 response is handled gracefully
- No error banners displayed
- Logs show cookie was not present

### Test 4: SESSION_SECRET Missing (Local Test Only)

**Objective**: Verify explicit error when SESSION_SECRET is missing.

**Steps**:
1. Temporarily remove SESSION_SECRET from environment
2. Attempt to call `teacher-login` or `teacher-session`
3. Check logs for:
   ```
   [teacher-login] [...] Server not configured: SESSION_SECRET environment variable is missing
   ```
   or
   ```
   [teacher-session] [...] Server not configured: SESSION_SECRET environment variable is missing
   ```

**Expected Result**:
- 500 error returned
- Clear error message: "Server not configured: SESSION_SECRET missing"
- Logs clearly indicate SESSION_SECRET is missing

### Test 5: CORS Credentials

**Objective**: Verify CORS headers include credentials support.

**Steps**:
1. Make a request to `teacher-session` or `teacher-login` from allowed origin
2. Check response headers include:
   - `Access-Control-Allow-Origin: <origin>`
   - `Access-Control-Allow-Credentials: true`
   - `Vary: Origin`

**Expected Result**:
- CORS headers properly set when origin is allowed
- Credentials header present when origin is allowed
- Browser can send cookies with cross-origin requests

## Curl Smoke Test

Test authentication flow using curl:

```bash
# Login and capture cookies
curl -c cookies.txt -X POST https://reinischclassroom.com/.netlify/functions/teacher-login \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}' \
  -v

# Verify Set-Cookie header includes:
# - tc=...
# - Path=/
# - HttpOnly
# - SameSite=Lax
# - Secure

# Check session with cookie
curl -b cookies.txt https://reinischclassroom.com/.netlify/functions/teacher-session \
  -v

# Verify response is 200 with { "ok": true, "role": "teacher", "username": "..." }
```

## Acceptance Criteria

✅ All test cases pass
✅ Diagnostic logs appear correctly without exposing secrets
✅ Cookie attributes are correct for production (Secure, HttpOnly, SameSite=Lax, Path=/)
✅ Session persists across page refreshes
✅ CORS credentials header is present when origin is allowed
✅ No CSP violations
✅ No inline scripts added

## Notes

- The `tc` cookie is HttpOnly and cannot be accessed from JavaScript
- All diagnostic logs use boolean checks or metadata, never token values
- SESSION_SECRET is never logged
- Origin checking is already implemented in `isOriginAllowed()`
