# Teacher Authentication Environment Variables

This file documents the environment variables required for server-backed teacher authentication.

## Required Environment Variables

Configure these in your Netlify site settings under **Site settings > Environment variables**:

### `TEACHER_USERNAME`
The username for teacher login.

**Example:** `teacher`

**Note:** Use a secure, non-obvious username in production.

---

### `TEACHER_PASSWORD`
The password for teacher login.

**Example:** `your-secure-password-here`

**Security recommendations:**
- Use a strong password with at least 16 characters
- Include a mix of uppercase, lowercase, numbers, and symbols
- Do NOT commit this value to the repository
- Rotate passwords periodically

---

### `SESSION_SECRET`
A secret key used to sign session tokens (JWT).

**Example:** `your-random-secret-key-min-32-chars`

**Security requirements:**
- Must be at least 32 characters long
- Use a cryptographically random string
- Keep this value secret and never commit it to the repository
- Generate using: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Setting Environment Variables in Netlify

1. Go to your Netlify site dashboard
2. Navigate to **Site settings > Environment variables**
3. Click **Add a variable** or **Add a single variable**
4. Enter the variable name (e.g., `TEACHER_USERNAME`)
5. Enter the variable value
6. Select which scopes need the variable (typically "All", but can restrict to "Production" or "Deploy Previews")
7. Click **Create variable**
8. Repeat for all three required variables

## Redeployment

After adding or changing environment variables:
1. Go to **Deploys** in your Netlify dashboard
2. Click **Trigger deploy > Clear cache and deploy site**
3. Wait for the deployment to complete

The new environment variables will be available to your serverless functions after redeployment.

## Testing

After deployment, test the authentication:
1. Visit your Classroom Hub at `/site/hub/`
2. Click the **Teacher Center** button
3. Enter your configured username and password
4. Verify that login succeeds with correct credentials
5. Verify that login fails with incorrect credentials

## Security Notes

- The `TEACHER_PASSWORD` and `SESSION_SECRET` should NEVER be committed to the repository
- This file (`TEACHER_AUTH_ENV.sample.md`) contains only placeholder examples
- The actual credentials should only exist in:
  - Netlify environment variables
  - Secure password managers
  - Encrypted secrets management systems

- Never log credentials in serverless functions
- Session tokens expire after 8 hours for security
- Sessions use HttpOnly cookies to prevent XSS attacks
- Cookies are marked `Secure` to enforce HTTPS

### Additional Production Security Recommendations

1. **CORS Configuration**: The authentication endpoints currently allow requests from any origin (`*`). For production, consider restricting CORS to your specific domain in the function files.

2. **Rate Limiting**: Consider implementing rate limiting on the login endpoint to prevent brute force attacks. This can be done using:
   - Netlify Rate Limiting add-on
   - Cloudflare (if using as CDN)
   - Application-level rate limiting with Redis/similar

3. **Monitoring**: Set up monitoring/alerting for:
   - Failed login attempts
   - Unusual authentication patterns
   - Session token usage

4. **Password Policy**: Enforce strong password requirements:
   - Minimum 16 characters
   - Mix of character types
   - Regular rotation schedule
   - Avoid common passwords

---

## Troubleshooting

### Issue: 404 Errors for Scripts (feature-flags.js, etc.)

**Symptoms:**
- Clicking "Unlock" on the teacher login does nothing
- Browser console shows 404 errors for `/web/feature-flags.js` or other scripts
- No network request is made when clicking Unlock
- Login form appears but doesn't respond

**Root Cause:**
The hub page uses relative paths for some script imports, which can resolve incorrectly depending on the deployment path. When a critical module like `feature-flags.js` fails to load with a 404, the entire module initialization chain is aborted, preventing the login handler from attaching.

**Fix:**
All shared module script references in `/site/hub/index.html` should use **absolute paths** (starting with `/web/`) instead of relative paths (`../web/` or `../../web/`).

**Correct:**
```javascript
import { getFeatureFlag } from '/web/feature-flags.js';
```

**Incorrect:**
```javascript
import { getFeatureFlag } from '../../web/feature-flags.js';
```

**Verification:**
1. Open browser DevTools (F12) and go to the Network tab
2. Hard reload the page (Ctrl+Shift+R or Cmd+Shift+R)
3. Filter by "JS" or search for "feature-flags"
4. Verify the request shows **200 OK** for `/web/feature-flags.js`
5. If you see a 404, check that all imports in the HTML use absolute paths

**Resilient Fallbacks:**
The hub now includes fallback mechanisms:
- If `feature-flags.js` fails to load, stub functions are provided
- A visible error banner appears explaining the issue
- Login functionality still works with conservative feature defaults
- All errors are logged to the console with the `[Hub Init]` prefix

**Production Asset Self-Check:**
On page load (production only), the hub automatically checks critical assets with HEAD requests. If any return 404, a dismissible alert appears showing:
- Which assets are missing
- Suggested fix (use absolute paths)

This helps catch deployment issues early.
