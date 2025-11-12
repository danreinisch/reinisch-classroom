# Deployment Verification Guide

This document provides checklists and validation procedures for verifying deployments of Reinisch Classroom.

## Pre-Deployment Checklist

- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build completes without errors
- [ ] No inline scripts detected (`npm run check:inline-scripts`)
- [ ] No environment leaks detected (`node scripts/check-env-leaks.js`)
- [ ] Documentation updated for any new features or changes

## Post-Deployment Verification

### 1. Content Security Policy (CSP) Validation

**Check CSP Headers:**

```bash
# Check enforced CSP header
curl -I https://your-domain.netlify.app/ | grep -i content-security-policy

# Expected (Stage 3B):
# Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://*.supabase.co; ...
# (should NOT contain 'unsafe-inline' in script-src)

# Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; ...
# (Report-Only mode SHOULD contain 'unsafe-inline' for monitoring)
```

**Verify No CSP Violations:**

1. Open Student Portal: https://your-domain.netlify.app/student/
2. Open Browser Developer Tools (F12)
3. Check Console for CSP violations
   - ❌ If violations appear: Inline scripts/handlers need to be fixed
   - ✅ No CSP violations: Policy is correctly configured

4. Open Teacher Center: https://your-domain.netlify.app/hub/
5. Repeat console check for CSP violations

**Test Authentication Flow:**

1. Navigate to Student Portal
2. Enter student code and submit
3. Verify dashboard loads without CSP errors
4. Test logout redirect to root (/)
5. Verify login form appears again

### 2. Functionality Testing

**Student Portal:**

- [ ] Login form displays correctly
- [ ] Student login succeeds with valid code
- [ ] Dashboard loads with assignments
- [ ] Assignment cards render properly
- [ ] Assignment detail modal opens
- [ ] Logout redirects to /
- [ ] Auto-login (24h remember-me) works after refresh

**Teacher Center:**

- [ ] Hub page loads with correct navigation
- [ ] Teacher authentication modal works
- [ ] Area switching (Overview/Work/Data) functions
- [ ] Tab persistence works across page refreshes
- [ ] Student portal manager displays
- [ ] IEP progress tracking loads
- [ ] Theme toggle works (glass-bold)
- [ ] Module loading diagnostics display correctly

### 3. Security Headers Validation

**Check All Security Headers:**

```bash
curl -I https://your-domain.netlify.app/ | grep -E "Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options|Referrer-Policy|Permissions-Policy|Content-Security-Policy"
```

**Expected Headers:**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://*.supabase.co; style-src 'self' 'unsafe-inline'; ...
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; ...
```

### 4. CSP Report Monitoring

**Check CSP Reports:**

```bash
# View Netlify Function logs for CSP reports
netlify functions:list
netlify functions:log csp-report --tail

# Or check Netlify dashboard: Functions > csp-report > Logs
```

**What to Look For:**

- Blocked inline scripts (should be zero after Stage 3B)
- Blocked inline event handlers (should be zero for main pages)
- Unexpected external domains (indicates new dependencies)
- Report frequency (high frequency may indicate real issues)

### 5. Performance Checks

**Page Load Times:**

- [ ] Student Portal loads in < 3 seconds
- [ ] Teacher Center loads in < 5 seconds
- [ ] No JavaScript errors in console
- [ ] External module scripts load successfully

**Module Loading:**

- [ ] Check for "Module Load Issue" toast (should not appear)
- [ ] Verify hub-theme-boot.js loads
- [ ] Verify student-portal-failsafe.js runs
- [ ] Check Network tab for 404s on .js files

### 6. CI/CD Verification

**Verify CI Checks Pass:**

```bash
# Run locally to simulate CI
npm run postbuild
# Should run: check-env-leaks.js AND check-inline-scripts.cjs
# Both should exit with code 0 (success)
```

**Expected Output:**

```
✅ All checks passed! No inline scripts or event attributes found.
📦 Files checked: X
```

## Rollback Procedure

If critical issues are found post-deployment:

1. **Immediate:** Add 'unsafe-inline' back to enforced CSP in netlify.toml
2. **Identify:** Check CSP reports and browser console for violations
3. **Fix:** Address inline scripts or event handlers causing violations
4. **Redeploy:** Once fixed, remove 'unsafe-inline' again
5. **Monitor:** Watch CSP reports for 24-48 hours after deployment

## Common Issues & Solutions

### Issue: CSP blocks legitimate scripts

**Symptoms:** Console shows "Refused to load script" errors

**Solution:** Check script-src in netlify.toml includes necessary domains:
- `'self'` for local scripts
- `https://cdnjs.cloudflare.com` for CDN libraries
- `https://*.supabase.co` for Supabase client

### Issue: Inline event handlers break

**Symptoms:** Buttons don't respond, onclick doesn't work

**Solution:** Refactor to use addEventListener:

```javascript
// Replace: <button onclick="doThing()">
// With: <button id="myBtn" data-action="do-thing">
document.getElementById('myBtn').addEventListener('click', doThing);
```

### Issue: Dynamic content with inline handlers

**Symptoms:** Toast/modal buttons created via innerHTML don't work

**Solution:** Use data attributes and set up listeners after insertion:

```javascript
element.innerHTML = '<button data-action="dismiss">X</button>';
element.querySelector('[data-action="dismiss"]').addEventListener('click', handleDismiss);
```

### Issue: Module scripts fail to load

**Symptoms:** "Module loading error" banner, features unavailable

**Solution:**
1. Check Network tab for 404s
2. Verify script paths are correct (relative to HTML file)
3. Ensure scripts are deployed (check netlify deploy logs)
4. Clear browser cache and hard refresh

## Related Documentation

- [GUARDRAILS.md](./GUARDRAILS.md) - Complete security guardrails guide
- [README.md](../README.md) - Project overview and setup
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase configuration guide
