# Application Guardrails

This document describes the security, reliability, and diagnosability guardrails implemented across Netlify Functions used for authentication and health checks in the Reinisch Classroom application.

## Overview

The guardrails system provides:
- **Security**: Standardized security headers, dynamic CORS, input validation, and rate limiting
- **Reliability**: Safe JSON parsing, body size limits, and structured error handling
- **Diagnosability**: Request correlation IDs for log tracking and troubleshooting

All authentication-related functions (teacher-login, teacher-session, auth-health) implement these guardrails consistently.

## Security Headers

All responses include the following security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces HTTPS for 1 year |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Disables unused browser features |
| `Cache-Control` | `no-store` | Prevents caching of sensitive responses |
| `X-Request-Id` | `<UUID>` | Correlation ID for request tracking |

## CORS Policy

### Dynamic Origin Handling

Instead of using wildcard `*` for CORS, the system implements dynamic origin validation:

**Allowed Origins:**
- `https://reinischclassroom.com` (production)
- `https://www.reinischclassroom.com` (production with www)
- `http://localhost:8888` (local development)
- `http://localhost:3000` (local development)
- `http://127.0.0.1:8888` (local development)
- `http://127.0.0.1:3000` (local development)
- `https://*.netlify.app` (Netlify Deploy Previews - auto-detected)

**How It Works:**
1. Function receives `Origin` header from request
2. Origin is validated against trusted list
3. If allowed, `Access-Control-Allow-Origin` echoes the specific origin (not `*`)
4. `Vary: Origin` header is set to enable proper caching

**Benefits:**
- More secure than wildcard CORS
- Automatically supports Netlify Deploy Previews
- Proper caching behavior across different origins

### CORS Preflight (OPTIONS)

All endpoints respond to OPTIONS requests with:
- Status: `200 OK`
- Allowed methods and headers in CORS headers
- Empty response body
- Full security headers included

## Input Validation

### teacher-login.js

**Request Requirements:**
- Method: `POST`
- Content-Type: `application/json` (enforced)
- Body size: ≤ 10 KB
- Fields:
  - `username`: string, 1-64 characters
  - `password`: string, 1-64 characters

**Validation Steps:**
1. Content-Type header check
2. Body size validation
3. Safe JSON parsing (catches syntax errors)
4. Field type and length validation

**Error Responses:**
- `400 Bad Request`: Invalid Content-Type, oversized body, malformed JSON, or invalid fields
- `401 Unauthorized`: Invalid credentials (after small delay)
- `429 Too Many Requests`: Throttle limit exceeded
- `500 Internal Server Error`: Backend/RPC issues only

### teacher-session.js

**Request Requirements:**
- Method: `GET`
- Cookie: `tc` with valid session token

**Validation:**
- Session token verification via JWT
- Role check (teacher or admin)

**Error Responses:**
- `401 Unauthorized`: Missing or invalid session token
- `500 Internal Server Error`: Configuration issues

### auth-health.js

**Request Requirements:**
- Method: `GET`
- No authentication required

**Response:**
- Environment variable presence and lengths (safe metadata)
- **Never returns actual secret values**
- Includes configuration status flags

## Throttling and Rate Limiting

### teacher-login Throttle Behavior

**Mechanism:**
- Cookie-based per-IP throttling
- 1-minute window after invalid credentials
- Uses `tc_throttle` cookie with timestamp and hashed IP

**Brute-Force Protection:**
- Fixed delay added on invalid credentials: 150-300ms random
- Reduces timing attack effectiveness
- Applied before returning 401 response

**Throttle Response:**
- Status: `429 Too Many Requests`
- Error message: "Too many attempts. Please try again in a moment."
- Must wait full throttle window before retry

**Cookie Details:**
```
tc_throttle=<timestamp>_<hashed_ip>
Path=/
HttpOnly
SameSite=Lax
Max-Age=60
```

## Request Correlation

### X-Request-Id Header

Every function invocation generates a unique UUID request ID:
- Included in response headers as `X-Request-Id`
- Logged in all console output: `[function-name] [request-id] message`
- Enables correlation between client requests and server logs

### How to Use Request IDs

**In Client Code:**
```javascript
const response = await fetch('/.netlify/functions/teacher-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});

const requestId = response.headers.get('X-Request-Id');
console.log('Request ID:', requestId);
```

