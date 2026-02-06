### Merge readiness checklist (Supabase unified auth)

Here’s the pre-merge checklist to safely land unified Supabase auth and guardrails.

Required runtime config (Netlify Functions scope)
- SUPABASE_URL or SUPABASE_URL_RUNTIME
- SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_KEY_RUNTIME (service role key)
- SESSION_SECRET (>=32 chars)
- ADMIN_SESSION_SECRET (>=32 chars)

Supabase schema + RPCs (should already be applied)
- Table public.app_users exists with columns: username (unique, lowercased), password_hash, role, student_id (uuid), created_at, updated_at
- Functions exist with these exact signatures/returns:
  - public.set_user_password(text, text, text, uuid default null) returns app_users
  - public.verify_user_password(text, text) returns setof app_users

Seed or reset credentials

> ⚠️ **SECURITY NOTE:** Replace `<YOUR_ADMIN_USERNAME>` and `<YOUR_ADMIN_PASSWORD>` with your actual credentials. Never commit real credentials to this file.

```sql
select public.set_user_password('<YOUR_ADMIN_USERNAME>','<YOUR_ADMIN_PASSWORD>','admin');
-- or
-- select public.set_user_password('<YOUR_ADMIN_USERNAME>','<YOUR_ADMIN_PASSWORD>','teacher');
```

Exposed secret unblock (Netlify)
- Rotate DMIN_USER_ALIASES to a random string not present in the site, or mark the flagged value “Safe” on the failing deploy to unblock previews.
- Then: Deploys → Trigger deploy → Clear cache and deploy site

Smoke tests (Preview URL)
```bash
# Health
curl -s https://<preview>/.netlify/functions/auth-health | jq

# Teacher login
curl -i -X POST https://<preview>/.netlify/functions/teacher-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<YOUR_ADMIN_USERNAME>","password":"<YOUR_ADMIN_PASSWORD>"}'

# Session
curl -s https://<preview>/.netlify/functions/teacher-session
```
Expected:
- auth-health: ok: true and all required runtime keys reported as present (booleans only)
- teacher-login: HTTP 200 with Set-Cookie: tc=...
- teacher-session: { ok: true, role: "admin"|"teacher", username: "<YOUR_ADMIN_USERNAME>" }

Post-merge steps
- Keep Auto Publishing locked until preview verifies
- Merge with “Squash and merge” for a clean history
- Clear cache and deploy to production
- Optionally rotate/remove ADMIN_USER_ALIASES/DMIN_USER_ALIASES after deploy; they’re no longer read by code

Notes
- PR 180 supersedes PR 179. After merging this PR, close PR 179 as superseded.
- If preview still fails on exposed-secret checks, rotate the flagged value and retry the cached-clear redeploy.

Ping @danreinisch for approval to proceed with merge once the above checks are green.