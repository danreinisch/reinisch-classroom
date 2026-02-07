# Phase 2 Foundation - Student Manager Implementation

## Summary
This PR implements the Phase 2 foundation for the Student Manager feature, fixing the "isRemote is not defined" ReferenceError and adding robust environment diagnostics, RPC wrappers, and a basic UI.

## Changes Made

### 1. Fixed ReferenceError ✅
- **Issue**: Student Manager tab was hitting `ReferenceError: isRemote is not defined`
- **Solution**: Import `isRemote` from `data-adapter.js` and use it as `detectRemoteMode()`
- **Location**: `web/student-manager-rpc.js` line 11

### 2. Environment Diagnostics Panel ✅
- **File**: `web/student-manager-rpc.js`
- **Function**: `checkEnvironment()`
- **Features**:
  - Layered checks for students table, goals table, enrollments, RPC availability
  - Returns OK/fail status per check (not just generic error)
  - Displays mode (local vs remote)
  - Shows counts for students, goals, enrollments

### 3. RPC Wrapper Layer ✅
- **File**: `web/student-manager-rpc.js`
- **Exports**: `studentRpc` object with:
  - `checkEnvironment()` - Environment diagnostics
  - `listStudents(filter)` - Returns `{code, active, goal_count, enrollment_count}`
  - `createStudent(payload)` - Scaffold only (full implementation in Phase 2 PR B)

### 4. Student Manager UI ✅
- **File**: `web/student-manager-ui.js`
- **Class**: `StudentManagerUI`
- **Features**:
  - Basic metrics display (total students, active students, total goals)
  - Filter controls (Active/Inactive/All)
  - Search by student code
  - Student list with counts and placeholder action buttons
  - Defensive dedupe, loading states, unified error handling
  - XSS protection with `escapeHtml()` helper

### 5. Hub Integration ✅
- **File**: `site/hub/index.html`
- **Changes**:
  - Import Student Manager UI module at top level (line ~2134-2148)
  - Updated `initStudentManager()` to use new UI module
  - Removed direct `isRemote` usage
  - Added defensive guards for module loading failures
  - All logs prefixed with `[student-manager]`

### 6. Tests ✅
- **Files**: 
  - `package.json` - Playwright dependency
  - `playwright.config.js` - Test configuration
  - `tests/student-manager.spec.js` - Smoke tests
- **Coverage**:
  - Hub page loads successfully
  - Student Manager tab is accessible with feature flag
  - Metrics render correctly
  - No "isRemote is not defined" errors

### 7. Security ✅
- **Fixed**: XSS vulnerability in search input (CVE check passed)
- **Tool**: CodeQL checker
- **Result**: 0 alerts

## Out of Scope (Moved to PR B)
- Full CRUD (create/update/remove) UI flows
- Goal versioning
- Multi-goal wizard
- CSV import integration for Student Manager
- Comprehensive Playwright coverage of all operations

## Testing Instructions

### Manual Testing
1. Navigate to `/site/hub/`
2. Enable Student Manager feature flag in Settings
3. Go to Data > Student Manager
4. Verify:
   - Metrics display (Total Students, Active Students, Total Goals)
   - Environment diagnostics show OK/fail per check
   - Student list renders with filters and search
   - No console errors (especially no "isRemote is not defined")

### Automated Testing
```bash
npm install
npx playwright test
```

## Verification Checklist
- [x] No ReferenceError on Student Manager init
- [x] Diagnostics show structured checks with OK/fail states
- [x] Student list renders with totals
- [x] Filter and search work
- [x] Playwright smoke tests pass
- [x] No regressions in other hub views (Classes, Upload, Settings)
- [x] Security scan passes (0 alerts)
- [x] All logs use `[student-manager]` prefix

## Files Changed
- `.gitignore` - Added Playwright artifacts
- `package.json` - NEW - Test dependencies
- `playwright.config.js` - NEW - Test configuration
- `site/hub/index.html` - Updated Student Manager initialization
- `tests/student-manager.spec.js` - NEW - Smoke tests
- `web/student-manager-rpc.js` - NEW - RPC wrapper layer
- `web/student-manager-ui.js` - NEW - UI component class

## Migration Notes
This PR is fully backward compatible and requires no database migrations. The Student Manager feature is behind a feature flag and won't be visible unless explicitly enabled.

For remote mode (Supabase), the Student Manager will show a "Migration Required" message if the RPC functions haven't been deployed. This is expected and will be addressed in the Phase 2 follow-up.
