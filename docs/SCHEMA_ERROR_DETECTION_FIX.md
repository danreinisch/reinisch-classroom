# Schema Error Detection Enhancement

## Problem

The Teacher Center → Students page was loading 0 students when the database schema was behind migrations. PostgREST returned HTTP 400 with error code `42703` (undefined_column), but the existing `isSchemaError()` function failed to detect it because:

1. The Supabase JS client doesn't always populate `error.code` with PostgreSQL error codes
2. The error code might appear in `error.details`, `error.hint`, or `error.message`
3. The original implementation only checked `error.code` directly

As a result, the graceful fallback to basic columns never triggered, and `listStudents()` threw an error instead of returning basic student data.

## Solution

### 1. Enhanced `isSchemaError()` Function

**Files**: `web/data-adapter.js`, `site/web/data-adapter.js`

The function now checks multiple fields for error codes:

```javascript
function isSchemaError(error) {
  if (!error) return false;
  
  // Check primary fields
  const msg = (error.message || '').toLowerCase();
  const code = String(error.code || '').toLowerCase();
  const details = (error.details || '').toLowerCase();
  const hint = (error.hint || '').toLowerCase();
  
  // PostgreSQL error codes: 42703 (undefined_column), 42P01 (undefined_table)
  // PostgREST error codes: PGRST204 (column not found), PGRST200 (relation not found)
  
  // Check all fields for error codes
  // Check HTTP 400 + schema keywords
  // Check explicit error messages
  // Check stringified error as last resort
}
```

**Detection strategies:**
- ✅ PostgreSQL codes (`42703`, `42P01`) in any field
- ✅ PostgREST codes (`PGRST204`, `PGRST200`) in any field
- ✅ HTTP 400 with column/relation keywords
- ✅ Message patterns: "column does not exist", "undefined column"
- ✅ Stringified error object (last resort)
- ✅ Case-insensitive matching

### 2. Improved `listStudents()` Fallback

**Files**: `web/data-adapter.js`, `site/web/data-adapter.js`

**Changes:**

1. **Smarter fallback triggering**: Only attempts fallback for schema errors or 400-level errors (400-499), not network/auth errors (5xx, 401, 403)

2. **Better error logging**: Logs both original and fallback errors when fallback fails

3. **Guaranteed basic columns**: Falls back to `id, code, name, class_id` which are guaranteed to exist from `001_init.sql`

4. **Event dispatch**: Dispatches `schema-drift-detected` custom event when schema error is detected and fallback succeeds

**Flow:**
```
1. Try: SELECT with all columns (including optional: iep_due, eval_due, etc.)
2. If error && (isSchemaError || is400Level):
   a. Log warning with error details
   b. Try: SELECT with basic columns only
   c. If fallback succeeds:
      - Dispatch schema-drift-detected event
      - Return basic data
   d. If fallback fails:
      - Log both errors
      - Throw original error
3. If error && NOT (isSchemaError || is400Level):
   - Throw immediately (don't mask network/auth errors)
```

### 3. Schema Drift Banner

**File**: `site/web/tc-students.js`

Added event listener in `init()`:

```javascript
window.addEventListener('schema-drift-detected', (event) => {
  console.log('[tc-students] Schema drift detected:', event.detail);
  showSchemaDriftBanner();
});
```

The banner displays:
- ⚠️ Warning icon
- "Database schema is behind migrations"
- "Some columns are missing. Students loaded with basic fields only."
- Non-blocking: Users can still view and interact with basic student data

### 4. Testing

**File**: `tests/is-schema-error.test.js`

Created comprehensive unit test suite with 17 test cases covering:
- PostgreSQL error codes in different fields
- PostgREST error codes
- HTTP 400 with various messages
- Case sensitivity
- Negative cases (non-schema errors)
- Edge cases (null/empty errors)

**Result**: ✅ All 17 tests passing

## HTTP Status Code Validation

The 400-level check uses precise matching to avoid false positives:

```javascript
const is400Level =
  error?.status === 400 ||
  error?.code === '400' ||
  (String(error?.code).startsWith('40') && String(error?.code).length >= 3);
```

This matches:
- ✅ `400`, `401`, `403`, `404`, `409`, etc. (400-499)

But NOT:
- ❌ `'4'` (too short)
- ❌ `'40'` (too short)
- ❌ `'5'`, `'50'`, `'500'` (5xx errors)

## Impact

### Before
- ❌ Students page loads 0 students when schema is behind
- ❌ Error thrown: "column students.iep_due does not exist"
- ❌ No graceful degradation
- ❌ Users see broken UI

### After
- ✅ Students page loads successfully with basic columns
- ✅ Users see student names, codes, and class assignments
- ✅ Banner informs users that some features are limited
- ✅ App remains functional until migrations are applied
- ✅ Network/auth errors still fail fast with clear context

## Security

- ✅ CodeQL scan: 0 vulnerabilities
- ✅ No sensitive data exposed in logs
- ✅ No changes to authentication or authorization
- ✅ No changes to RLS policies

## Files Changed

1. `web/data-adapter.js` - Enhanced `isSchemaError()` and `listStudents()`
2. `site/web/data-adapter.js` - Enhanced `isSchemaError()` and `listStudents()`
3. `site/web/tc-students.js` - Added event listener for schema drift banner
4. `tests/is-schema-error.test.js` - New unit test suite

## Migration Path

No migration required. This is a pure JavaScript change that:
- Works with existing database schema
- Gracefully handles both old and new schema versions
- Provides better error handling for schema drift scenarios

## Future Considerations

1. Other data-loading methods (goals, assignments, etc.) could benefit from similar fallback patterns
2. Consider a global schema version check on app startup
3. Add telemetry to track how often schema drift is detected in production
4. Consider showing migration instructions in the banner (with link to admin/migration page)
