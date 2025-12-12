# Admin Authentication Error Codes

This document describes the error codes used in the admin authentication system and how to troubleshoot them.

## Error Codes

### Login Errors (admin-session.js)

These errors are returned via redirect with query parameter `?e=<code>`:

| Error Code | Description | User Action | Admin Action |
|------------|-------------|-------------|--------------|
| `config` | Server configuration error - missing environment variables | Contact administrator | Configure `ADMIN_SESSION_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Netlify environment variables |
| `invalid` | Invalid username or password | Check credentials and retry | None - normal failed login attempt |
| `unauthorized` | User role not permitted for admin access | Contact administrator to get proper role | Grant user 'teacher' or 'admin' role in database |
| `server` | Database connectivity or RPC error | Try again later, contact admin if persists | Check Supabase connection, verify RPC function exists |
| `throttled` | Too many login attempts | Wait 60 seconds before retrying | None - security feature working as intended |
| `1` | Generic error (parsing, validation, etc.) | Check form and retry | Check server logs for details |

### Session Check Errors (admin-session-check.js)

These errors are returned as JSON responses:

| Error Code | HTTP Status | Description | Action |
|------------|-------------|-------------|--------|
| `SERVER_NOT_CONFIGURED` | 503 | Missing `ADMIN_SESSION_SECRET` | Configure environment variable |
| `INVALID_REQUEST` | 400 | Missing headers object | Check client request format |
| `NO_VALID_SESSION` | 401 | No valid session cookie found | User needs to log in |
| `SERVER_ERROR` | 500 | Unexpected server error | Check logs, retry request |

Response includes additional fields:
- `needsUpgrade: true` - Session using legacy token (v1/v2/v3), will be upgraded on next login
- `needsRefresh: true` - Access token expired, refresh token valid, silent refresh recommended
- `legacyVersion` - Which legacy token version is in use (v1, v2, or v3)

### Session Refresh Errors (admin-session-refresh.js)

These errors are returned as JSON responses:

| Error Code | HTTP Status | Description | Action |
|------------|-------------|-------------|--------|
| `METHOD_NOT_ALLOWED` | 405 | Non-POST request | Use POST method |
| `SERVER_ERROR` | 503 | Missing `ADMIN_SESSION_SECRET` | Configure environment variable |
| `INVALID_REQUEST` | 400 | Missing headers object | Check client request format |
| `NO_REFRESH_TOKEN` | 401 | No refresh token found | User needs to log in again |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token invalid/expired | User needs to log in again |

## Environment Variables

### Required

- **ADMIN_SESSION_SECRET**: Secret key for signing session tokens (minimum 32 characters)
  - Location: Netlify → Environment variables → Functions scope
  - Type: Secret (enabled)
  
- **SUPABASE_URL**: Supabase project URL
  - Location: Netlify → Environment variables
  - Alternative: `SUPABASE_URL_RUNTIME`
  
- **SUPABASE_SERVICE_ROLE_KEY**: Supabase service role key
  - Location: Netlify → Environment variables → Functions scope
  - Type: Secret (enabled)
  - Alternative: `SUPABASE_SERVICE_KEY_RUNTIME`

### Optional

- **ACCESS_TOKEN_TTL_SECONDS**: Access token lifetime (default: 1800 = 30 minutes)
- **REFRESH_TOKEN_TTL_SECONDS**: Refresh token lifetime (default: 86400 = 24 hours)
- **ADMIN_ACCEPT_LEGACY**: Accept legacy v1/v2/v3 tokens (default: true)

## Troubleshooting

### "Server configuration error"

**Symptoms**: Login page shows "Server configuration error" message

**Cause**: One or more required environment variables are missing or empty

**Solution**:
1. Go to Netlify dashboard → Site settings → Environment variables
2. Verify these variables are set:
   - `ADMIN_SESSION_SECRET` (minimum 32 random characters)
   - `SUPABASE_URL` (or `SUPABASE_URL_RUNTIME`)
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY_RUNTIME`)
3. Ensure variables are scoped to "Functions" (or "All")
4. Redeploy the site or clear build cache

### "Invalid username or password"

**Symptoms**: Login fails with this message after entering credentials

**Cause**: Credentials don't match any user in the database, or user exists but password is incorrect

**Solution**:
1. Verify username is correct (case-sensitive)
2. Verify password is correct
3. Check user exists in Supabase `users` table
4. Verify password hash in database matches (use `verify_user_password` RPC)

### "Your account does not have permission"

**Symptoms**: Login succeeds but shows authorization error

**Cause**: User role is not 'teacher' or 'admin'

**Solution**:
1. Check user's `role` column in Supabase `users` table
2. Update role to 'teacher' or 'admin' as appropriate

### "Too many login attempts"

**Symptoms**: Login blocked temporarily

**Cause**: Multiple failed login attempts from same IP within 60 seconds

**Solution**:
1. Wait 60 seconds
2. Clear cookies for the site
3. Retry login

### Session expired during long operation

**Symptoms**: Upload or operation fails mid-way with session error

**Cause**: Access token expired (default 30 minutes)

**Solution**:
1. The admin panel should auto-refresh tokens via `admin-session-touch` endpoint
2. If uploads take longer than 30 minutes, consider increasing `ACCESS_TOKEN_TTL_SECONDS`
3. Break large operations into smaller chunks

### Legacy token warnings in logs

**Symptoms**: Console shows "Legacy token detected: v3" (or v2, v1)

**Cause**: User is using an old session cookie from before the v4 token system

**Solution**:
- This is informational only
- User session still works
- Token will be upgraded to v4 on next login
- To force upgrade: log out and log in again

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
# Test token utilities
node netlify/functions/_lib/token-utils.test.js

# Test session check endpoint
node netlify/functions/admin-session-check.test.js
```

All tests should pass. If tests fail, review the error messages and fix the underlying issues before deploying.

### Manual Testing

1. **Test missing config**: Temporarily remove `ADMIN_SESSION_SECRET` and verify config error appears
2. **Test invalid credentials**: Use wrong password and verify "invalid" error
3. **Test successful login**: Use valid credentials and verify redirect to `/admin/`
4. **Test session check**: After login, visit `/admin/` and verify access granted
5. **Test token refresh**: Wait for access token to expire and verify auto-refresh works
6. **Test logout**: Click logout and verify redirect to login page

## Logging

All admin authentication endpoints log to the Netlify Functions log:

- `[admin-session]` - Login endpoint logs
- `[admin-session-check]` - Session validation logs  
- `[admin-session-refresh]` - Token refresh logs

Check logs in Netlify dashboard → Functions → Function logs

Enable detailed logging by checking the function logs during authentication attempts.
