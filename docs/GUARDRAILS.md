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

### Test 12: Stage 3A - Verify Enforced CSP Header

```bash
curl -I https://reinischclassroom.com/
```

**Expected**:
- `Content-Security-Policy` header present (enforced policy)
- Policy includes `script-src 'self' 'unsafe-inline'` (no 'unsafe-eval')
- Policy includes `connect-src 'self' https://*.supabase.co https://*.supabase.io https://*.netlify.app`
- `Content-Security-Policy-Report-Only` header also present (parallel monitoring)

### Test 13: Stage 3A - Verify No CSP Console Errors

1. Navigate to https://reinischclassroom.com/ in browser
2. Open DevTools Console
3. Navigate to Teacher Center (site/teacher/)
4. Navigate to Student Portal (site/student/)
5. Perform typical workflows (login, view data, etc.)

**Expected**:
- No CSP violation errors in console
- All features work normally
- Scripts load and execute properly

### Test 14: Stage 3A - Verify Teacher Cookie Attributes

1. Navigate to https://reinischclassroom.com/site/teacher/
2. Log in with valid credentials
3. Open DevTools → Application tab → Cookies
4. Select the site domain
5. Inspect `tc` cookie

**Expected**:
- `HttpOnly`: ✅ (checkbox checked)
- `Secure`: ✅ (checkbox checked)
- `SameSite`: `Lax`
- `Path`: `/`
- `Max-Age` or `Expires`: ~8 hours from login

### Test 15: Stage 3A - Check CSP Report Logs

1. Deploy changes to production
2. Wait 24-48 hours for reports
3. Open Netlify function logs
4. Search for `[csp-report]`
5. Review any violation reports

**Expected**:
- No violations from core pages (/, /site/teacher/, /site/student/)
- Any violations should be from edge cases or unexpected user behavior
- No 'unsafe-eval' violations (should be blocked before reaching report endpoint)

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

## Cookie Security

### Authentication Cookie Configuration

**Teacher Login Cookie (`tc`):**

The teacher authentication cookie is configured with secure attributes to prevent common web attacks:

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `HttpOnly` | ✅ Enabled | Prevents JavaScript access to cookie (XSS protection) |
| `Secure` | ✅ Enabled | Transmitted only over HTTPS (except localhost dev) |
| `SameSite` | `Lax` | Prevents CSRF attacks, allows top-level navigation |
| `Path` | `/` | Cookie available site-wide |
| `Max-Age` | `28800` (8 hours) | Session expires after 8 hours |

**Implementation:**

Located in `netlify/functions/_lib/auth.js`:

