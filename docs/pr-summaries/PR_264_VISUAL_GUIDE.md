# PR 264 Visual Guide: Goal Progress Error Handling

## Overview
This PR improves how the student portal handles goal progress service unavailability, making the experience smooth and informative for users.

## Before vs After

### BEFORE (Current Behavior)
```
❌ Problem: When progress service is unavailable
- Student portal shows red error messages
- Console logs scary stack traces
- Goals might fail to load entirely
- No clear guidance for teachers/admins
```

### AFTER (New Behavior)
```
✅ Solution: Graceful degradation with clear feedback
- Student portal loads successfully
- Goals display with "Avg: —" (unavailable indicator)
- Friendly banner explains the situation
- Debug mode provides diagnostic info for troubleshooting
```

## UI Changes

### 1. Normal Student View (No Progress Available)

```
┌─────────────────────────────────────────────────────────────┐
│ 🏫 Reinisch Classroom - Student Portal                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ℹ️  Progress Data Unavailable                              │
│  Progress data is temporarily unavailable. You can still    │
│  view your goals.                                    [×]     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 My Assignments                                           │
│  └─ [Assignments display normally]                           │
│                                                              │
│  🎯 IEP Goals (2)                                            │
│  ┌─────────────────────────────────────────────────┐        │
│  │ 🎯 Reading Comprehension                        │        │
│  │    [Open]  Avg: —                               │        │
│  │    Progress data unavailable                    │        │
│  └─────────────────────────────────────────────────┘        │
│  ┌─────────────────────────────────────────────────┐        │
│  │ 🎯 Math Skills                                  │        │
│  │    [Met]   Avg: —                               │        │
│  │    Progress data unavailable                    │        │
│  └─────────────────────────────────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Info banner at top (dismissible)
- Goals still visible and accessible
- Progress shows as "—" instead of error
- No progress bars (since data unavailable)
- Clean, professional appearance

### 2. Debug/Diagnostic Mode (For Teachers/Admins)

URL: `/student/?debug=1` or `/student/?diag=1`

```
┌─────────────────────────────────────────────────────────────┐
│ 🏫 Reinisch Classroom - Student Portal                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚠️  Progress Data Unavailable                              │
│  Supabase is not configured in Netlify. Check environment  │
│  variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and   │
│  visit /.netlify/functions/auth-health for details.  [×]   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  [Rest of portal displays normally]                         │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Warning banner (yellow/orange)
- Specific diagnostic information
- Links to auth-health endpoint
- Actionable steps for configuration
- Helps teachers/admins troubleshoot quickly

### 3. Normal Mode (Progress Available - No Banner)

```
┌─────────────────────────────────────────────────────────────┐
│ 🏫 Reinisch Classroom - Student Portal                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 My Assignments                                           │
│  └─ [Assignments display normally]                           │
│                                                              │
│  🎯 IEP Goals (2)                                            │
│  ┌─────────────────────────────────────────────────┐        │
│  │ 🎯 Reading Comprehension                        │        │
│  │    [Open]  Avg: 75%                             │        │
│  │    ████████████████████░░░░░░░░ 75%            │        │
│  └─────────────────────────────────────────────────┘        │
│  ┌─────────────────────────────────────────────────┐        │
│  │ 🎯 Math Skills                                  │        │
│  │    [Met]   Avg: 92%                             │        │
│  │    ███████████████████████████░ 92%            │        │
│  └─────────────────────────────────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- No banner (everything working)
- Progress percentages display
- Progress bars show visually
- Full functionality

## Console Behavior

### BEFORE (Noisy)
```
❌ Error: Failed to fetch goal progress
    at getStudentGoalProgress (student-api.js:125)
    at loadStudentGoals (student-portal.js:1101)
    [Full stack trace...]

❌ Error: Service unavailable
    at apiFetch (student-api.js:42)
    [Full stack trace...]