**In Server Logs:**
Search Netlify function logs for the request ID to find all related log entries:
```
[teacher-login] [550e8400-e29b-41d4-a716-446655440000] Request received
[teacher-login] [550e8400-e29b-41d4-a716-446655440000] Invalid credentials attempt for username: testuser
```

## Shared HTTP Library

All guardrails are implemented in `netlify/functions/_lib/http.js`:

**Available Functions:**
- `generateRequestId()` - Creates UUID for request tracking
- `getSecurityHeaders(requestId)` - Returns security headers
- `getCorsHeaders(event, methods, headers)` - Dynamic CORS headers
- `isOriginAllowed(origin)` - Validates origin against policy
- `jsonResponse(event, status, body, extraHeaders, requestId)` - Builds complete response
- `handleCorsPreFlight(event, methods, headers)` - OPTIONS handler
- `validateBodySize(body, maxSizeKB)` - Checks request size
- `safeJsonParse(body)` - Safe JSON parsing with error handling
- `validateStringField(value, fieldName, minLength, maxLength)` - Field validation

## Error Handling

### Generic Error Messages

To prevent information leakage:
- Credential validation errors use generic "Invalid username or password"
- Service errors use generic "Authentication service unavailable" or "Authentication service error"
- Configuration errors use "Server not configured" (no details about which variable)

### Error Logging

- Detailed errors logged server-side with request ID
- Generic messages returned to client
- No secrets ever logged (usernames logged, passwords never)

## Troubleshooting

### Finding Request Logs

1. Get `X-Request-Id` from failed request response headers
2. Open Netlify function logs
3. Search for the request ID
4. Review all log entries with that ID

### Common Issues

**Issue: CORS error in browser**
- **Cause**: Request from non-allowed origin
- **Fix**: Add origin to `TRUSTED_ORIGINS` in `http.js` or use Netlify preview

**Issue: 400 "Content-Type must be application/json"**
- **Cause**: Missing or wrong Content-Type header
- **Fix**: Set `Content-Type: application/json` header in request

**Issue: 400 "Request body too large"**
- **Cause**: POST body exceeds 10 KB
- **Fix**: Reduce payload size

**Issue: 400 "Invalid JSON in request body"**
- **Cause**: Malformed JSON syntax
- **Fix**: Validate JSON before sending

**Issue: 400 with field validation error**
- **Cause**: Field missing, wrong type, or wrong length
- **Fix**: Ensure username and password are strings, 1-64 characters

**Issue: 429 "Too many attempts"**
- **Cause**: Multiple invalid login attempts within 1 minute
- **Fix**: Wait 60 seconds before retry

**Issue: Request ID not in logs**
- **Cause**: Old function version without guardrails
- **Fix**: Ensure latest deployment is active

## Manual Testing

### Test 1: CORS Preflight from Non-Allowed Origin

```bash
curl -i -X OPTIONS \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  https://your-site.netlify.app/.netlify/functions/teacher-login
```

**Expected**: No `Access-Control-Allow-Origin` header (origin blocked)

### Test 2: CORS Preflight from Allowed Origin

```bash
curl -i -X OPTIONS \
  -H "Origin: https://reinischclassroom.com" \
  -H "Access-Control-Request-Method: POST" \
  https://your-site.netlify.app/.netlify/functions/teacher-login
```

**Expected**:
- Status: 200
- `Access-Control-Allow-Origin: https://reinischclassroom.com`
- `Vary: Origin`
- Security headers present

### Test 3: Invalid JSON

```bash
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: https://reinischclassroom.com" \
  -d '{invalid json}' \
  https://your-site.netlify.app/.netlify/functions/teacher-login
```

**Expected**:
- Status: 400
- Error: "Invalid JSON in request body"
- `X-Request-Id` header present

### Test 4: Oversized Body

```bash
# Create 11KB payload
python3 -c "print('{\"username\":\"test\",\"password\":\"' + 'a'*11000 + '\"}')" | \
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: https://reinischclassroom.com" \
  -d @- \
  https://your-site.netlify.app/.netlify/functions/teacher-login
```

**Expected**:
- Status: 400
- Error: "Request body too large"

### Test 5: Invalid Field Length

```bash
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: https://reinischclassroom.com" \
  -d '{"username":"","password":"test"}' \
  https://your-site.netlify.app/.netlify/functions/teacher-login
```

**Expected**:
- Status: 400
- Error: "username must be at least 1 character(s)"

### Test 6: Invalid Credentials (Check Delay)