```javascript
function teacherCookie(name, value, { domain, secure = true, maxAge = 60 * 60 * 8 }) {
  const parts = [
    `${name}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
}
```

**Why SameSite=Lax:**

- ✅ Protects against CSRF attacks
- ✅ Allows normal top-level navigation (clicking links)
- ✅ Compatible with authentication flows
- ✅ More secure than `SameSite=None`
- ✅ Less restrictive than `SameSite=Strict` (which would break some legitimate flows)

**Verification:**

Use browser DevTools to inspect the cookie after login:

1. Log in to Teacher Center
2. Open DevTools → Application tab → Cookies
3. Select the site domain
4. Verify `tc` cookie has: `HttpOnly`, `Secure`, `SameSite=Lax`

### Throttle Cookie (`tc_throttle`)

Used for rate limiting failed login attempts:

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `HttpOnly` | ✅ Enabled | Prevents JavaScript access |
| `SameSite` | `Lax` | CSRF protection |
| `Max-Age` | `60` (1 minute) | Short-lived throttle window |
| `Secure` | ❌ Not set | Optional for non-sensitive throttle token |

**Note:** The throttle cookie contains only a timestamp and hashed IP, no sensitive data, so `Secure` is optional but could be added for defense-in-depth.

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

### Content Security Policy (Enforced with Strategic 'unsafe-inline')

**Stage 3A Status: Enforced CSP with 'unsafe-inline' Retention**

The site now implements an **enforced Content-Security-Policy** header that blocks most security risks while maintaining compatibility with existing inline scripts. The policy has been strengthened in the following ways:

1. **Removed 'unsafe-eval'** - No dynamic code execution via eval() is permitted
2. **Enforced policy active** - Violations are now blocked, not just reported
3. **Parallel monitoring** - Report-Only header kept alongside enforcement for additional monitoring

**Enforced Policy:**

```
default-src 'self'; 
script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; 
style-src 'self' 'unsafe-inline'; 
img-src 'self' data: https:; 
font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com; 
connect-src 'self' https://*.supabase.co https://*.supabase.io https://*.netlify.app; 
media-src 'self'; 
object-src 'none'; 
base-uri 'self'; 
form-action 'self'; 
frame-ancestors 'self'; 
report-uri /.netlify/functions/csp-report
```

**Key Directives:**

- `default-src 'self'` - By default, only allow resources from same origin
- `script-src` - Allows scripts from self, inline (temporarily), CDNs, and Supabase
  - ⚠️ **'unsafe-inline' retained temporarily** - Needed for existing inline scripts in HTML pages
  - ✅ **'unsafe-eval' removed** - No dynamic code execution permitted
- `style-src` - Allows styles from self and inline
- `img-src` - Allows images from self, data URIs, and any HTTPS source
- `connect-src` - Allows fetch/XHR to self, Supabase domains, and Netlify preview URLs
- `object-src 'none'` - Block Flash and other plugins
- `frame-ancestors 'self'` - Only allow framing from same origin
- `report-uri` - Send violation reports to CSP report endpoint

**Why 'unsafe-inline' is Kept (Temporarily):**

The codebase contains significant inline JavaScript in HTML pages (e.g., site/student/index.html, site/teacher/index.html). Removing 'unsafe-inline' immediately would break functionality. The plan is:

1. **Stage 3A (Current)**: Enforce CSP without 'unsafe-eval', keep 'unsafe-inline'
2. **Stage 3B (Next)**: Refactor inline scripts to external modules, adopt nonces or hashes, remove 'unsafe-inline'

This staged approach allows us to strengthen security incrementally without causing regressions.

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

### Step 1: Monitor Violations (Completed - Stage 2)

**Actions:**

- [x] Enable CSP-Report-Only header
- [x] Set up CSP report endpoint
- [x] Collect violation reports
- [x] Analyze common violations

**Findings:**

- Inline scripts in HTML (event handlers, initialization code)
- Inline styles in HTML (style attributes)
- No eval() usage detected (safe to remove 'unsafe-eval')
- External domains confirmed: CDNs, Supabase, Netlify previews

### Step 2: Enforce CSP Without 'unsafe-eval' (Current - Stage 3A)

**Actions:**

- [x] Switch from Content-Security-Policy-Report-Only to enforced Content-Security-Policy
- [x] Remove 'unsafe-eval' from script-src
- [x] Keep 'unsafe-inline' temporarily for both script-src and style-src
- [x] Update connect-src to minimal required domains: 'self', Supabase (https://*.supabase.co, https://*.supabase.io), Netlify previews (https://*.netlify.app)
- [x] Keep parallel Report-Only header for additional monitoring
- [x] Document rationale and next steps

**Current Policy Status:**

- ✅ Enforced CSP active, blocks violations
- ✅ 'unsafe-eval' removed (no dynamic code execution)
- ⚠️ 'unsafe-inline' retained (temporary, due to inline scripts)
- ✅ Minimal connect-src allowlist
- ✅ Parallel Report-Only monitoring active

### Step 3: Remove Unsafe Inline Scripts (Planned - Stage 3B)

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

**Option A: Use nonces for inline scripts:**

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

**Option B: Externalize inline scripts into modules:**

Move all inline `<script>` blocks into external .js files, load as modules or standard scripts.

### Step 4: Remove 'unsafe-eval' (Completed - Stage 3A)

**Actions:**

- [x] Confirm no eval() usage in codebase
- [x] Remove 'unsafe-eval' from enforced policy
- [x] Test for regressions

No dynamic code execution was found, so 'unsafe-eval' was safely removed.

### Step 5: Final Enforcement (Planned - Stage 3B)

Once all inline scripts are refactored:

1. Remove 'unsafe-inline' from script-src
2. Remove 'unsafe-inline' from style-src (if feasible)
3. Consider adding Subresource Integrity (SRI) for CDN resources
4. Monitor for any breakage in production
5. Roll back if critical issues arise

**Timeline:** Stage 3B planned for next release cycle

## References

- [DEPLOYMENT_VERIFICATION.md](../DEPLOYMENT_VERIFICATION.md) - Deployment checklist and verification tests
- [AUTH_MIGRATION_AND_GUARDRAILS.md](../AUTH_MIGRATION_AND_GUARDRAILS.md) - Authentication migration guide
- [netlify/functions/_lib/http.js](../netlify/functions/_lib/http.js) - Shared HTTP utilities
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/) - Security headers reference
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) - CORS documentation
- [MDN Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy) - CSP reference
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/) - Google's CSP validation tool

### Step 5: Remove Unsafe Inline Scripts (Completed - Stage 3B)

**Goal:** Eliminate all inline JavaScript to enable strict CSP without 'unsafe-inline'.

**Actions Completed:**

- [x] Extract inline scripts from site/student/index.html to external modules
  - [x] student-portal-failsafe.js - Failsafe timer for login view visibility
  - [x] student-portal-error-handler.js - Global error capture with user banner
  - [x] student-portal-auto-login.js - 24-hour auto-login bootstrap
- [x] Extract inline scripts from site/hub/index.html to external modules
  - [x] hub-theme-boot.js - Glass theme initialization
  - [x] hub-defensive-wiring.js - UI wiring for reactive updates
  - [x] hub-ux-enhancement.js - Area/tab persistence and navigation
  - [x] hub-healthcheck.js - Module loading diagnostics
- [x] Replace inline event handlers with addEventListener
  - [x] student/index.html: Toast dismiss and error card buttons
  - [x] hub/index.html: Critical asset banner dismiss button
- [x] Create CI check to prevent regressions
  - [x] scripts/check-inline-scripts.cjs - Scans HTML for violations
  - [x] Added to package.json postbuild hook
  - [x] Checks for inline `<script>` content and onclick/onload/etc. attributes
- [x] Tighten CSP in netlify.toml
  - [x] Removed 'unsafe-inline' from enforced Content-Security-Policy
  - [x] Kept 'unsafe-inline' in Report-Only mode for monitoring
  - [x] Updated comments to reflect Stage 3B status

**How to Add New JavaScript:**

1. **Create an external .js file** in `site/web/` directory
2. **Reference it** with `<script src="/web/your-module.js"></script>` in HTML
3. **For module scripts**, use `<script type="module" src="/web/your-module.js"></script>`
4. **Never add inline scripts** - CI will fail if you do
5. **Replace inline event handlers** with addEventListener:

```javascript
// ❌ BAD: Inline event handler (violates CSP)
button.innerHTML = `<button onclick="doSomething()">Click</button>`;

