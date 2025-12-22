# Viewer Manual Tests - PR #301

This document provides manual test cases for verifying the restored viewer implementation in PR #301.

## Background

PR #300 accidentally overwrote `site/assets/js/viewer.js` with stub content, removing the real viewer logic. PR #301 restores the complete implementation and adds missing features (return parameter, directory handling, smart close).

## Test Environment

These tests should be performed on the Netlify Preview deployment for this PR.

## Test Cases

### Test 1: Canonical Viewer URL with Return Parameter

**URL to test:**
```
/viewer/?src=%2Fpresentations%2Fa-door-into-time%2Fpresentation-05%2F&return=%2Flanguage-arts%2F
```

**Expected behavior:**
- [ ] Page loads without errors
- [ ] Viewer controls visible at top (Close, Presentation Mode, Full Screen buttons)
- [ ] Iframe loads the presentation content
- [ ] No console errors related to viewer
- [ ] Click "Close" button → navigates to `/language-arts/`

**What to verify:**
- Return parameter is respected for Close button navigation
- Iframe sandbox is working (no security errors)
- UI is functional

---

### Test 2: Directory Source Handling

**URL to test:**
```
/viewer/?src=%2Flanguage-arts%2Ftoolkit%2Fpresentations%2Fpresentation-01%2F
```

**Expected behavior:**
- [ ] Page loads without errors
- [ ] Viewer automatically appends `index.html` to the directory path
- [ ] Iframe loads the presentation from `.../presentation-01/index.html`
- [ ] Content displays correctly in iframe

**What to verify:**
- Directory paths ending with `/` are normalized to include `index.html`
- Content loads successfully
- Check browser console for log: `[viewer] Initialized with src: /language-arts/toolkit/presentations/presentation-01/index.html`

---

### Test 3: Presentation Mode

**URL to test:** (any valid viewer URL, e.g., from Test 1)

**Steps:**
1. Load a presentation in viewer
2. Click "Presentation Mode" button

**Expected behavior:**
- [ ] Button text changes to "Exit Presentation"
- [ ] Viewer controls remain visible but iframe maximizes
- [ ] Page gets `presentation-mode` class (check with DevTools)
- [ ] Click "Exit Presentation" → controls show normally again

**What to verify:**
- Presentation mode toggles correctly
- Content remains visible and usable
- Mode can be exited

---

### Test 4: Fullscreen Mode

**URL to test:** (any valid viewer URL, e.g., from Test 1)

**Steps:**
1. Load a presentation in viewer
2. Click "Full Screen" button

**Expected behavior:**
- [ ] Viewer enters fullscreen mode
- [ ] Button text changes to "Exit Fullscreen"
- [ ] Iframe content is visible in fullscreen
- [ ] Press Escape key OR click "Exit Fullscreen" → exits fullscreen

**What to verify:**
- Fullscreen API works correctly
- Viewer container (not just iframe) goes fullscreen
- Can exit with button or Escape key
- Check console log: `[viewer] Entered fullscreen` and `[viewer] Exited fullscreen`

---

### Test 5: Keyboard Shortcuts

**URL to test:** (any valid viewer URL, e.g., from Test 1)

**Steps:**
1. Load a presentation in viewer
2. Press Alt+P (or Option+P on Mac)
3. Verify presentation mode toggles
4. Press Alt+F (or Option+F on Mac)
5. Verify fullscreen toggles
6. Press Escape while in presentation mode
7. Verify presentation mode exits

**Expected behavior:**
- [ ] Alt+P toggles presentation mode
- [ ] Alt+F toggles fullscreen
- [ ] Escape exits presentation mode (if active)
- [ ] Shortcuts don't interfere with iframe content

**What to verify:**
- Keyboard shortcuts work as expected
- Shortcuts only work when focus is not on iframe
- No conflicts with iframe content keyboard handlers

---

### Test 6: Close Button 3-Tier Fallback

**Test 6a: Return parameter (Tier 1)**
```
/viewer/?src=%2Flanguage-arts%2Ftoolkit%2Fpresentations%2Fpresentation-01%2F&return=%2Flanguage-arts%2F
```
- [ ] Click "Close" → navigates to `/language-arts/`
- [ ] Check console: `[viewer] Navigating to return URL: /language-arts/`

