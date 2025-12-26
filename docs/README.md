# Reinisch Classroom Documentation

This directory contains documentation for the Reinisch Classroom project.

## Admin Setup

The admin uploader requires environment variables to be configured in Netlify before it can be used.

### Quick Setup (Netlify)

1. Navigate to your Netlify site dashboard
2. Go to **Site settings → Build & deploy → Environment variables** (or **Site settings → Environment variables**)
3. Add the following required variables:
   - `ADMIN_SESSION_SECRET` - A random 32+ character string (generate with `openssl rand -base64 32`)
   - `ADMIN_USER` - Your admin username
   - `ADMIN_PASS` - Your admin password

4. For Deploy Previews, ensure these variables are also scoped to "Deploy previews" context

For detailed instructions, see [ADMIN_SETUP.md](./ADMIN_SETUP.md).

## Other Documentation

- [ADMIN_SETUP.md](./ADMIN_SETUP.md) - Detailed admin configuration guide
- [ADMIN_UPLOAD_GUIDE.md](../ADMIN_UPLOAD_GUIDE.md) - Guide for using the admin uploader
- [ADMIN_SESSION_HARDENING.md](../ADMIN_SESSION_HARDENING.md) - Security details for admin sessions