// ✅ GOOD: Use addEventListener
button.innerHTML = `<button id="myBtn" data-action="do-something">Click</button>`;
const btn = document.getElementById('myBtn');
btn.addEventListener('click', function() {
  doSomething();
});
```

**Running the Inline Scripts Checker:**

```bash
# Check for inline scripts violations
npm run check:inline-scripts

# Runs automatically in CI via postbuild hook
npm run postbuild
```

**Current Policy Status:**

- ✅ Enforced CSP blocks inline scripts
- ✅ 'unsafe-inline' removed from script-src
- ⚠️ style-src still allows 'unsafe-inline' (planned for future phase)
- ✅ Report-Only CSP monitors with 'unsafe-inline' enabled
- ✅ CI guard prevents inline script regressions

**Known Limitations:**

- Presentation files (`site/presentations/**`) contain inline scripts (excluded from CI)
- Test files contain inline scripts (acceptable for test infrastructure)
- Dynamic HTML templates in hub module scripts use onclick (needs refactoring)

**Next Steps (Future Phases):**

1. Refactor dynamic template onclick handlers to use data attributes + addEventListener
2. Consider removing 'unsafe-inline' from style-src (requires CSS extraction)
3. Add Subresource Integrity (SRI) for CDN resources
4. Monitor CSP reports and address any edge cases

## Data Integrity

The application implements client-side CSV validation to prevent malformed or malicious data from entering the system. This reduces the risk of data poisoning, improves user experience on invalid input, and ensures data quality.

### CSV Validation Architecture

**Location:** `site/web/validation.js` and `site/web/csv-iep-validators.js`

**Philosophy:**
- Validate early, fail fast
- Block import until all constraints pass
- Provide clear, actionable error messages
- Normalize data formats for consistency

### IEP Progress CSV Validation

**Target:** `site/student/index.html` IEP Progress tab (`#iepFileInput` and handlers)

**Validation Stages:**

1. **File Constraints:**
   - Type: Must be `text/csv` or have `.csv` extension
   - Size: Maximum 1 MB (configurable via `maxBytes` parameter)
   - Rows: Maximum 2,000 rows (configurable via `maxRows` parameter)

2. **Header Validation:**
   - Required headers (case-insensitive, whitespace-trimmed):
     - `date` - Progress observation date
     - `student_code` - Student identifier
     - `goal_code` - IEP goal identifier
     - `collected_by` - Name of person who collected data
     - `percent` OR `value` - Progress measurement (at least one required)
   - Optional headers:
     - `notes` - Additional observations
     - `method` - Data collection method
     - `source` - Data source

3. **Row-Level Validation:**
   
   | Field | Rules | Normalization |
   |-------|-------|---------------|
   | `date` | ISO `yyyy-mm-dd` or US `MM/DD/YYYY`; must be valid date | Converts US format to ISO |
   | `student_code` | 1-32 chars; A-Z, 0-9, `_`, `-` only | Trimmed |
   | `goal_code` | 1-32 chars; A-Z, 0-9, `_`, `-` only | Trimmed |
   | `percent` or `value` | Number 0-100 | Parsed as float |
   | `collected_by` | 1-64 chars | Trimmed |
   | `notes` (optional) | ≤500 chars | HTML-escaped (`<` → `&lt;`, `>` → `&gt;`) |
   | `method` (optional) | No length limit | HTML-escaped |
   | `source` (optional) | No length limit | HTML-escaped |

4. **Aggregate Validation:**
   - Empty file or header-only: Rejected with error message
   - Error rate threshold: If >10% of rows invalid (configurable via `maxErrorRate`), import is blocked
   - Valid rows with warnings: If error rate ≤10%, valid rows imported, invalid rows skipped with summary

### User Experience on Validation Failure

When validation fails, the user sees:

1. **Error Summary Panel:**
   - Red-bordered panel with clear heading: "❌ CSV Validation Failed"
   - List of top-level errors (e.g., "File size exceeds 1.0 MB limit")
   - Summary statistics: total rows, valid rows, invalid rows, error rate
   - First 20 row errors displayed with row numbers and specific issues

2. **Row Error Format:**
   ```
   Row 15: date: Date must be yyyy-mm-dd or MM/DD/YYYY; percent/value: Value must be between 0 and 100
   ```

3. **Actions:**
   - Dismiss button to clear errors
   - Import is blocked until a valid file is provided

4. **Partial Import (Under Error Threshold):**
   - If error rate ≤10%, valid rows are imported
   - User sees success alert with: "Import successful! 180 valid rows imported. 20 rows had errors and were skipped."

### Security Benefits

- **Input Sanitization:** HTML special characters escaped in text fields
- **Type Safety:** Numbers validated as numeric, dates validated as dates
- **Length Limits:** Prevents oversized inputs (notes ≤500 chars)
- **Pattern Matching:** Student/goal codes restricted to safe character set
- **No Execution:** All validation client-side, no code execution

### Validation Utilities (site/web/validation.js)

**Available Functions:**

| Function | Purpose | Example |
|----------|---------|---------|
| `isString(value)` | Type check | `isString("hello")` → `true` |
| `nonEmpty(value)` | Check if trimmed string non-empty | `nonEmpty("  ")` → `false` |
| `maxLen(value, max)` | Check string length | `maxLen("test", 10)` → `true` |
| `matchRegex(value, regex)` | Pattern matching | `matchRegex("A1", /^[A-Z0-9]+$/)` → `true` |
| `safeTrim(value)` | Trim string safely | `safeTrim("  hi  ")` → `"hi"` |
| `toDateISO(dateStr)` | Parse and normalize date | `toDateISO("12/25/2024")` → `{ok: true, date: "2024-12-25"}` |
| `toNumberInRange(value, min, max)` | Parse number in range | `toNumberInRange("50", 0, 100)` → `{ok: true, value: 50}` |
| `sanitizeText(text)` | HTML escape | `sanitizeText("<script>")` → `"&lt;script&gt;"` |
| `csvHeaderMap(headers, expected)` | Map headers case-insensitively | Returns index map or error |

### CSV Validator API (site/web/csv-iep-validators.js)

**Usage:**

```javascript
import { buildIEPValidator } from '../web/csv-iep-validators.js';

const { validateFile, validateRows } = buildIEPValidator({
  maxBytes: 1_000_000, // 1 MB
  maxRows: 2000,
  maxErrorRate: 0.10 // 10%
});

// Step 1: Validate file
const file = input.files[0];
const fileCheck = await validateFile(file);
if (!fileCheck.ok) {
  showErrors(fileCheck.errors);
  return;
}

// Step 2: Parse CSV (using PapaParse or similar)
const { headers, rows } = await parseCsv(file);

// Step 3: Validate rows
const rowCheck = validateRows(headers, rows);
if (!rowCheck.ok) {
  showErrors(rowCheck.errors, rowCheck.errorSummary);
  return;
}

// Step 4: Import normalized rows
importData(rowCheck.normalizedRows);
```

**Return Values:**

- `validateFile(file)` → `{ ok: boolean, errors?: string[] }`
- `validateRows(headers, rows)` → `{ ok: boolean, normalizedRows?: Array, errors?: Array, errorSummary?: Object }`

**Error Summary Structure:**

```javascript
{
  totalRows: 200,
  validRows: 180,
  invalidRows: 20,
  errorRate: "10.0",
  rowErrors: [
    { row: 15, errors: ["date: Invalid date", "percent/value: Value must be between 0 and 100"] },
    // ... up to 20 errors
  ]
}
```

### Cookie Security Audit

**Audit Date:** 2025-11-12

**Teacher Login Cookie (`tc`):**

Located in `netlify/functions/_lib/auth.js` (`teacherCookie` function):

```javascript
function teacherCookie(name, value, { domain, secure = true, maxAge = 60 * 60 * 8 }) {
  const parts = [
    `${name}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
}
```

**✅ Verified Attributes:**
- `HttpOnly`: ✅ Enabled (prevents JavaScript access)
- `Secure`: ✅ Enabled (HTTPS only, except localhost dev)
- `SameSite=Lax`: ✅ Enabled (CSRF protection)
- `Path=/`: ✅ Site-wide
- `Max-Age=28800`: ✅ 8 hours

**Admin Login Cookie (`rc_admin_session_v3`):**

Located in `netlify/functions/admin-session.js` (`serializeCookie` function):

```javascript
'Set-Cookie': serializeCookie(COOKIE_NAME, token, {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
  maxAge: Math.max(1, MAX_AGE_SECONDS)
})
```

**✅ Verified Attributes:**
- `HttpOnly`: ✅ Enabled
- `Secure`: ✅ Enabled
- `SameSite=Lax`: ✅ Enabled
- `Path=/`: ✅ Site-wide
- `Max-Age=28800`: ✅ 8 hours (default)

**Conclusion:** All authentication cookies correctly configured with security-best-practice attributes.

### Rate Limiting Expansion

**Audit Date:** 2025-11-12

**Endpoints Audited:**
1. `teacher-login.js` - Handles teacher/admin login via JSON API
2. `admin-session.js` - Handles admin login via form POST or JSON

**Throttle Implementation:**

Both endpoints now implement identical throttle and fixed delay patterns:

| Feature | teacher-login.js | admin-session.js |
|---------|------------------|------------------|
| Throttle Window | 60 seconds | 60 seconds |
| Invalid Creds Delay | 150-300ms | 150-300ms |
| Throttle Cookie | `tc_throttle` | `admin_throttle` |
| Cookie Attributes | HttpOnly, SameSite=Lax | HttpOnly, SameSite=Lax |
| IP Hashing | ✅ Yes | ✅ Yes |

**How It Works:**

1. **Invalid Credentials:**
   - Fixed delay added (150-300ms randomized)
   - Throttle cookie set with hashed IP and timestamp
   - 401/redirect response returned

2. **Throttle Check:**
   - On subsequent request, checks for throttle cookie
   - If cookie present and within window (60s), request blocked
   - Returns 429 (teacher-login) or redirects to login with error (admin-session)

3. **Brute-Force Protection:**
   - Delay reduces timing attack effectiveness
   - Per-IP throttle adds friction to automated attacks
   - Short window (60s) balances security and UX

**Other Sensitive Endpoints:**

The following endpoints were reviewed and **do not require throttling**:
- `teacher-session.js` - Session verification (no credentials processed)
- `admin-session-check.js` - Session check (no credentials processed)
- `auth-health.js` - Public health check (no sensitive data)

**Conclusion:** All credential-accepting endpoints protected with throttle and fixed delay. No additional endpoints identified that require throttling.

### Testing Data Integrity

See [DEPLOYMENT_VERIFICATION.md](../DEPLOYMENT_VERIFICATION.md#csv-validation-verification) for manual test cases and verification steps.

## Telemetry (Optional)

The application includes an **opt-in** client error telemetry system to help diagnose client-side issues in production. This system is privacy-safe, rate-limited, and disabled by default.

### Overview

**What It Does:**
- Captures JavaScript errors and unhandled promise rejections
- Records timing metrics for key operations (e.g., dynamic imports)
- Sends sanitized telemetry events to `/.netlify/functions/client-error`

**Privacy & Security:**
- ✅ **Opt-in only**: Disabled by default for all users
- ✅ **No PII collected**: Never logs cookies, localStorage, or full user-agent
- ✅ **Sanitized payloads**: Removes angle brackets, truncates long strings
- ✅ **Rate limited**: 10 events per minute per client (IP + client ID)
- ✅ **Server-side only**: Telemetry data exists only in Netlify function logs
- ✅ **Throttling with delay**: 150-300ms delay on rate limit rejection

### How to Enable Diagnostics

Telemetry is only active when diagnostic mode is enabled via one of these methods:

**Option 1: URL Parameter (Recommended for Ad-Hoc Debugging)**
```
https://reinischclassroom.com/student/?diag=1
```

**Option 2: localStorage Flag (Persistent Across Sessions)**
```javascript
localStorage.setItem('rcDiagEnabled', '1');
// Then reload the page
```

**Option 3: Feature Flag (Programmatic)**
```javascript
window.RC_DIAG_ENABLED = true;
// Must be set before diagnostics.js loads
```

**To Disable:**
- Remove `?diag=1` from URL, or
- Run `localStorage.removeItem('rcDiagEnabled')` and reload, or
- Set `window.RC_DIAG_ENABLED = false`

### What Gets Collected

#### Error Events (`type: 'error'`)

When an error occurs (window.error or unhandledrejection):

**Captured Fields:**
- `message`: Error message (truncated to 512 chars, angle brackets removed)
- `name`: Error name (e.g., "TypeError", "ReferenceError")
- `stack`: Stack trace (first 30 lines, max 4KB, sanitized)
- `source`: Source file URL (truncated to 256 chars)
- `lineno`: Line number
- `colno`: Column number
- `page`: Page path (no query string or hash)
- `clientId`: Client request ID (UUID v4)
- `ts`: Timestamp (epoch milliseconds)

**Not Collected:**
- ❌ Cookies
- ❌ localStorage/sessionStorage
- ❌ Full user-agent string
- ❌ User input or form data
- ❌ Referrer (truncated if logged)

#### Metric Events (`type: 'metric'`)

When a timing metric is recorded:

**Captured Fields:**
- `name`: Metric name (e.g., "dynamic-import-student-portal")
- `durationMs`: Duration in milliseconds
- `detail`: Optional detail string (truncated to 512 chars)
- `page`: Page path
- `clientId`: Client request ID
- `ts`: Timestamp

**Example Metrics:**
- Dynamic import load times for Student Portal modules
- Hub initialization time
- Module loading diagnostics

### Rate Limiting

**Throttle Policy:**
- **Limit**: 10 events per minute per client (keyed by IP + client ID)
- **Window**: 60 seconds (rolling)
- **Mechanism**: Cookie-based counter with optional HMAC signing
- **Response on throttle**: 429 Too Many Requests
- **Rejection delay**: 150-300ms random delay added on throttle

**Throttle Cookie (`ce_throttle`):**
```
ce_throttle=<timestamp>_<hashed_key>_<count>[_<hmac>]
Path=/
HttpOnly
SameSite=Lax
Max-Age=60
```

**Behavior:**
- First 10 events within 60s: Accepted (204 No Content)
- 11th+ event within 60s: Rejected (429 Too Many Requests)
- After 60s: Counter resets, new window begins

**Additional Protections:**
- Events dropped if offline (navigator.onLine === false)
- Events dropped after 2 consecutive send failures
- Queue limited to 10 events, flushed every 5 seconds

### Telemetry Endpoint: client-error

**Path:** `/.netlify/functions/client-error`

**Request Format:**
```json
POST /.netlify/functions/client-error
Content-Type: application/json
X-Client-Request-Id: <uuid>

{
  "type": "error",
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "page": "/student/",
  "ts": 1699889234567,
  "payload": {
    "message": "Cannot read property 'foo' of undefined",
    "name": "TypeError",
    "stack": "TypeError: Cannot read property...\n  at Object...",
    "source": "https://reinischclassroom.com/web/student-portal.js",
    "lineno": 42,
    "colno": 15
  }
}
```

**Response:**
- `204 No Content`: Event logged successfully
- `400 Bad Request`: Invalid payload or schema violation
- `429 Too Many Requests`: Rate limit exceeded (includes throttle cookie)

**Validation:**
- Body size: ≤ 25 KB
- Content-Type: Must be `application/json`
- `type`: Must be `"error"` or `"metric"`
- `clientId`: UUID v4 format (optional, derived from header if missing)
- `page`: String, ≤ 256 characters
- `ts`: Number (epoch ms), within ±24 hours of server time
- `payload`: Object with type-specific fields (allowlist enforced)

**Payload Sanitization:**
- Removes angle brackets (`<`, `>`) from text fields
- Truncates `message` to 512 chars
- Truncates `stack` to first 30 lines and 4KB
- Truncates `source` to 256 chars
- Allowlist: Only expected fields are logged; extra fields dropped

**Logged Output:**
```
[client-error] [550e8400-e29b-41d4-a716-446655440000] Request received
[client-error] [550e8400-e29b-41d4-a716-446655440000] Client Request ID: client-abc-123
[client-error] [550e8400-e29b-41d4-a716-446655440000] ERROR - page: /student/, name: TypeError, message: Cannot read property 'foo' of undefined
[client-error] [550e8400-e29b-41d4-a716-446655440000]   stack: TypeError: Cannot read property...
```

### Using the Telemetry API

**Automatic Error Capture:**

Errors are captured automatically when diagnostics are enabled:

```javascript
// This error will be captured and sent automatically
throw new Error('Something went wrong');

// Unhandled promise rejections are also captured
fetch('/api/data').then(res => res.json()); // If fetch fails
```

**Manual Metric Recording:**

```javascript
// Record a timing metric
window.rcTelemetry.recordMetric('user-action', 250, 'button-click');

// Measure an async operation
const result = await window.rcTelemetry.measureAsync('fetch-data', async () => {
  return await fetch('/api/data').then(r => r.json());
});
```

**Programmatic Error Capture:**

```javascript
// Capture a custom error
window.rcTelemetry.captureError({
  message: 'Custom error message',
  name: 'CustomError',
  stack: new Error().stack,
  source: 'my-module.js',
});
```

### Viewing Telemetry Data

**Via Netlify Function Logs:**

1. Log in to Netlify dashboard
2. Select your site
3. Click "Functions" → "client-error"
4. Click "View logs"
5. Search for request IDs or error messages

**Via Netlify CLI:**

```bash
netlify functions:log client-error --live
```

**Filtering Logs:**

```bash
# Search for specific error type
netlify functions:log client-error | grep "TypeError"

# Search for specific page
netlify functions:log client-error | grep "page: /student/"

# Search by client request ID
netlify functions:log client-error | grep "client-abc-123"
```

### Sampling (Not Implemented)

Currently, all events are sent when diagnostics are enabled. Future enhancements may include:
- Sampling rate (e.g., send 10% of events)
- Error deduplication (suppress repeated identical errors)
- Configurable flush interval and batch size

### Best Practices

**For Developers:**
- Enable `?diag=1` when debugging issues in production
- Use localStorage flag for persistent diagnostic sessions
- Check telemetry logs after deploying major changes
- Monitor throttle 429s to detect excessive error rates

**For Admins:**
- Keep diagnostics disabled for end users (default)
- Enable selectively for users reporting issues
- Review telemetry logs weekly for emerging patterns
- Document any recurring errors in issue tracker

**For Users:**
- Diagnostics are off by default; no telemetry sent
- Only enable if instructed by support team
- Remove `?diag=1` from URL when done troubleshooting

### Privacy Guarantees

**What We Never Collect:**
- ❌ Cookies (session tokens, auth cookies)
- ❌ localStorage or sessionStorage contents
- ❌ Full user-agent string (only truncated UA if needed)
- ❌ Referrer URLs (truncated or omitted)
- ❌ Form input values
- ❌ Personally identifiable information (PII)
- ❌ IP addresses (used only for rate limiting, not stored)

**What We Do Collect (When Opted In):**
- ✅ Error messages (sanitized)
- ✅ Stack traces (truncated)
- ✅ Page paths (no query params)
- ✅ Timing metrics
- ✅ Client request IDs (for correlation)

**Data Retention:**
- Telemetry data exists only in Netlify function logs
- Logs are retained per Netlify's retention policy (typically 30 days)
- No separate database or long-term storage
- Can be extended to a datastore in the future if desired

### Troubleshooting

**Issue: Telemetry not working**
- **Cause**: Diagnostics not enabled
- **Fix**: Add `?diag=1` to URL or set localStorage flag

**Issue: 429 Too Many Requests**
- **Cause**: More than 10 events in 60 seconds
- **Fix**: Wait 60 seconds, or reduce error frequency

**Issue: Events not appearing in logs**
- **Cause**: Offline, network error, or throttled
- **Fix**: Check browser console for `[rcDiag]` messages

**Issue: CORS error on telemetry fetch**
- **Cause**: Origin not in allowlist
- **Fix**: Ensure request is from same origin or trusted domain

### Manual Testing

#### Test 1: Enable Diagnostics and Trigger Error

```bash
# 1. Open browser to https://reinischclassroom.com/student/?diag=1
# 2. Open DevTools Console
# 3. Run: setTimeout(() => { throw new Error('diagnostic test error'); }, 0)
# 4. Check Network tab for POST to /.netlify/functions/client-error
# 5. Verify response is 204 No Content
```

**Expected:**
- Request sent to `/.netlify/functions/client-error`
- Response: 204 No Content
- Response headers include `X-Request-Id`
- Console shows `[rcDiag] Capturing error: diagnostic test error`
- Function logs show sanitized error with page, name, message

#### Test 2: Record Metric

```bash
# 1. Enable diagnostics (?diag=1)
# 2. In console, run: window.rcTelemetry.recordMetric('test-metric', 123, 'test detail')
# 3. Wait up to 5 seconds for batch flush
# 4. Check Network tab for POST request
```

**Expected:**
- Request sent with `type: 'metric'`
- Payload includes `name: 'test-metric'`, `durationMs: 123`, `detail: 'test detail'`
- Response: 204 No Content

#### Test 3: Verify Throttling

```bash
# 1. Enable diagnostics
# 2. In console, run this loop:
for (let i = 0; i < 12; i++) {
  setTimeout(() => {
    throw new Error('throttle test ' + i);
  }, i * 100);
}
# 3. Check Network tab
```

**Expected:**
- First 10 requests: 204 No Content
- 11th and 12th requests: 429 Too Many Requests
- Console shows `[rcDiag] Telemetry throttled (429)`

#### Test 4: Verify Diagnostics Disabled = No Telemetry

```bash
# 1. Navigate to https://reinischclassroom.com/student/ (no ?diag=1)
# 2. In console, run: throw new Error('should not send')
# 3. Check Network tab
```

**Expected:**
- No request to `/.netlify/functions/client-error`
- Error appears in console but not sent to server

#### Test 5: Verify Payload Sanitization

```bash
# 1. Enable diagnostics
# 2. In console, run: throw new Error('<script>alert("xss")</script>')
# 3. Check function logs
```

**Expected:**
- Logged message has angle brackets removed: `scriptalert("xss")/script`
- No script execution or XSS

### References

- [DEPLOYMENT_VERIFICATION.md](../DEPLOYMENT_VERIFICATION.md) - Telemetry verification steps
- [site/web/diagnostics.js](../../site/web/diagnostics.js) - Client telemetry implementation
- [netlify/functions/client-error.js](../../netlify/functions/client-error.js) - Telemetry endpoint


