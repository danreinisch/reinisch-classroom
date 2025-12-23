# PR 310: Teacher Center Scroll-Lock Fix - Manual Test Checklist

## Issue Summary
The Teacher Center UI at `/hub/?entry=teacher` was not scrollable after login. Wheel/trackpad events did nothing, making the interface feel locked.

## Root Causes Fixed
1. **Body overflow hidden**: Removed `overflow: hidden` from body element that prevented page scrolling
2. **Missing flex min-height**: Added `min-height: 0` to flex containers to enable proper scroll container behavior
3. **Modal backdrop pointer capture**: Hidden modal backdrops were intercepting pointer/wheel events
4. **No scroll-lock cleanup**: Added defensive cleanup after modal close, login, and viewer close

## Changes Made
1. `/site/hub/index.html`:
   - Changed body `overflow: hidden` to `overflow: visible`
   - Added `min-height: 0` to `.hub-shell`, `#view-teacher`, `.hub-main`, `.hub-gate-panel`
   - Added `-webkit-overflow-scrolling: touch` for smooth touch scrolling
   - Added modal backdrop CSS with `pointer-events: none` when hidden
   - Added `.show` class with `pointer-events: auto` for visible modals

2. `/site/web/hub-ux-enhancement.js`:
   - Added `cleanupScrollLock()` function to remove scroll-lock classes/styles
   - Added `initScrollLockFailsafe()` to run cleanup after login and viewer close
   - Enhanced modal close handlers to call `cleanupScrollLock()`

3. `/site/assets/js/hub-gate.js`:
   - Added `cleanupScrollLock()` function
   - Call cleanup after `teacher:login-success` event

4. `/site/assets/js/app-shell.js`:
   - Added `cleanupScrollLock()` function
   - Enhanced `closePresentationViewer()` to dispatch `viewer:closed` event
   - Call cleanup when viewer closes

## Manual Test Checklist

### Test 1: Basic Scroll After Login
- [ ] Navigate to `/hub/?entry=teacher`
- [ ] Enter teacher credentials and log in
- [ ] Wait for Teacher Center to load
- [ ] **VERIFY**: Mouse wheel scrolls the page content
- [ ] **VERIFY**: Trackpad scroll gestures work
- [ ] **VERIFY**: Scrollbar appears and is functional
- [ ] **VERIFY**: Content extends beyond viewport and is accessible via scroll

### Test 2: Scroll After Opening/Closing Auth Modal
- [ ] Navigate to `/hub/` (without ?entry parameter)
- [ ] Click "Teacher Center" button to open auth modal
- [ ] **VERIFY**: Modal appears and is centered
- [ ] Close modal by clicking backdrop or pressing Escape
- [ ] **VERIFY**: Page is scrollable after modal close
- [ ] Reopen auth modal and enter credentials
- [ ] Log in successfully
- [ ] **VERIFY**: Page is scrollable after login

### Test 3: Scroll After Opening/Closing Viewer Overlay
- [ ] Log in to Teacher Center
- [ ] Click "Lessons" in app shell (left sidebar)
- [ ] Select any presentation to open viewer overlay
- [ ] **VERIFY**: Viewer opens in overlay mode
- [ ] Close viewer using "Close" button
- [ ] **VERIFY**: Page is scrollable after viewer closes
- [ ] **VERIFY**: No invisible overlay blocks wheel/pointer events

### Test 4: Multiple Modal Open/Close Cycles
- [ ] Navigate to `/hub/?entry=teacher` and log in
- [ ] Open and close teacher modal 3 times using Escape key
- [ ] **VERIFY**: Scroll works after each close
- [ ] Open and close modal 3 times by clicking backdrop
- [ ] **VERIFY**: Scroll works after each close
- [ ] **VERIFY**: No scroll-lock "sticks" after repeated cycles

### Test 5: Mobile/Touch Device Testing (if available)
- [ ] Navigate to `/hub/?entry=teacher` on mobile device
- [ ] Log in successfully
- [ ] **VERIFY**: Touch scroll gestures work
- [ ] **VERIFY**: Momentum scrolling works (iOS)
- [ ] Open and close modals
- [ ] **VERIFY**: Touch scroll still works after modal interactions

### Test 6: Browser Compatibility
Test in multiple browsers:
- [ ] Chrome/Chromium: Scroll works after login
- [ ] Firefox: Scroll works after login
- [ ] Safari: Scroll works after login
- [ ] Edge: Scroll works after login

### Test 7: No Regressions
- [ ] Other hub pages (student, substitute) still work
- [ ] App shell navigation still works
- [ ] Modal styling unchanged
- [ ] No console errors related to scroll-lock cleanup
- [ ] Lessons navigator panel still works

## Expected Behavior
✅ **Success Criteria**:
- Mouse wheel and trackpad scroll work immediately after login
- Scroll works after opening/closing auth modal
- Scroll works after opening/closing viewer overlay
- No invisible overlay/backdrop intercepts wheel/pointer events
- No scroll-lock "sticks" after modal interactions
- Smooth scrolling on touch devices

❌ **Failure Indicators**:
- Mouse wheel does nothing / page feels "locked"
- Scrollbar not visible or non-functional
- Content beyond viewport is inaccessible
- Scroll stops working after modal close
- Console errors about scroll-lock cleanup

## Rollback Instructions
If this PR causes issues:

1. Revert the following files:
   - `/site/hub/index.html` (body overflow and flex min-height changes)
   - `/site/web/hub-ux-enhancement.js` (scroll-lock cleanup)
   - `/site/assets/js/hub-gate.js` (scroll-lock cleanup)
   - `/site/assets/js/app-shell.js` (scroll-lock cleanup)

2. The changes are surgical and localized to scroll handling only
3. No database migrations or data changes required
4. Safe to revert without data loss

## Notes
- CSP compliance maintained: No inline scripts added
- All styles use external CSS or existing style blocks
- Defensive error handling in all cleanup functions
- Console logging for debugging scroll-lock cleanup
