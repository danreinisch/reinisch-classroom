# Supabase Realtime Configuration

## Overview

This document describes how Supabase Realtime websocket subscriptions are managed in the Reinisch Classroom application.

## Current Status: Disabled by Default

**Realtime subscriptions are currently DISABLED** to eliminate websocket connection errors and CSP-related console noise. The application functions normally without realtime, using manual/periodic refresh mechanisms instead.

### Why Disabled?

1. **CSP Compliance**: The Content Security Policy (CSP) `connect-src` directive does not allow `wss://*.supabase.co`, causing repeated connection errors
2. **Stability**: Reduces operational complexity and eliminates error logs related to websocket timeouts
3. **Functionality Preserved**: All core features work correctly with manual refresh - no realtime is required for normal operation

## What's Affected

When realtime is disabled:

1. **Connection Monitoring** (`site/web/supabase-client.js`)
   - ✅ Online/offline event listeners still work
   - ✅ Visibility change detection still works
   - ❌ No `system-heartbeat` realtime channel is created
   - ✅ Regular HTTP-based reconnection attempts work normally

2. **Progress Grid** (`web/progress-grid-v2.js`)
   - ✅ Data loads and displays correctly
   - ✅ Manual refresh button works
   - ✅ All filtering, sorting, and editing features work
   - ❌ No automatic refresh when other users add data
   - Users must click the refresh button to see updates

## Configuration

Realtime is controlled by a single flag in `site/web/runtime-config.js`:

```javascript
export const RuntimeConfig = {
  DISABLE_REALTIME: true  // Set to false to enable realtime
};
```

## How to Re-Enable Realtime

If you want to enable realtime subscriptions in the future, follow these steps:

### Step 1: Update CSP Headers

Add `wss://*.supabase.co` to your CSP `connect-src` directive.

In `_headers` or Netlify configuration:

```
/*
  Content-Security-Policy: connect-src 'self' https://*.supabase.co wss://*.supabase.co
```

### Step 2: Update Runtime Configuration

Edit `site/web/runtime-config.js`:

```javascript
export const RuntimeConfig = {
  DISABLE_REALTIME: false  // Enable realtime
};
```

### Step 3: Deploy and Test

1. Deploy the changes to your hosting environment
2. Clear browser cache or open in incognito mode
3. Open browser console and navigate to `/hub/`
4. Look for these log messages:
   - `[supabase-client] Setting up connection monitoring`
   - `[supabase-client] Realtime channel connected`
   - `[progress-realtime] Setting up realtime subscription`
   - `[progress-realtime] Subscription status: SUBSCRIBED`
5. Verify no `CHANNEL_ERROR` or `TIMED_OUT` errors appear

### Step 4: Verify Functionality

Test that realtime updates work:

1. Open the progress grid in two browser windows
2. Add or edit progress data in one window
3. Verify the other window automatically refreshes within a few seconds

## Technical Details

### Files Modified

1. **`site/web/runtime-config.js`** (new)
   - Centralized configuration for runtime toggles
   - Single source of truth for `DISABLE_REALTIME` flag

2. **`site/web/supabase-client.js`**
   - Imports `isRealtimeDisabled()` from runtime-config
   - Skips `system-heartbeat` channel creation when disabled
   - Logs message: "Realtime disabled - skipping channel subscription"

3. **`web/progress-grid-v2.js`**
   - Imports `isRealtimeDisabled()` from runtime-config
   - Skips `setupRealtime()` when disabled
   - Logs message: "Realtime disabled - skipping setup"

### Code Locations

**Connection monitoring check:**
```javascript
// site/web/supabase-client.js, line ~239
if (!isRealtimeDisabled() && client.channel && typeof client.channel === 'function') {
  // ... create system-heartbeat channel
}
```

**Progress grid check:**
```javascript
// web/progress-grid-v2.js, line ~2243
async setupRealtime() {
  if (isRealtimeDisabled()) {
    console.log('[progress-realtime] Realtime disabled - skipping setup');
    return;
  }
  // ... setup subscription
}
```

## Troubleshooting

### Console Still Shows Realtime Errors

If you see errors after disabling realtime:
1. Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check that `runtime-config.js` is properly deployed
4. Verify no cached service workers are active

### Realtime Not Working After Re-Enabling

If realtime doesn't work after setting `DISABLE_REALTIME: false`:
1. Verify CSP headers include `wss://*.supabase.co`
2. Check browser console for websocket connection errors
3. Verify Supabase project allows realtime connections
4. Check network tab for websocket upgrade requests
5. Ensure Supabase credentials are correct

### Data Not Auto-Refreshing

Remember that with realtime disabled:
- You must manually click the refresh button
- This is expected behavior, not a bug
- Other features like editing and exporting still work normally

## Future Considerations

### Performance Impact

Realtime subscriptions have minimal performance impact when working correctly, but may cause issues if:
- Network is unreliable (frequent reconnection attempts)
- Multiple users have many subscriptions active
- CSP policies conflict with websocket connections

### Alternative Approaches

If realtime continues to cause issues:
1. **Polling**: Implement periodic auto-refresh (e.g., every 30 seconds)
2. **Server-Sent Events**: Use SSE instead of websockets if CSP allows
3. **Manual Only**: Keep current approach with manual refresh only

## Summary

- ✅ Realtime is disabled by default for stability
- ✅ All features work without realtime
- ✅ Can be re-enabled with single flag change + CSP update
- ✅ Clean, reversible implementation
- ✅ No breaking changes to existing functionality
