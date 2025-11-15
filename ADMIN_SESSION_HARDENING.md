# Admin Session Hardening - Technical Documentation

## Overview

This document describes the comprehensive session hardening initiative implemented to ensure reliable multi-batch uploads in the admin panel. The solution addresses intermittent 401 errors during long-running operations by implementing a dual-token system with automatic refresh capabilities.

## Problem Statement

**Original Issues:**
- Mid-upload 401 ("Session expired") errors causing batch abort
- Cookie version drift (v1/v2/v3 mismatch)
- No proactive session refresh for long-running operations
- Unstructured error responses preventing graceful recovery
- Loss of upload progress on session expiry
- No queue preservation across authentication failures

## Solution Architecture

### Dual-Token System

The solution implements a dual-token authentication model:

1. **Access Token** (`rc_admin_session_v4`)
   - Short-lived (default: 30 minutes)
   - Used for API request authentication
   - Auto-refreshed when near expiration
   - HttpOnly, Secure, SameSite=Lax

2. **Refresh Token** (`rc_admin_refresh_v1`)
   - Long-lived (default: 24 hours)
   - Used to issue new access tokens
   - HttpOnly, Secure, SameSite=Lax
   - Contains JTI for future revocation support

### Token Payload Format

**Access Token (v4):**
```javascript
{
  u: "username",           // Username
  role: "admin",          // User role (admin, teacher)
  exp: 1234567890,        // Expiration timestamp (Unix epoch)
  ver: "v4",              // Token version
  n: "abc123...",         // Nonce (random 8-byte hex)
  iat: 1234567890         // Issued at timestamp
}
```

**Refresh Token (v1):**
```javascript
{
  u: "username",           // Username
  role: "admin",          // User role
  exp: 1234567890,        // Expiration timestamp (Unix epoch)
  ver: "v1",              // Token version
  jti: "unique-id...",    // JWT ID (random 16-byte hex)
  iat: 1234567890         // Issued at timestamp
}
```

## Authentication Flow

### Initial Login

```
User → POST /admin-session
  ↓
Verify credentials via Supabase RPC
  ↓
Generate access token (30min) + refresh token (24h)
  ↓
Set both cookies
  ↓
Redirect to /admin/
```

### Authenticated Request Flow

```
Request → Edge Guard (admin-auth-guard.js)
  ↓
Parse access & refresh cookies
  ↓
Is access token valid?
  ├─ Yes → Allow request (add X-Admin-Session: valid-v4 header)
  └─ No → Is refresh token valid?
      ├─ Yes → Issue new access token (sliding window)
      │        Set new access cookie
      │        Allow request (add X-Admin-Session: refreshed header)
      └─ No → Try legacy cookies (v1/v2/v3)?
          ├─ Yes (if ADMIN_ACCEPT_LEGACY=true) → Allow request
          └─ No → Redirect to /admin-login (or JSON 401 for API)
```

### Session Refresh Flow

**Explicit Refresh (user-initiated or proactive):**
```
Frontend → POST /.netlify/functions/admin-session-refresh
  ↓
Verify refresh token
  ↓
Generate new access token
  ↓
Set new access cookie
  ↓
Return JSON { refreshed: true, expiresIn: 1800, expiresAt: ... }
```

**Session Touch (periodic or pre-flight):**
```
Frontend → POST /.netlify/functions/admin-session-touch
  ↓
Verify access/refresh tokens
  ↓
Is remaining TTL < threshold (5min)?
  ├─ Yes → Auto-refresh access token
  │        Set new access cookie
  │        Return JSON { touched: true, refreshed: true, ... }
  └─ No → Return current session info
          Return JSON { touched: true, refreshed: false, ... }
```

## Frontend Session Management

### Initialization
- Touch session on page load
- Set up periodic touch interval (every 5 minutes)
- Check for and restore previous queue from localStorage
- Display session status indicator

### Pre-Upload Checks
1. **Pre-flight session touch** - Verify session is active
2. **Estimate encoding time** - Calculate based on file sizes
3. **Check remaining TTL** - Compare with estimated time + safety buffer
4. **Proactive refresh** - Refresh if TTL insufficient

### Upload with Retry Logic
```javascript
async function uploadBatchWithRetry(payload, batchNum, totalBatches, retryCount = 0) {
  // Attempt upload
  // If 401 with code="SESSION_EXPIRED" and retryable=true:
  //   1. Attempt session refresh
  //   2. If successful, retry upload once
  //   3. If failed, persist queue and redirect to login
}
```

### Queue Persistence
- **Persist on:** File add, form change, upload failure
- **Storage key:** `adminUploadQueueDraft` (localStorage)
- **Contents:** File metadata (name, size, type, path)
- **Restore:** On next login, prompt user to restore queue
- **Clear:** On successful upload completion

