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

## Global Security Headers

Beyond authentication functions, security headers are applied globally to all routes via Netlify's `_headers` file configuration. This provides defense-in-depth across the entire site.

### Site-Wide Headers (netlify.toml)

The following headers are applied to all routes (`/*`):

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS for 1 year, including subdomains |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing attacks |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer information leakage |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Disable unused browser APIs |
| `X-Frame-Options` | `SAMEORIGIN` | Prevent clickjacking (only allow same-origin framing) |
| `Content-Security-Policy-Report-Only` | *(see below)* | Monitor CSP violations without blocking |
| `Cache-Control` (HTML only) | `no-store, no-cache, must-revalidate` | Prevent caching of HTML pages |

### Content Security Policy (Report-Only Mode)

The site implements a **Content-Security-Policy-Report-Only** header to monitor potential violations without breaking functionality. This allows us to:

1. **Identify unsafe patterns** in current code (inline scripts, eval, etc.)
2. **Collect violation reports** for analysis before enforcing
3. **Gradually tighten** the policy as issues are addressed

**Current Policy:**

```
default-src 'self'; 
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://*.supabase.co; 
style-src 'self' 'unsafe-inline'; 
img-src 'self' data: https:; 
font-src 'self' data:; 
connect-src 'self' https://*.supabase.co https://*.supabase.net; 
media-src 'self'; 
object-src 'none'; 
base-uri 'self'; 
form-action 'self'; 
frame-ancestors 'self'; 
report-uri /.netlify/functions/csp-report
```

**Key Directives:**

- `default-src 'self'` - By default, only allow resources from same origin
- `script-src` - Allows scripts from self, inline (for now), eval (for now), CDNs, and Supabase
- `style-src` - Allows styles from self and inline (for now)
- `img-src` - Allows images from self, data URIs, and any HTTPS source
- `connect-src` - Allows fetch/XHR to self and Supabase
- `object-src 'none'` - Block Flash and other plugins
- `report-uri` - Send violation reports to CSP report endpoint

**⚠️ Note:** The policy currently includes `'unsafe-inline'` and `'unsafe-eval'` for gradual adoption. These will be removed in future iterations as the codebase is refactored.

### CSP Violation Reports

When a browser detects a CSP violation (in report-only mode), it sends a report to `/.netlify/functions/csp-report`.

#### Example CSP Report Payload

```json
{
  "csp-report": {
    "document-uri": "https://reinischclassroom.com/student/",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.com/malicious.js",
    "source-file": "https://reinischclassroom.com/student/index.html",
    "line-number": 42,
    "column-number": 15,
    "original-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'..."
  }
}
```

#### CSP Report Endpoint

The `csp-report` function:

- **Accepts:** POST requests with `application/json` or `application/csp-report` content-type
- **Validates:** Body size (≤25KB), JSON format
- **Logs:** Violation details with request correlation IDs
- **Returns:** 204 No Content (standard for CSP reports)
- **Security:** Never echoes sensitive data; logs are server-side only

**Viewing CSP Reports:**

1. Open Netlify function logs
2. Search for `[csp-report]`
3. Review logged violations by document-uri, violated-directive, and blocked-uri

**Common Violations (Expected):**

- `script-src` violations from inline event handlers → Refactor to addEventListener
- `style-src` violations from inline styles → Move to CSS files or style blocks
- `script-src-elem` violations from eval() usage → Refactor to safer alternatives

### Tightening CSP in the Future

**Phase 1 (Current):** Report-only mode with permissive policy  
**Phase 2:** Remove `'unsafe-inline'` from script-src by using nonces or hashes  
**Phase 3:** Remove `'unsafe-eval'` by refactoring dynamic code execution  
**Phase 4:** Enable enforcement mode (`Content-Security-Policy` instead of `-Report-Only`)

