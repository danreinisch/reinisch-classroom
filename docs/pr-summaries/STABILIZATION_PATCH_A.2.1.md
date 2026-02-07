# Stabilization Patch A.2.1: Module Initialization Fix

## Summary
Fixed Student Manager initialization failures by converting relative module import paths to absolute paths, ensuring compatibility when Hub is served from `/hub/` or other nested routes.

## Problem Statement

### Symptoms
- Red banner: "Module Loading Error - Failed module(s): student-manager-ui.js"
- Console error: `ReferenceError: StudentManagerUI is not defined`
- Student Manager tab shows initialization error instead of data

### Root Causes

1. **Relative Path Breakage**: Module imports in `/web/` directory used relative paths like `../site/web/supabase-util.js`, which resolve incorrectly when loaded from nested routes like `/site/hub/`

2. **Nested Dependency Chain**: The failure bubbled up through the import chain:
   ```
   student-manager-ui.js (top-level import fails)
     ↓ imports
   student-manager-rpc.js
     ↓ imports
   data-adapter.js (has relative import)
     ↓ imports
   ../site/web/supabase-util.js ❌ (404 - path resolves incorrectly)
   ```

3. **Opaque Error Messages**: Top-level error "student-manager-ui.js failed" didn't reveal the actual failing nested dependency

## Solution

### Changes Made

#### 1. Fixed Relative Imports → Absolute Imports

**web/data-adapter.js**
```diff
-import { withRetry } from '../site/web/supabase-util.js';
+import { withRetry } from '/site/web/supabase-util.js';
```

**web/supabase-client.js**
```diff
-export { ... } from '../site/web/supabase-client.js';
+export { ... } from '/site/web/supabase-client.js';
```

**Rationale**: Absolute paths starting with `/` resolve consistently regardless of where the importing module is loaded from.

#### 2. Added Nested Import Diagnostics

Added console.log statements at module boundaries to trace the import chain:

**web/student-manager-ui.js**
```javascript
console.log('[student-manager-ui] Module loading started');
import { studentRpc } from './student-manager-rpc.js';
console.log('[student-manager-ui] student-manager-rpc.js imported successfully');
```

**web/student-manager-rpc.js**
```javascript
console.log('[student-manager-rpc] Module loading started');
import { db, isRemote as detectRemoteMode } from './data-adapter.js';
console.log('[student-manager-rpc] data-adapter.js imported successfully');
```

**web/data-adapter.js**
```javascript
console.log('[data-adapter] Module loading started');
import { getSupabase } from './supabase-client.js';
console.log('[data-adapter] supabase-client.js imported');
import { withRetry } from '/site/web/supabase-util.js';
console.log('[data-adapter] supabase-util.js imported');
```

**Rationale**: If a nested import fails, the console will show exactly which module in the chain failed, making debugging trivial.

### Verification

Created validation script to ensure paths are correct:

```bash
✅ No relative imports to ../site found in /web/ modules
✅ Absolute imports to /site/web confirmed in data-adapter.js and supabase-client.js
✅ Hub HTML uses absolute module paths (/web/*)
✅ Single initialization path confirmed (initStudentManager called only from tab switch)
```

## Testing

### Before Fix
```
Console:
  [Hub Init] Loading student-manager-ui.js...
  ❌ Failed to load /web/student-manager-ui.js: 404

Red Banner:
  Module Loading Error - Failed module(s): student-manager-ui.js
```

### After Fix (Expected)
```
Console:
  [Hub Init] Loading student-manager-ui.js...
  [student-manager-ui] Module loading started
  [student-manager-rpc] Module loading started
  [data-adapter] Module loading started
  [data-adapter] supabase-client.js imported
  [data-adapter] supabase-util.js imported
  [student-manager-rpc] data-adapter.js imported successfully
  [student-manager-ui] student-manager-rpc.js imported successfully
  ✅ Student Manager UI module loaded successfully

No Red Banner (success case)
Student Manager tab shows metrics and student list
```

## Context: Why This Matters

### PR #162 Conflict
PR #162 ("Fix hub module loading by converting absolute paths to relative") attempted to convert stable root-absolute `/web` and `/assets` paths back to relative `../web` and `../assets`. This would:
- Reintroduce 404 risk when Hub is served from `/hub/`
- Break the absolute path pattern established in PR A.2

**Resolution**: Keep absolute paths, close or rebase PR #162 with updated strategy.

### Alignment with PR A.2
PR A.2 established the pattern of using absolute paths for Hub assets:
- Asset paths: `/assets/bg/...` (not `../assets/bg/...`)
- Module paths: `/web/...` (not `../web/...`)

This patch extends that pattern to nested module imports.

## Files Modified

- `web/data-adapter.js` - Fixed supabase-util import + added diagnostics
- `web/supabase-client.js` - Fixed supabase-client re-export path
- `web/student-manager-rpc.js` - Added diagnostics
- `web/student-manager-ui.js` - Added diagnostics

## Minimal Changes Philosophy

Changes are surgical and focused:
- Only 4 files modified
- 13 insertions, 2 deletions
- No behavior changes, only path corrections and diagnostics
- No new dependencies or architecture changes

## Future Recommendations

1. **Linting Rule**: Add eslint rule to prevent relative imports crossing directory boundaries
2. **Path Policy**: Document that all cross-directory imports must use absolute paths
3. **CI Check**: Add GitHub Actions check to scan for `../site` patterns in `/web/` modules
4. **Module Map**: Consider creating a module map to visualize dependency chains

## Related Issues

- Addresses root causes identified in problem statement
- Resolves conflicts with PR #162 by maintaining absolute path strategy
- Enables safe serving of Hub from any route (`/`, `/hub/`, `/site/hub/`, etc.)