```

### AFTER (Clean)

**Normal Mode:**
```
ℹ️  [student-dashboard] Progress data unavailable, continuing without progress metrics
```

**Debug Mode:**
```
⚠️  [student-dashboard] Progress service unavailable (reason: supabase_not_configured)
ℹ️  [student-portal] Checking auth-health for diagnostics...
ℹ️  [auth-health] Supabase not configured: {
     url: false,
     key: false
   }
```

## API Response Changes

### Old Response (HTTP 503)
```json
{
  "ok": false,
  "error": "Service unavailable"
}
```
**Result:** Client throws error, console spam, potential retry loops

### New Response (HTTP 200)
```json
{
  "ok": true,
  "progress": [],
  "unavailable": true,
  "reason": "supabase_not_configured"
}
```
**Result:** Client handles gracefully, shows banner, no errors

## Implementation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Student logs in                                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Portal loads dashboard                                   │
│    - Fetches goals ✅                                        │
│    - Fetches progress (fails) ⚠️                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. API returns { unavailable: true, reason: '...' }        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Portal checks if debug mode enabled                     │
│    - ?debug=1 or ?diag=1 in URL?                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ├─── Yes (Debug Mode) ───┐
                   │                         │
                   │                         ▼
                   │              ┌──────────────────────────┐
                   │              │ 5a. Call auth-health     │
                   │              │ 5b. Show diagnostic msg  │
                   │              └──────────────────────────┘
                   │
                   └─── No (Normal Mode) ───┐
                                             │
                                             ▼
                                  ┌──────────────────────────┐
                                  │ 5c. Show friendly banner │
                                  └──────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Goals display with "Avg: —" (no progress bars)          │
│    Dashboard remains fully functional                       │
└─────────────────────────────────────────────────────────────┘
```

## Testing Scenarios

### Scenario 1: Fresh Deployment Without Supabase
```
1. Deploy to Netlify without SUPABASE_URL/KEY
2. Login as student
3. Observe:
   ✅ Dashboard loads successfully
   ✅ Banner shows "Progress data unavailable"
   ✅ Goals display with "Avg: —"
   ✅ No console errors
```

### Scenario 2: Temporary Supabase Outage
```
1. Supabase goes down temporarily
2. Student refreshes page
3. Observe:
   ✅ Dashboard loads successfully
   ✅ Banner shows friendly message
   ✅ Student can still view goals
   ✅ Can dismiss banner
```

### Scenario 3: Admin Troubleshooting
```
1. Admin visits /student/?debug=1
2. Login as student
3. Observe:
   ✅ Diagnostic banner appears
   ✅ Message includes specific config guidance
   ✅ Console shows verbose logging
   ✅ Can visit /auth-health for details
```

## Security Considerations

✅ **Safe:**
- `auth-health` only returns boolean flags and lengths
- No secret values exposed in responses
- Debug mode requires explicit URL parameter
- Banner messages don't leak sensitive data

❌ **Not exposed:**
- Actual Supabase URL values
- API keys or tokens
- Database credentials
- Internal system architecture details

## Browser Compatibility

Tested and working in:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Performance Impact

- **Network:** +1 request to `/auth-health` (only when progress unavailable + debug mode)
- **Rendering:** Negligible (banner is simple HTML)
- **Memory:** Minimal (single banner element)
- **UX:** Significantly improved (no blocking errors)

## Rollout Strategy

1. **Phase 1**: Deploy server-side changes (200 with unavailable flag)
2. **Phase 2**: Deploy client-side changes (banner + diagnostics)
3. **Verification**: Monitor logs for 503 → 200 transition
4. **Rollback**: Simply revert server change if needed (backwards compatible)

## Future Enhancements

Potential improvements for future PRs:
- [ ] Retry button in banner to manually refresh progress
- [ ] Show last successful progress fetch timestamp
- [ ] Cache progress data locally for offline fallback
- [ ] Add service status indicator in top bar
- [ ] Email notifications for prolonged outages