```bash
time curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: https://reinischclassroom.com" \
  -d '{"username":"test","password":"wrong"}' \
  https://your-site.netlify.app/.netlify/functions/teacher-login
```

**Expected**:
- Status: 401
- Error: "Invalid username or password"
- Response time: ~150-300ms delay (plus network latency)
- `Set-Cookie: tc_throttle=...`

### Test 7: Throttle Limit

```bash
# Run test 6 multiple times rapidly
for i in {1..3}; do
  curl -i -X POST \
    -H "Content-Type: application/json" \
    -H "Origin: https://reinischclassroom.com" \
    -H "Cookie: tc_throttle=<value-from-previous>" \
    -d '{"username":"test","password":"wrong"}' \
    https://your-site.netlify.app/.netlify/functions/teacher-login
  echo "\n---\n"
done
```

**Expected**: After first attempt, subsequent requests return 429

### Test 8: Valid Credentials

```bash
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: https://reinischclassroom.com" \
  -d '{"username":"actual-user","password":"actual-pass"}' \
  https://your-site.netlify.app/.netlify/functions/teacher-login
```

**Expected**:
- Status: 200
- `Set-Cookie: tc=...` with HttpOnly, Secure, SameSite=Lax
- Body: `{"ok":true,"username":"actual-user"}`
- All security headers present
- `X-Request-Id` header present

### Test 9: Session Verification

```bash
# Extract tc cookie from test 8 response
TC_COOKIE="<cookie-value>"

curl -i -X GET \
  -H "Origin: https://reinischclassroom.com" \
  -H "Cookie: tc=${TC_COOKIE}" \
  https://your-site.netlify.app/.netlify/functions/teacher-session
```

**Expected**:
- Status: 200
- Body: `{"ok":true,"role":"teacher","username":"actual-user"}`
- Security headers present

### Test 10: Auth Health Check

```bash
curl -i -X GET \
  -H "Origin: https://reinischclassroom.com" \
  https://your-site.netlify.app/.netlify/functions/auth-health
```

**Expected**:
- Status: 200
- Body includes `ok: true`, env presence info, status flags
- **No actual secret values** in response
- `Cache-Control: no-store`
- `X-Request-Id` present

### Test 11: Verify Request ID in Logs

1. Run any test and capture the `X-Request-Id` from response
2. Open Netlify function logs
3. Search for the request ID
4. Verify all log entries for that request contain the same ID

## Security Notes

- **No secrets logged or returned**: Passwords never logged; environment variables only report presence/length
- **Generic error messages**: Prevent information disclosure about system internals
- **CORS reduces attack surface**: Only trusted origins can make requests
- **Input validation**: Prevents malformed input and oversized payloads
- **Throttling**: Adds friction to brute-force attempts
- **Fixed delay on invalid creds**: Reduces effectiveness of timing attacks
- **HttpOnly cookies**: Session tokens not accessible to JavaScript
- **Secure cookies**: Transmitted only over HTTPS (except localhost dev mode)

## Maintenance

### Adding a New Trusted Origin

Edit `netlify/functions/_lib/http.js`:

```javascript
const TRUSTED_ORIGINS = [
  // ... existing origins
  'https://new-domain.com',
];
```

### Adjusting Throttle Settings

Edit `netlify/functions/teacher-login.js`:

```javascript
const THROTTLE_WINDOW_SECONDS = 60; // Change to desired window
const INVALID_CREDS_DELAY_MS = 150 + Math.floor(Math.random() * 150); // Adjust delay range
```

### Changing Body Size Limit

Modify calls to `validateBodySize()` in functions:

```javascript
const bodySizeCheck = validateBodySize(event.body, 20); // 20 KB instead of 10 KB
```

### Adding New Security Headers

Edit `getSecurityHeaders()` in `netlify/functions/_lib/http.js`:

```javascript
function getSecurityHeaders(requestId) {
  const headers = {
    // ... existing headers
    'X-Custom-Header': 'value',
  };
  // ...
}
```

## References

- [DEPLOYMENT_VERIFICATION.md](../DEPLOYMENT_VERIFICATION.md) - Deployment checklist and verification tests
- [AUTH_MIGRATION_AND_GUARDRAILS.md](../AUTH_MIGRATION_AND_GUARDRAILS.md) - Authentication migration guide
- [netlify/functions/_lib/http.js](../netlify/functions/_lib/http.js) - Shared HTTP utilities
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/) - Security headers reference
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) - CORS documentation
