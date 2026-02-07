# Student Portal Architecture: Netlify Functions Only

## Overview

The student portal has been updated to use **Netlify Functions exclusively** for all data access. Students no longer make direct Supabase REST API calls from the browser, eliminating RLS violations and improving security.

## Architecture

### Before (PR A)
```
Browser (Student) → Supabase REST API (direct)
                    ↓
                    RLS violations, 401 errors
```

### After (PR B)
```
Browser (Student) → Netlify Functions → Supabase (service role)
                    ↓
                    All data access server-side
```

## Implementation Details

### 1. Netlify Functions Endpoints

Five new serverless functions handle student data access:

#### `student-profile.js`
- **Endpoint**: `GET /.netlify/functions/student-profile?code=XXX`
- **Returns**: Student profile (code, name, class_id)
- **Use**: Minimal student information for portal header

#### `student-goals.js`
- **Endpoint**: `GET /.netlify/functions/student-goals?code=XXX`
- **Returns**: Array of IEP goals for the student
- **Use**: IEP Goals section

#### `student-assignments.js`
- **Endpoint**: `GET /.netlify/functions/student-assignments?code=XXX`
- **Returns**: Array of assignment instances with embedded assignment data
- **Use**: My Assignments dashboard

#### `student-submissions.js`
- **Endpoint**: `GET /.netlify/functions/student-submissions?code=XXX`
- **Returns**: Array of submissions for the student
- **Use**: Grades card and assignment progress tracking

#### `student-goal-progress.js`
- **Endpoint**: `GET /.netlify/functions/student-goal-progress?code=XXX`
- **Returns**: Array of goal progress entries
- **Use**: IEP goal progress visualization

### 2. Client-Side API Wrapper

**File**: `site/web/student-api.js`

Provides a clean interface for calling Netlify Functions:

```javascript
import { getStudentGoals, getStudentAssignments } from './student-api.js';

// Fetch student goals
const goals = await getStudentGoals(studentCode);

// Fetch assignments
const assignments = await getStudentAssignments(studentCode);
```

**Features**:
- Automatic error handling
- Auth failure detection (401/403 → redirect to /hub/)
- Consistent response parsing
- Drop-in adapter for existing db interface

### 3. Student Portal Changes

**File**: `site/web/student-portal.js`

When a student logs in, the portal switches from the standard `db` adapter to the `studentApiAdapter`:

```javascript
// On student login
userRole = "student";
activeDb = createStudentApiAdapter(currentUser.code);

// All subsequent data access uses activeDb
const goals = await activeDb.listGoalsByStudentCode(currentUser.code);
const assignments = await activeDb.listAssignmentInstances();
```

**Teacher access unchanged**: Teachers continue to use the standard `db` adapter with direct Supabase access (they have appropriate RLS policies).

## Security Features

### 1. No Browser Access to Supabase
- Students never receive Supabase keys
- No client-side initialization of Supabase client
- All queries executed server-side with service role

### 2. Server-Side Authentication
- Student credentials verified via `student-login` function
- All functions validate student code parameter
- Functions return 404 if student not found

### 3. Security Headers
- `Cache-Control: no-store` on all responses
- CORS configured for trusted origins only
- Standard security headers (CSP, XSS protection, etc.)

### 4. Auth Failure Handling
- 401/403 responses clear `rc_auth` token
- Automatic redirect to `/hub/` login
- No sensitive error messages exposed

## Testing

### Network Verification Test

**File**: `tests/student-portal-network.spec.js`

Playwright test that verifies:
1. No `/rest/v1/` calls from browser on load
2. No Supabase calls during student login
3. Netlify Functions are used for data access
4. No Supabase calls on re-login

**Run test**:
```bash
npm test -- tests/student-portal-network.spec.js
```

### Expected Behavior

When a student logs in and uses the portal:

✅ **Should see**: Calls to `/.netlify/functions/student-*`
❌ **Should NOT see**: Calls to `https://*.supabase.co/rest/v1/*`

## Data Flow Example

### Student Portal Load

1. **Student visits** `/student/` or `/student/?auto=1&code=XXX`
2. **Auto-login checks** `rc_auth` token in localStorage
3. **If valid**, calls `student-login` function to verify
4. **On success**, creates `studentApiAdapter` with student code
5. **Portal loads**:
   - Calls `student-assignments` → renders assignments
   - Calls `student-goals` → renders IEP goals
   - Calls `student-submissions` → renders grades
   - Calls `student-goal-progress` → renders goal progress

### Re-login Flow

1. **Student logs out** → clears `rc_auth` token
2. **Student logs in again** → calls `student-login` function
3. **Creates fresh adapter** with new student code
4. **Loads dashboard** using Netlify functions (same as above)

## Backwards Compatibility

### Teacher Center
- No changes to teacher workflows
- Teachers still use standard `db` adapter
- Teacher functions access Supabase directly (not affected)

### Local Development
- Functions work locally via Netlify Dev
- Fallback to localStorage in offline mode
- No breaking changes to existing code

## Migration Notes

### What Changed
1. Added 5 new Netlify functions for student data
2. Created `student-api.js` client wrapper
3. Modified `student-portal.js` to use `activeDb` switcher
4. Added network verification test

### What Didn't Change
- Teacher center (no modifications)
- Student authentication flow (still uses `student-login`)
- Data models and schemas
- UI/UX of student portal

## Performance Considerations

### Latency
- Netlify functions add ~50-150ms per request
- Functions are cached at edge (Netlify CDN)
- Responses use `Cache-Control: no-store` (no browser caching for data freshness)

### Optimization Opportunities
- Consider batch endpoints (e.g., all student data in one call)
- Add optional caching for static data (assignments, goals)
- Implement incremental loading for large datasets

## Deployment

### Environment Variables Required
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Deploy Steps
1. Commit changes to repository
2. Push to GitHub
3. Netlify auto-deploys functions and site
4. Test student login at `/hub/` or `/student/`

### Verification
```bash
# Check function is deployed
curl https://your-site.com/.netlify/functions/student-profile?code=TEST001

# Expected response
{"ok":true,"profile":{"code":"TEST001","name":"TEST001","class_id":null}}
```

## Troubleshooting

### Issue: Student portal shows blank page
- **Check**: Browser console for errors
- **Verify**: Netlify functions are deployed (`/.netlify/functions/student-profile`)
- **Test**: Call function directly with curl/Postman

### Issue: "Service unavailable" error
- **Check**: Environment variables are set in Netlify
- **Verify**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured
- **Review**: Netlify function logs for connection errors

### Issue: Network test fails
- **Check**: Student portal is using `activeDb` not `db`
- **Verify**: No imports of `getSupabase()` in student portal code
- **Review**: Network tab in browser DevTools

## Future Enhancements

1. **Batch Operations**: Combine multiple endpoints into single calls
2. **WebSocket Support**: Real-time updates via Netlify Functions (not Supabase Realtime)
3. **Caching Layer**: Add Redis or similar for frequently accessed data
4. **GraphQL**: Consider GraphQL wrapper over REST functions
5. **Analytics**: Track function usage and performance

## Related Documentation

- [STUDENT_AUTHENTICATION_SUMMARY.md](./STUDENT_AUTHENTICATION_SUMMARY.md) - Student auth implementation
- [AUTH_MIGRATION_AND_GUARDRAILS.md](./AUTH_MIGRATION_AND_GUARDRAILS.md) - Auth migration guide
- [Netlify Functions Docs](https://docs.netlify.com/functions/overview/) - Netlify Functions reference
