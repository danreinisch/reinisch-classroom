# Admin Login Error Codes

This document describes the error codes used in the admin login flow and how to debug them.

## Overview

When an admin login attempt fails, the user is redirected to `/admin-login?e=<code>` where `<code>` indicates the specific failure reason. The error code is logged in the Netlify function logs for debugging purposes.

## Error Codes

### `e=cfg` - Configuration Missing
**Cause:** One or more required environment variables are not configured.

**Required Environment Variables:**
- `SUPABASE_URL` or `SUPABASE_URL_RUNTIME`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY_RUNTIME`
- `ADMIN_SESSION_SECRET`

**Action:** Check Netlify logs to see which specific environment variables are missing. Configure them in Netlify Dashboard → Site settings → Environment variables.

---

### `e=parse` - Request Body Parsing Failed
**Cause:** The login form data could not be parsed, or username/password fields are missing.

**Possible Reasons:**
- Malformed request body
- Missing username or password in the POST data
- Invalid content-type header

**Action:** Check that the login form is submitting properly. This may indicate a client-side issue or network problem.

---

### `e=throttle` - Too Many Login Attempts
**Cause:** The client IP has exceeded the rate limit for login attempts (currently 1 attempt per 60 seconds).

**Action:** Wait for the throttle window to expire (60 seconds) before trying again.

---

### `e=rpc404` - RPC Function Not Found
**Cause:** The Supabase RPC function `verify_user_password` does not exist or is not accessible.

**Possible Reasons:**
- The RPC function name in the code doesn't match the function name in Supabase
- The function exists but is not exposed as a public function
- Database migration has not been run

**Action:** 
1. Check Netlify logs for the exact function name being called
2. Verify the function exists in Supabase Dashboard → Database → Functions
3. Ensure the function is marked as public/accessible
4. Check if the function name uses underscores vs hyphens (e.g., `verify_user_password` not `verify-user-password`)

---

### `e=rpc<status>` - Other RPC Errors
**Cause:** Supabase RPC call returned a non-2xx status code.

**Common Status Codes:**
- `403`: Permission denied - service role key may be invalid
- `500`: Server error in Supabase
- `502/503`: Supabase service temporarily unavailable

**Action:** Check Netlify function logs for the full error response. Verify Supabase service status and API credentials.

---

### `e=creds` - Invalid Credentials
**Cause:** Username or password is incorrect.

**Action:** Verify credentials and try again. Note that this is rate-limited to prevent brute-force attacks.

---

### `e=role` - Invalid Role
**Cause:** The user authenticated successfully but does not have the required role (`teacher` or `admin`).

**Action:** Ensure the user has been assigned the correct role in the Supabase database.

---

### `e=1` - Generic Error
**Cause:** An unexpected error occurred during authentication.

**Action:** Check Netlify function logs for the full error message and stack trace.

---

## Finding Netlify Logs

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Navigate to **Functions** in the left sidebar
4. Click on `admin-session` function
5. View the **Function log** tab
6. Look for log entries prefixed with `[admin-session]`

Alternatively, use the Netlify CLI:
```bash
netlify functions:log admin-session
```

## Log Format

The function logs include:
- Error code being returned
- Missing environment variables (names only, not values)
- RPC function name being called
- RPC response status codes
- Sanitized/truncated RPC response bodies (first 500 characters)

**Security Note:** Logs never contain:
- Actual environment variable values
- Passwords or credentials
- Complete error responses that might leak sensitive information

## Troubleshooting Workflow

1. **User reports login failure** → Note the error code in the URL (if visible)
2. **Check Netlify function logs** → Find the corresponding `[admin-session]` log entries
3. **Identify the specific error** → Use this document to understand the cause
4. **Take corrective action** → Based on the error type and logged details
5. **Test the fix** → Attempt login again

## Example Log Entries

### Configuration Error
```
[admin-session] Missing Supabase or session configuration
[admin-session] Missing env vars: ADMIN_SESSION_SECRET
```

### RPC Error
```
[admin-session] Supabase RPC error - function: verify_user_password status: 404
[admin-session] RPC response body (truncated): {"message":"Function not found","code":"PGRST202"}
```

### Invalid Credentials
```
[admin-session] Invalid credentials attempt for username: john.doe
```

### Throttled
```
[admin-session] Throttled login attempt from 192.168.1.1
```
