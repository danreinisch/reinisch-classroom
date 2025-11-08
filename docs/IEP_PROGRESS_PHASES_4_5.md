# IEP Progress System - Phases 4-5 Implementation

This document describes the new features added in Phases 4-5 of the IEP Progress System.

## Overview

Phases 4-5 introduce manual data entry (inline and bulk), assignment-to-goal automation, mapping UI, and realtime updates. All features are gated behind feature flags for safe deployment.

## Feature Flags

Two new feature flags control the functionality:

### `progressEditing`
- **Controls**: Inline editing and bulk add modal
- **Default**: `false`
- **Enable**: `window.__featureFlags.set('progressEditing', true)`
- **Disable**: `window.__featureFlags.set('progressEditing', false)`

### `progressAutoFromAssignments`
- **Controls**: Assignment-goal mapping UI and automated progress tracking
- **Default**: `false`
- **Enable**: `window.__featureFlags.set('progressAutoFromAssignments', true)`
- **Disable**: `window.__featureFlags.set('progressAutoFromAssignments', false)`

## Features

### 1. Inline Editing

When `progressEditing` is enabled:

- Click any date cell in the progress grid to edit the value
- Enter a value between 0-100
- Use keyboard shortcuts:
  - `Up/Down Arrow`: Adjust value by ±1
  - `Shift+Up/Down Arrow`: Adjust value by ±5
  - `Enter`: Save the value
  - `Escape`: Cancel editing
- Changes are saved optimistically and rolled back on error
- Multiple entries for the same date display stacked indicators

### 2. Bulk Add Modal

When `progressEditing` is enabled:

- Click "Bulk Add Progress" button in the filter bar
- **Step 1**: Select goals (multi-select, searchable by student/goal/area)
- **Step 2**: Select dates (single date or range with optional weekend skip)
- **Step 3**: Enter values in a Goals × Dates table
- **Step 4**: Review and commit all entries at once

**Shortcuts**:
- Fill All: Set all cells to the same value
- Clear: Reset a cell to empty

### 3. Assignment-Goal Mapping

When `progressAutoFromAssignments` is enabled:

- Click "⚙️ Assignment Mapping" button in the filter bar
- Select an assignment from the list
- Add goals to map to this assignment
- Toggle "Primary" flag for each goal mapping
- Remove mappings as needed

When a submission is graded for a mapped assignment, progress entries are automatically created for all mapped goals.

### 4. Stacked Indicators

When multiple progress entries exist for the same date:

- Small badges appear next to the value (A = Assignment, M = Manual, I = Import)
- Hover over the badges to see a mini-history panel with:
  - All values for that date
  - Source of each entry
  - Timestamp of each entry

### 5. Realtime Updates

When connected to Supabase:

- Grid automatically refreshes when new progress entries are inserted
- Updates are debounced (250ms) to avoid excessive refreshes
- Connection status tracked via `window.__diagnoseProgressEditing()`

## Database Schema

### `assignment_goal_map` Table

Stores the mapping between assignments and IEP goals:

```sql
CREATE TABLE assignment_goal_map (
  id uuid PRIMARY KEY,
  assignment_id bigint REFERENCES assignments(id),
  goal_id uuid REFERENCES goals(id),
  primary_goal boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(assignment_id, goal_id)
);
```

### `record_progress_for_submission` RPC

Automatically creates progress entries when a submission is graded:

```sql
SELECT record_progress_for_submission(instance_id);
```

**Returns**: `{ success: boolean, inserted_count: integer, progress_value: numeric }`

**Logic**:
1. Fetches the submission and assignment instance
2. Derives progress value from scores (priority: auto > manual > total)
3. Looks up all mapped goals
4. Inserts a `goal_progress` entry for each goal

## Data Adapter Functions

### Local & Remote Adapters

**bulkInsertGoalProgress(rows[])**
- Inserts multiple progress entries at once
- Returns: `{ inserted: number, data: array }`

**listAssignmentGoalMappings(assignment_id?)**
- Lists all assignment-goal mappings
- Optionally filter by assignment ID

**upsertAssignmentGoalMapping({ assignment_id, goal_id, primary_goal })**
- Creates or updates a mapping

**deleteAssignmentGoalMapping({ assignment_id, goal_id })**
- Removes a mapping