### Session Status Display
- Fixed position indicator (top-right)
- Shows remaining TTL in minutes
- Auto-refresh status indicator
- Color-coded warnings (< 5 min remaining)

## API Endpoints

### POST /.netlify/functions/admin-session
**Purpose:** User login  
**Request:** `{ username, password }`  
**Response:** 302 redirect with dual-token cookies  
**Cookies Set:**
- `rc_admin_session_v4` (access, 30min)
- `rc_admin_refresh_v1` (refresh, 24h)

### POST /.netlify/functions/admin-session-refresh
**Purpose:** Explicit session refresh  
**Request:** Empty body (uses refresh cookie)  
**Response:**
```json
{
  "refreshed": true,
  "expiresIn": 1800,
  "expiresAt": 1234567890
}
```
**Cookies Set:**
- `rc_admin_session_v4` (new access token)

### POST /.netlify/functions/admin-session-touch
**Purpose:** Session keep-alive and conditional refresh  
**Request:** Empty body (uses cookies)  
**Response:**
```json
{
  "ok": true,
  "touched": true,
  "refreshed": false,
  "username": "admin",
  "role": "admin",
  "expiresIn": 1200,
  "expiresAt": 1234567890
}
```
**Cookies Set:** (if refreshed) `rc_admin_session_v4`

### POST /.netlify/functions/incremental-deploy
**Purpose:** Upload or delete presentation files  
**Request:**
```json
{
  "category": "life",
  "slot": 1,
  "title": "Presentation Title",
  "files": [{ "path": "index.html", "base64": "..." }],
  "final": true
}
```
**Response:**
```json
{
  "ok": true,
  "commit": "abc123...",
  "final": true,
  "files": 5,
  "sessionRemainingSeconds": 1200
}
```
**Error Response:**
```json
{
  "code": "SESSION_EXPIRED",
  "message": "Session expired or invalid",
  "retryable": true
}
```

## Error Codes

### SESSION_EXPIRED
**HTTP Status:** 401  
**Retryable:** true  
**Meaning:** Access token expired, client should attempt refresh and retry  
**Client Action:** Call `/admin-session-refresh`, then retry original request

### INVALID_REFRESH_TOKEN
**HTTP Status:** 401  
**Retryable:** false  
**Meaning:** Refresh token expired or invalid  
**Client Action:** Persist queue, redirect to login

### NO_REFRESH_TOKEN
**HTTP Status:** 401  
**Retryable:** false  
**Meaning:** No refresh token provided  
**Client Action:** Redirect to login

### SERVER_ERROR
**HTTP Status:** 503  
**Retryable:** false  
**Meaning:** Server configuration error (missing secret)  
**Client Action:** Display error to user

## Environment Variables

### Required
- `ADMIN_SESSION_SECRET` - HMAC secret for signing tokens (32+ chars)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service key

### Optional
- `ACCESS_TOKEN_TTL_SECONDS` - Access token lifetime (default: 1800 = 30min)
- `REFRESH_TOKEN_TTL_SECONDS` - Refresh token lifetime (default: 86400 = 24h)
- `ADMIN_ACCEPT_LEGACY` - Accept legacy cookies v1/v2/v3 (default: true)
- `ADMIN_SESSION_LOG` - Enable session diagnostic logging (default: 0)
- `SESSION_TOUCH_THRESHOLD` - Auto-refresh threshold for touch (default: 300 = 5min)

## Legacy Cookie Migration

### Supported Legacy Versions
- **v3** (`rc_admin_session_v3`) - Supabase-based auth (previous version)
- **v2** (`rc_admin_session_v2`) - Previous iteration
- **v1** (`rc_admin_session`) - Original version

### Migration Strategy
1. **Acceptance Period:** Legacy cookies accepted if `ADMIN_ACCEPT_LEGACY=true`
2. **On Detection:** Edge guard allows access with diagnostic header
3. **Upgrade Path:** Next login issues v4 + refresh tokens
4. **Deprecation:** Set `ADMIN_ACCEPT_LEGACY=false` to reject legacy cookies

### Structured Error on Legacy Rejection
```json
{
  "code": "LEGACY_SESSION_NOT_ACCEPTED",
  "message": "Legacy session format no longer supported. Please log in again.",
  "retryable": false
}
```

## Security Considerations

### Token Security
- HMAC SHA-256 signature verification
- HttpOnly cookies (not accessible via JavaScript)
- Secure flag (HTTPS only)
- SameSite=Lax (CSRF protection)
- Short access token lifetime (30min)
- Nonce in access token (replay prevention)
- JTI in refresh token (revocation support)

### Session Boundaries
- Edge guard protects `/admin/*` and upload functions
- Login page excluded from guard
- No inline scripts in admin area (CSP compliant)

### Timing Attack Mitigation
- Constant-time signature comparison (crypto.timingSafeEqual)
- Fixed delay on invalid login (150-300ms random)

