# Viewer Fixes Implementation Summary

## Overview
This PR successfully addresses two critical issues with the `/viewer/` functionality:

1. **CSP Fix**: Presentations loaded in the viewer can now navigate properly without inline script violations
2. **Collapsible Sidebar**: Added a hamburger toggle to collapse/expand the left sidebar with localStorage persistence

## Changes Made

### 1. Content Security Policy Fix (netlify.toml)

**Problem**: Presentations with inline scripts (e.g., `Unit1_Workplace_Communication_Full_Presentation.html`) were blocked by the global CSP policy that doesn't allow `'unsafe-inline'` scripts.

**Solution**: Added a route-specific CSP header for `/viewer/*`:

```toml
[[headers]]
  for = "/viewer/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.supabase.io https://*.netlify.app; media-src 'self' blob: data: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; frame-src 'self'; report-uri /.netlify/functions/csp-report"
```

**Security**: This CSP is scoped **only** to `/viewer/*` and does not weaken site-wide security. The global strict CSP remains in place for all other pages.

### 2. Collapsible Sidebar Implementation

#### HTML Changes (site/viewer/index.html)
- Added hamburger toggle button (`☰`) to viewer controls:
  ```html
  <button class="viewer-btn" id="sidebarToggleBtn" aria-label="Toggle sidebar" title="Toggle sidebar">☰</button>
  ```

#### JavaScript Changes (site/assets/js/viewer.js)
- Added sidebar state management with localStorage persistence:
  - `toggleSidebar()`: Toggles the collapsed/expanded state
  - `applySidebarState()`: Applies CSS classes based on state
  - `saveSidebarState()`: Persists state to localStorage using `JSON.stringify()`
  - `restoreSidebarState()`: Restores state on page load, defaults to expanded

**Key Features**:
- Default state: **Expanded** (as required)
- State persists across page reloads via localStorage
- Smooth CSS transitions for collapse/expand animations
- Proper boolean storage using JSON.parse/JSON.stringify (per code review)

#### CSS Changes (site/assets/css/viewer.css)
- Added viewer-specific sidebar collapse styles:
  ```css
  body.viewer-sidebar-collapsed .app-shell-rail.viewer-collapsed {
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    pointer-events: none;
  }
  
  body.viewer-sidebar-collapsed.has-app-shell {
    padding-left: 0;
  }
  ```
- Smooth transitions for state changes
- Proper pointer-events handling to prevent interaction when hidden
- High specificity selectors (no !important needed, per code review)

## Testing Results

### Automated Testing
✅ **Playwright Test**: Created automated test covering:
- Sidebar toggle functionality
- localStorage persistence across page reloads
- CSP error detection (none found!)
- Visual verification with screenshots

### Manual Verification
✅ **Screenshots captured**:
1. `viewer-sidebar-expanded.png`: Default state with sidebar visible
2. `viewer-sidebar-collapsed.png`: Sidebar collapsed via hamburger toggle
3. `viewer-sidebar-collapsed-after-reload.png`: State persisted after reload
4. `viewer-sidebar-expanded-after-toggle.png`: Toggled back to expanded

✅ **CSP Testing**: No Content Security Policy violations detected when loading Life Skills presentation

### Code Quality
✅ **ESLint**: No linting errors in new code
✅ **CodeQL Security Scan**: No vulnerabilities found
✅ **Code Review**: All feedback addressed:
- Used JSON.stringify/parse for boolean storage
- Removed !important flag, improved CSS specificity

## Files Modified

1. `netlify.toml` - Added `/viewer/*` CSP header
2. `site/viewer/index.html` - Added sidebar toggle button
3. `site/assets/js/viewer.js` - Implemented toggle logic and localStorage persistence
4. `site/assets/css/viewer.css` - Added collapse/expand styling
5. `.gitignore` - Added test file to ignore list

## Deployment Notes

- Changes are backward compatible
- No database migrations required
- CSP change only affects `/viewer/*` route
- localStorage gracefully handles missing/invalid data
- Default state (expanded) ensures good UX for first-time visitors

## Security Considerations

1. **CSP Scope**: The relaxed CSP with `'unsafe-inline'` is **strictly scoped** to `/viewer/*` only
2. **Global Security Maintained**: Site-wide CSP remains strict with no inline scripts
3. **Input Validation**: URL sanitization in viewer.js prevents XSS
4. **localStorage**: Properly handles JSON parse errors with fallback to default state
5. **CodeQL**: No security vulnerabilities detected

## Performance Impact

- Minimal: Only adds ~50 lines of JavaScript
- CSS transitions use GPU-accelerated transforms
- localStorage access is fast and cached by browser
- No impact on page load times

## Browser Compatibility

- Modern browsers: Full support (Chrome, Firefox, Safari, Edge)
- localStorage: Gracefully degrades if unavailable
- CSS transforms: Widely supported
- JSON.parse/stringify: Universal support

## Future Enhancements (Optional)

- Add keyboard shortcut (e.g., `Ctrl+B`) to toggle sidebar
- Add animation preferences (respect `prefers-reduced-motion`)
- Make sidebar width configurable
- Add hover preview when collapsed

## Conclusion

Both requirements have been successfully implemented:
✅ Presentations in viewer can now navigate without CSP errors
✅ Sidebar is collapsible with hamburger toggle, localStorage persistence, and default expanded state

All tests pass, code review complete, security scan clean.
