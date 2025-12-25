# Admin Setup Guide

This guide explains how to configure the admin uploader interface for Reinisch Classroom.

## Overview

The admin uploader allows authorized users to upload presentations and manage content. For security reasons, it requires proper environment variable configuration before it can be used.

## Required Environment Variables

The following environment variables must be set in Netlify:

### `ADMIN_SESSION_SECRET`
- **Description:** A secret key used to sign session cookies
- **Format:** Random string of at least 32 characters
- **Example:** `your-very-secure-random-32-char-secret-key-here-12345`
- **Generation:** Use a secure random generator like `openssl rand -base64 32`

### `ADMIN_USER`
- **Description:** The username for admin authentication
- **Format:** String (alphanumeric recommended)
- **Example:** `admin`

### `ADMIN_PASS`
- **Description:** The password for admin authentication
- **Format:** String (use a strong password)
- **Example:** `your-secure-password-here`
- **Note:** Store this securely; do not commit it to version control

## Configuration Steps

### For Production Environment

1. Log in to your Netlify dashboard
2. Navigate to your site
3. Go to **Site settings → Environment variables**
4. Click **Add a variable** or **Add environment variable**
5. Add each required variable:
   - Key: `ADMIN_SESSION_SECRET`
   - Value: Your generated secret (32+ characters)
   - Scopes: Select **Production** (and optionally Deploy previews, Branch deploys)
6. Repeat for `ADMIN_USER` and `ADMIN_PASS`
7. Click **Save**

### For Deploy Previews

If you want admin access in Deploy Previews:

1. When adding/editing environment variables, ensure the **Deploy previews** scope is selected
2. Alternatively, use branch-specific variables for specific preview branches
3. Redeploy the preview after adding variables

### For Local Development

For local testing with Netlify CLI:

1. Create a `.env` file in the project root (DO NOT commit this file)
2. Add the required variables:
   ```
   ADMIN_SESSION_SECRET=your-secret-key-here
   ADMIN_USER=admin
   ADMIN_PASS=your-password
   ```
3. Run `netlify dev` to start local development server
4. The edge functions will read from your `.env` file

## Verification

After configuration:

1. Redeploy your site (or wait for the next deploy)
2. Navigate to `/admin/`
3. You should be redirected to `/admin-login/` (not `/admin-not-configured/`)
4. Enter your `ADMIN_USER` and `ADMIN_PASS` credentials
5. After successful login, you should see the admin uploader interface

## Troubleshooting

### "Admin Not Configured" Message

If you see this message:
- Verify all three environment variables are set
- Check that variables are scoped to the correct environment (Production, Deploy Preview, etc.)
- Ensure you've redeployed after adding variables
- For Deploy Previews, ensure preview-specific scopes are enabled

### Login Page Shows Errors

If the login page loads but shows errors:
- Verify `ADMIN_USER` and `ADMIN_PASS` values match your credentials
- Check browser console for any JavaScript errors
- Verify `ADMIN_SESSION_SECRET` is at least 32 characters

### Can't Access After Login

If login succeeds but you can't access admin:
- Check browser cookies are enabled
- Verify session cookies (`rc_admin_session_v4`, `rc_admin_refresh_v1`) are being set
- Check for HTTPS/secure context issues

## Security Notes

1. **Never commit** environment variables to version control
2. Use strong, unique passwords for `ADMIN_PASS`
3. Regenerate `ADMIN_SESSION_SECRET` periodically
4. Limit access to Netlify dashboard to trusted team members only
5. Consider using Netlify's built-in secret scanning features

## Additional Resources

- [Netlify Environment Variables Documentation](https://docs.netlify.com/environment-variables/overview/)
- [Netlify Deploy Contexts](https://docs.netlify.com/configure-builds/deploy-contexts/)
- Repository documentation: See `ADMIN_UPLOAD_GUIDE.md` and `ADMIN_SESSION_HARDENING.md` for more details

## Support

If you continue to experience issues:
1. Check the repository's GitHub Issues
2. Review the `ADMIN_LOGIN_ERROR_CODES.md` documentation
3. Consult with the development team