**Test 6b: History back (Tier 2)**
1. Navigate to `/language-arts/` manually
2. Click a link that opens viewer WITHOUT return parameter: `/viewer/?src=%2Flanguage-arts%2Ftoolkit%2Fpresentations%2Fpresentation-01%2F`
3. Click "Close" → should go back to `/language-arts/` via history.back()
- [ ] Returns to previous page
- [ ] Check console: `[viewer] Using history.back to same-origin referrer`

**Test 6c: Inferred fallback (Tier 3)**
- Directly navigate to: `/viewer/?src=%2Flife-skills%2Fpresentations%2Fpresentation-01%2F` (no return param, no referrer)
- [ ] Click "Close" → navigates to `/life-skills/`
- [ ] Check console: `[viewer] Using inferred fallback: /life-skills/`

Test other prefixes:
- `/language-arts/toolkit/...` → should fallback to `/language-arts/toolkit/`
- `/math-toolkit/...` → should fallback to `/math-toolkit/`
- `/language-arts/...` → should fallback to `/language-arts/`
- Anything else → should fallback to `/`

---

### Test 7: Legacy URL Compatibility

**URL to test:**
```
/?viewer=1&section=language-arts&unit=a-door-into-time&presentation=presentation-16
```

**Expected behavior:**
- [ ] Page immediately redirects (using `location.replace`)
- [ ] New URL is: `/viewer/?src=%2Flanguage-arts%2Fa-door-into-time%2Fpresentation-16%2F&return=%2F`
- [ ] Presentation loads in viewer
- [ ] Check console: `[viewer-compat] Legacy viewer URL detected, converting to canonical format`
- [ ] Check console: `[viewer-compat] Redirecting to: /viewer/?src=...`
- [ ] Click "Close" → returns to home `/`

**Additional legacy URL tests:**

Life Skills:
```
/?viewer=1&section=life-skills&presentation=presentation-01
```
- [ ] Redirects to `/viewer/?src=%2Flife-skills%2Fpresentation-01%2F&return=%2F`

Math Toolkit:
```
/?viewer=1&section=math-toolkit&presentation=module-01
```
- [ ] Redirects to `/viewer/?src=%2Fmath-toolkit%2Fmodule-01%2F&return=%2F`

---

### Test 8: Same-Origin Security

**Steps:**
1. Try to load a cross-origin URL (this test requires browser console):
   - Open `/viewer/?src=https%3A%2F%2Fevil.com%2Fmalicious.html`

**Expected behavior:**
- [ ] Viewer shows error: "Invalid content source"
- [ ] Check console: `[viewer] Cross-origin URL not allowed: https://evil.com`
- [ ] Iframe does NOT load the external URL

**Additional security tests:**
- [ ] `javascript:` URL blocked: `/viewer/?src=javascript%3Aalert('xss')`
  - Should show "Invalid content source" error
  - Console: `[viewer] Dangerous protocol detected: javascript:alert('xss')`
- [ ] `data:` URL blocked: `/viewer/?src=data%3Atext%2Fhtml%2C<script>alert('xss')</script>`
  - Should show "Invalid content source" error
  - Console: `[viewer] Dangerous protocol detected: data:...`

---

### Test 9: Viewer Route on Netlify

**URLs to test:**
- `/viewer` (no trailing slash)
- `/viewer/` (with trailing slash)
- `/viewer/index.html`

**Expected behavior:**
- [ ] All three URLs load the viewer page
- [ ] No 404 errors
- [ ] Redirects are handled correctly by Netlify (200 rewrite, not 301/302 redirect)

**What to verify:**
- Netlify `_redirects` rules are working
- Viewer is accessible via multiple URL variations
- Check Network tab: should see 200 status, not redirects

---

## Success Criteria

✅ All tests pass
✅ No console errors (except expected security blocks)
✅ Viewer functionality restored to working state
✅ New features (return param, directory handling) work correctly
✅ Legacy URLs redirect properly
✅ Security measures prevent XSS and cross-origin loading

## Notes

- These tests are designed to be performed manually on Netlify Preview
- Console logs are important for debugging - check browser DevTools Console
- Some tests require clicking links or buttons - ensure JavaScript is enabled
- Security tests should show specific error messages, not generic failures

## Related Files

- `site/assets/js/viewer.js` - Main viewer implementation
- `site/assets/js/viewer-compat.js` - Legacy URL compatibility layer
- `site/viewer/index.html` - Viewer page HTML
- `site/_redirects` - Netlify redirect rules

## Automated Testing

While these are manual tests, consider adding automated tests for critical paths:
- Playwright tests for viewer loading and controls
- Unit tests for URL sanitization
- Integration tests for viewer-compat redirect logic