See [CSP Migration Guide](#csp-migration-guide) below for detailed steps.

## Client-Server Correlation IDs

### Overview

Correlation IDs enable tracking of requests from client to server, making debugging significantly easier.

**Two types of IDs:**

1. **Server Request ID** (`X-Request-Id`): Generated by Netlify functions for each invocation
2. **Client Request ID** (`X-Client-Request-Id`): Generated by client page load, sent with requests

### Client Request ID

Generated once per page load and stored in `window.rcClientRequestId`.

**Initialization:**

```javascript
// Automatically initialized by diagnostics.js
import '../web/diagnostics.js';

// Access the client request ID
console.log('Client Request ID:', window.rcClientRequestId);
```

**Format:** UUID v4 (e.g., `550e8400-e29b-41d4-a716-446655440000`)

### Using wrapFetch

The `wrapFetch` utility automatically injects the client request ID into all outgoing requests:

```javascript
// Standard fetch (without client ID)
const response = await fetch('/api/endpoint', { method: 'POST', body: data });

// wrapFetch (with client ID, timeout, retry)
const response = await wrapFetch('/api/endpoint', { method: 'POST', body: data });
```

**Benefits:**

- ✅ Automatic `X-Client-Request-Id` header injection
- ✅ 10-second timeout protection
- ✅ 1 automatic retry on network failures
- ✅ Preserves all original fetch options

### Correlation in Server Logs

When a request includes `X-Client-Request-Id`, it's logged alongside the server-generated `X-Request-Id`:

```
[teacher-login] [server-id: 550e8400-e29b-41d4-a716-446655440000] Request received
[teacher-login] [server-id: 550e8400-e29b-41d4-a716-446655440000] Client Request ID: client-id-abc-123
```

**How to Use:**

1. Client experiences an issue and gets an error
2. Client inspects response headers to find `X-Request-Id` (server ID)
3. Client inspects request headers to find `X-Client-Request-Id` (client ID)
4. Search Netlify function logs for either ID to find full request trace
5. Correlate multiple requests from same page load using client ID

### Diagnostic Mode (?diag=1)

Enable verbose diagnostic logging by adding `?diag=1` to any URL:

```
https://reinischclassroom.com/student/?diag=1
```

When enabled, the `window.rcDiag` logger outputs diagnostic messages:

```javascript
// Only logs when ?diag=1 is present
window.rcDiag.log('User clicked submit button');
window.rcDiag.warn('Potential issue detected');
window.rcDiag.error('Operation failed');
```

**Console Output (when diag=1):**

```
[rcDiag] User clicked submit button
[rcDiag] Potential issue detected
[rcDiag] Operation failed
```

**Console Output (without diag=1):**

*(no output - completely silent)*

### Viewing Netlify Function Logs

**Via Netlify UI:**

1. Log in to Netlify dashboard
2. Select your site
3. Click "Functions" in the left sidebar
4. Select a function (e.g., `teacher-login`)
5. Click "View logs"
6. Use the search box to filter by request ID

**Via Netlify CLI:**

```bash
netlify functions:log teacher-login --live
```

**Filtering Logs:**

```bash
# Search for specific request ID
netlify functions:log teacher-login | grep "550e8400-e29b-41d4-a716-446655440000"

# Search for CSP violations
netlify functions:log csp-report | grep "violated-directive"
```

## CSP Migration Guide

### Step 1: Monitor Violations (Current Phase)

**Actions:**

- [x] Enable CSP-Report-Only header
- [x] Set up CSP report endpoint
- [ ] Collect violation reports for 2+ weeks
- [ ] Analyze common violations

**Expected Violations:**

- Inline scripts in HTML (event handlers like `onclick`)
- Inline styles in HTML (style attributes)
- `eval()` usage in JavaScript
- Third-party scripts not in allowlist

### Step 2: Remove Unsafe Inline Scripts

**Refactor inline event handlers:**

```html
<!-- Before (violates CSP) -->
<button onclick="handleClick()">Click Me</button>

<!-- After (CSP-safe) -->
<button id="myButton">Click Me</button>
<script>
  document.getElementById('myButton').addEventListener('click', handleClick);
</script>
```

**Use nonces for inline scripts:**

```html
<!-- Server generates nonce per request -->
<script nonce="random-nonce-value">
  console.log('This script is allowed');
</script>
```

Update CSP header:

```
script-src 'self' 'nonce-random-nonce-value' https://cdnjs.cloudflare.com;
```

### Step 3: Remove Unsafe Eval

**Refactor dynamic code execution:**

```javascript
// Before (violates CSP)
const code = 'console.log("hello")';
eval(code);

// After (CSP-safe)
const safeAction = {
  greet: () => console.log('hello'),
};
safeAction['greet']();
```

### Step 4: Enforce CSP

Once all violations are resolved:

1. Change header from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`
2. Remove `'unsafe-inline'` and `'unsafe-eval'` from policy
3. Monitor for any breakage in production
4. Roll back if critical issues arise

**Timeline:** Estimated 3-6 months for full CSP enforcement

## References

- [DEPLOYMENT_VERIFICATION.md](../DEPLOYMENT_VERIFICATION.md) - Deployment checklist and verification tests
- [AUTH_MIGRATION_AND_GUARDRAILS.md](../AUTH_MIGRATION_AND_GUARDRAILS.md) - Authentication migration guide
- [netlify/functions/_lib/http.js](../netlify/functions/_lib/http.js) - Shared HTTP utilities
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/) - Security headers reference
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) - CORS documentation
- [MDN Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy) - CSP reference
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/) - Google's CSP validation tool
