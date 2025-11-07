# Teacher Authentication - Environment Variables

This document describes the required environment variables for the server-backed teacher authentication system.

## Required Environment Variables

These must be set in your Netlify deployment environment:

### `TEACHER_USERNAME`
- **Description**: The username for teacher login
- **Example**: `dreinisch`
- **Required**: Yes (no default in production)

### `TEACHER_PASSWORD`
- **Description**: The password for teacher login
- **Example**: `Tool462` or a strong password
- **Required**: Yes (no default in production)
- **Security Note**: Use a strong password in production

### `SESSION_SECRET`
- **Description**: Secret key used to sign JWT tokens for session cookies
- **Example**: A long random string (e.g., `your-very-secure-random-string-here-at-least-32-chars`)
- **Required**: Yes (critical for security)
- **Security Note**: Must be a strong, random string at least 32 characters long. Never commit this to version control.

### `URL` (Optional)
- **Description**: Your Netlify site URL, used for CORS configuration
- **Example**: `https://your-site.netlify.app`
- **Default**: `*` (allows all origins, only use for development)
- **Security Note**: Netlify automatically sets this variable for you. If not set, CORS will default to wildcard which is less secure.

## How to Set Environment Variables in Netlify

1. Go to your Netlify site dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Click **Add a variable** and add each of the above variables
4. After adding/updating environment variables, trigger a new deploy:
   - Go to **Deploys** tab
   - Click **Trigger deploy** → **Deploy site**

## Local Development

For local development, the system will fall back to:
- Username: value from localStorage `rc_teacher_user` or `teacher`
- Password: value from localStorage `rc_teacher_pass` or `teacher123`

If the server endpoint returns 404 (function not found), the system automatically falls back to local authentication.

## Authentication Flow

1. User enters username and password in the Teacher modal
2. Client sends POST request to `/.netlify/functions/teacher-login` with credentials
3. Server validates against `TEACHER_USERNAME` and `TEACHER_PASSWORD`
4. On success, server issues an HttpOnly cookie (`tc`) valid for 8 hours
5. Cookie is signed using `SESSION_SECRET` for security
6. Client shows Teacher view and restores last selected area/tab

## Session Verification

The `/.netlify/functions/teacher-session` endpoint can be used to verify an active session:
- Method: GET
- Checks for valid `tc` cookie
- Returns 200 if session is valid, 401 if not

## Troubleshooting

### Authentication fails even with correct credentials
- Check that environment variables are set correctly in Netlify
- Verify you've triggered a new deploy after setting variables
- Check browser console for network errors

### Function not found (404)
- System will fall back to local authentication
- This is normal for local development
- In production, check that `netlify.toml` has `functions = "netlify/functions"`

### Session expires too quickly
- Default session duration is 8 hours
- To change, modify `expSec` parameter in both functions (currently `60 * 60 * 8`)

## Security Notes

1. Always use HTTPS in production (cookies have `Secure` flag)
2. Cookies are `HttpOnly` to prevent XSS attacks
3. Cookies use `SameSite=Lax` to prevent CSRF attacks
4. Never commit `SESSION_SECRET` to version control
5. Use strong, unique passwords for production
6. Rotate `SESSION_SECRET` periodically