**recordProgressForSubmission(instance_id)**
- Triggers the RPC to create progress entries
- Returns automation result

## Developer Tools

### Diagnostics

```javascript
// Get diagnostics
const diag = window.__diagnoseProgressEditing();
console.log(diag);
// Returns:
// {
//   editingEnabled: boolean,
//   autoFromAssignmentsEnabled: boolean,
//   bulkModalOpen: boolean,
//   pendingBulkRows: number,
//   realtimeActive: boolean,
//   editingCell: string | null,
//   dataRows: number,
//   processedAreas: number,
//   featureFlags: { ... },
//   featureDefinitions: [ ... ]
// }
```

### Feature Flag Management

```javascript
// Get a flag
const isEditing = window.__featureFlags.get('progressEditing');

// Set a flag
window.__featureFlags.set('progressEditing', true);

// Get all flags
const allFlags = window.__featureFlags.getAll();

// Get definitions
const defs = window.__featureFlags.getDefinitions();
```

### Console Logging

All operations log with prefixes:
- `[progress-inline-edit]` - Inline editing operations
- `[progress-bulk]` - Bulk add operations
- `[progress-mapping]` - Assignment-goal mapping operations
- `[progress-realtime]` - Realtime subscription events
- `[progress-assignment]` - Assignment automation triggers

## Testing

### Manual Testing Checklist

1. **Inline Edit**:
   - Enable `progressEditing` flag
   - Click a date cell
   - Enter a value (0-100)
   - Press Enter to save
   - Verify persistence after page reload
   - Verify metrics update (Baseline, Current, Delta, Trend)

2. **Bulk Add**:
   - Enable `progressEditing` flag
   - Click "Bulk Add Progress"
   - Select 2-3 goals
   - Select a date range (e.g., 5 days)
   - Enter values for all cells
   - Click "Save All Entries"
   - Verify all entries appear in grid
   - Verify quarter averages update

3. **Assignment Mapping**:
   - Enable `progressAutoFromAssignments` flag
   - Click "⚙️ Assignment Mapping"
   - Select an assignment
   - Add 2 goals
   - Mark one as primary
   - Simulate a submission for that assignment
   - Verify 2 new progress entries appear
   - Verify they're marked with "A" badge

4. **Stacked Indicators**:
   - Create a manual entry for a date
   - Create an assignment entry for the same date (via automation)
   - Verify both badges appear (M and A)
   - Hover over badges
   - Verify history panel shows both entries

5. **Feature Flags**:
   - Disable `progressEditing`
   - Verify inline edit and bulk add disappear
   - Disable `progressAutoFromAssignments`
   - Verify mapping button disappears

6. **Realtime** (requires Supabase):
   - Open grid in two browser windows
   - Add a progress entry in one window
   - Verify it appears in the other window within ~250ms

## Accessibility

- All interactive elements have proper `aria-label` attributes
- Inline editor includes `aria-describedby` for keyboard hints
- Screen-reader only text provides instructions
- Tab navigation works through all editable cells
- Focus management handles editor open/close

## Security Considerations

- All user input is validated (0-100 range)
- HTML is escaped to prevent XSS
- RLS policies should be configured on Supabase tables
- Feature flags prevent unauthorized access to functionality
- Optimistic updates are rolled back on server errors

## Performance

- Realtime updates are debounced (250ms)
- Bulk inserts use batched operations
- Grid uses column virtualization for large datasets
- Data fetching uses proper pagination

## Browser Compatibility

- Modern evergreen browsers (Chrome, Firefox, Edge, Safari)
- ES6+ features used (requires transpilation for older browsers)
- CSS Grid and Flexbox for layout
- Native `fetch` API for network requests

## Deployment

1. Run database migration: `20251108_phases_4_5_assignment_goal_mapping.sql`
2. Deploy updated web files
3. Feature flags default to `false` - safe to deploy
4. Enable flags incrementally per role/user as needed
5. Monitor console logs and diagnostics
6. Rollback by disabling feature flags if issues arise

## Future Enhancements (Not in Scope)

- PDF export of progress reports
- Advanced filtering (value ranges, date ranges)
- Saved filter presets
- Weekly/monthly aggregation views
- Risk indicators based on trend analysis
- Email notifications for low progress
- Parent/guardian view with limited access