### Rate Limiting
- Per-IP throttling on login (60s window)
- Cookie-based throttle tracking

## Monitoring & Diagnostics

### Diagnostic Headers
**X-Admin-Session:** Indicates session status
- `valid-v4` - Valid v4 access token
- `refreshed` - Auto-refreshed via refresh token
- `legacy-v3` / `legacy-v2` / `legacy-v1` - Legacy session used

### Logging (when ADMIN_SESSION_LOG=1)
```
[admin-session] Successful login for user: admin role: admin
[admin-session] Issued v4 access token (TTL: 1800 s) + v1 refresh token (TTL: 86400 s)
[admin-auth-guard] Valid v4 access token, remaining: 1200 s
[admin-auth-guard] Auto-refreshed access token via refresh token
[admin-session-touch] Auto-refreshed access token (remaining: 280 s < threshold: 300 s)
[incremental-deploy] Session verification failed
[incremental-deploy] Legacy session detected (version: v3)
```

### Client-Side Telemetry Events
- `session_touch` - Periodic touch executed
- `session_refresh` - Explicit refresh executed
- `session_retry_success` - Upload retry after refresh succeeded
- `session_retry_fail` - Upload retry failed

## Testing Strategy

### Unit Tests
**Location:** `tests/unit/token-utils.spec.js`
- Token encoding/decoding
- Signature verification
- Expiration validation
- Legacy cookie parsing
- Error response formatting

### Integration Tests
**Location:** `tests/integration/session-hardening.spec.js`
- Login flow (dual-token issuance)
- Auto-refresh during long operations
- Queue persistence across logout/login
- Retry logic on session expiry
- Legacy cookie upgrade

### Manual Test Plan
1. **Fresh login:** Verify both cookies in DevTools
2. **Large upload:** Confirm pre-flight refresh if TTL low
3. **Artificial expiry:** Shorten access TTL via ENV, verify silent refresh
4. **Forced logout:** Delete cookies mid-batch, verify retry → redirect
5. **Legacy rejection:** Set `ADMIN_ACCEPT_LEGACY=false`, verify structured error

## Operational Runbook

### Rotating the Session Secret
```bash
# 1. Generate new secret
openssl rand -hex 32

# 2. Update environment variable
# Netlify UI → Site settings → Environment variables → ADMIN_SESSION_SECRET

# 3. Deploy (invalidates all existing sessions)
# All users will need to re-login
```

### Revoking Refresh Tokens
**Future Enhancement:** Maintain server-side revocation list
- Store JTI of revoked refresh tokens
- Check against list during verification
- Implement expiry cleanup (remove expired JTIs)

### Monitoring Session Health
```bash
# Enable diagnostic logging
ADMIN_SESSION_LOG=1

# Review function logs
netlify functions:log admin-session-refresh
netlify functions:log admin-session-touch

# Check edge function logs
netlify edge-functions:log admin-auth-guard
```

### Emergency Session Invalidation
```bash
# Rotate ADMIN_SESSION_SECRET to invalidate all sessions
# Users will be redirected to login on next request
```

## Performance Considerations

### Cookie Size
- Access token: ~200-250 bytes
- Refresh token: ~250-300 bytes
- Total overhead: ~500 bytes per request

### Auto-Refresh Overhead
- Edge guard HMAC verification: <1ms
- Access token generation: <1ms
- Cookie header setting: negligible
- Total latency impact: <2ms

### LocalStorage Usage
- Queue metadata: ~1KB per 100 files
- Form state: <200 bytes
- Total: <10KB for typical upload

## Future Enhancements

### Planned (Not in Current Scope)
- Persistent server-side refresh token store
- Revocation list with JTI tracking
- Multi-user role-based permissions
- Session analytics dashboard
- WebSocket-based session push notifications

### Potential Optimizations
- Token compression (smaller payload)
- Parallel batch uploads (concurrent requests)
- Progressive encoding (start upload before all files encoded)
- Service worker for offline queue persistence

## Changelog

### v4 (Current)
- Dual-token system (access + refresh)
- Auto-refresh at edge guard
- Frontend session management
- Queue persistence
- Structured error responses
- Proactive session checks

### v3 (Previous)
- Supabase-based authentication
- Single session cookie
- 8-hour TTL
- Basic throttling

### v2 (Legacy)
- Previous auth iteration

### v1 (Original)
- Basic session cookie
- No structured errors

## References

- [OWASP Session Management Cheat Sheet](https://cheats.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Netlify Edge Functions Docs](https://docs.netlify.com/edge-functions/overview/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## Support

For issues or questions:
1. Check function logs: `netlify functions:log`
2. Review edge function logs: `netlify edge-functions:log`
3. Enable diagnostic logging: `ADMIN_SESSION_LOG=1`
4. Check browser console for client-side errors
5. Verify environment variables are set correctly
