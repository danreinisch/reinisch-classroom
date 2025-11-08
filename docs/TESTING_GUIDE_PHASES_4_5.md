# Testing Guide for IEP Progress Phases 4-5

## Quick Setup for Testing

### 1. Enable Feature Flags

Open the browser console and run:

```javascript
// Enable inline editing and bulk add
window.__featureFlags.set('progressEditing', true);

// Enable assignment mapping and automation
window.__featureFlags.set('progressAutoFromAssignments', true);

// Verify flags are enabled
console.log(window.__featureFlags.getAll());
```

### 2. Check Diagnostics

```javascript
// Get current state
window.__diagnoseProgressEditing();
```

Expected output:
```javascript
{
  editingEnabled: true,
  autoFromAssignmentsEnabled: true,
  bulkModalOpen: false,
  pendingBulkRows: 0,
  realtimeActive: false, // true if Supabase connected
  editingCell: null,
  dataRows: <number>,
  processedAreas: <number>,
  featureFlags: { ... },
  featureDefinitions: [ ... ]
}
```

## Test Scenarios

### Test 1: Inline Editing

**Steps:**
1. Open the Progress Grid (click "View All Progress" if using V2 grid)
2. Find any date cell in the grid
3. Click the cell - an inline editor should appear
4. Enter a value (e.g., 85)
5. Try keyboard shortcuts:
   - Up Arrow: value increases by 1
   - Down Arrow: value decreases by 1
   - Shift+Up Arrow: value increases by 5
   - Shift+Down Arrow: value decreases by 5
6. Press Enter to save
7. Verify the value is saved and metrics update
8. Refresh the page and verify the value persists

**Expected Result:**
- Cell becomes editable with green highlight
- Input accepts values 0-100
- Keyboard shortcuts work
- Save updates the cell and metrics (Baseline, Current, Delta, Trend)
- Data persists after page reload

### Test 2: Bulk Add

**Steps:**
1. Click "➕ Bulk Add Progress" button in filter bar
2. **Step 1 - Select Goals:**
   - Use search to find goals
   - Filter by Goal Area or Class
   - Select 2-3 goals
   - Click "Next: Select Dates"
3. **Step 2 - Select Dates:**
   - Choose "Date Range" option
   - Select start date (e.g., today)
   - Select end date (e.g., 5 days from now)
   - Check "Skip weekends"
   - Click "Next: Enter Values"
4. **Step 3 - Enter Values:**
   - Enter different values in the table (e.g., 70, 75, 80, 85, 90)
   - Try "Fill All" button to set all cells to same value
   - Click "Next: Review"
5. **Step 4 - Review:**
   - Verify the count of entries
   - Review the list
   - Click "✓ Save All Entries"

**Expected Result:**
- Modal opens with 4-step wizard
- Search and filters work in goal selection
- Date range generates correct dates (skips weekends)
- Value table displays Goals × Dates grid
- All entries are saved and appear in main grid
- Quarter averages update

### Test 3: Assignment Mapping

**Steps:**
1. Click "⚙️ Assignment Mapping" button
2. **Select an Assignment:**
   - Use search to find an assignment
   - Click on an assignment name
3. **Add Goals:**
   - Click "+ Add Goals"
   - Select 2-3 goals from the list
   - Click "Add Selected Goals"
4. **Toggle Primary Flag:**
   - Check "Primary" for one of the goals
   - Verify it's saved
5. **Test Automation:**
   - Go to Assignments tab
   - Simulate a submission for the mapped assignment
   - Observe that progress entries are created for mapped goals
6. **Verify Realtime (if Supabase connected):**
   - Open grid in two browser windows
   - Add/edit progress in one window
   - Verify update appears in other window

**Expected Result:**
- Mapping modal opens
- Can add/remove goal mappings
- Primary flag toggles correctly
- Submission creates progress entries automatically
- Entries show "A" badge for assignment source
- Realtime updates work (if Supabase enabled)

### Test 4: Stacked Indicators

**Steps:**
1. Find a date cell in the grid
2. Click and add a manual entry (e.g., 80)
3. Map an assignment to the same goal
4. Simulate a submission for that assignment (different score, e.g., 85)
5. Look at the same date cell

**Expected Result:**
- Cell shows both "M" (manual) and "A" (assignment) badges
- Hover over badges reveals history panel
- History panel shows:
  - Both entries
  - Source of each (manual vs assignment)
  - Timestamp of each entry
  - Value of each entry

### Test 5: Feature Flag Toggling

**Steps:**
1. With flags enabled, verify buttons are visible:
   - "➕ Bulk Add Progress"
   - "⚙️ Assignment Mapping"
   - Date cells are clickable
2. Disable progressEditing:
   ```javascript
   window.__featureFlags.set('progressEditing', false);
   ```
3. Refresh page
4. Verify "Bulk Add Progress" button is gone
5. Verify date cells are NOT clickable
6. Disable progressAutoFromAssignments:
   ```javascript
   window.__featureFlags.set('progressAutoFromAssignments', false);
   ```
7. Refresh page
8. Verify "Assignment Mapping" button is gone

**Expected Result:**
- Features disappear when flags are disabled
- Re-enabling flags restores features
- No errors in console

### Test 6: Keyboard Navigation & Accessibility

**Steps:**
1. Click any date cell to open editor
2. Tab through the inline editor controls
3. Test keyboard shortcuts:
   - Enter to save
   - Escape to cancel
   - Up/Down arrows to adjust value
   - Shift+Up/Down for larger adjustments
4. Use screen reader (if available)
5. Navigate with Tab key through grid

**Expected Result:**
- Tab order is logical (input → save → cancel)
- All shortcuts work as expected
- Screen reader announces element roles and labels
- Focus indicators are visible

## Troubleshooting

### Features Not Appearing

Check:
```javascript
// Verify flags
window.__featureFlags.getAll();

// Should show:
// { progressEditing: true, progressAutoFromAssignments: true }

// If false, enable:
window.__featureFlags.set('progressEditing', true);
window.__featureFlags.set('progressAutoFromAssignments', true);

// Then refresh page
location.reload();
```

### Inline Edit Not Working

Check console for errors:
```javascript
// Look for logs with prefix [progress-inline-edit]
```

Common issues:
- Feature flag not enabled
- Cell not clickable (not in date column)
- Data not loaded yet

### Bulk Add Errors

Check console for errors:
```javascript
// Look for logs with prefix [progress-bulk]
```

Common issues:
- No goals selected
- Invalid date range
- Network error during save

### Assignment Automation Not Working

Check console for errors:
```javascript
// Look for logs with prefix [progress-assignment] and [progress-mapping]
```

Common issues:
- Feature flag not enabled
- No goals mapped to assignment
- Submission has no score
- RPC function not available (local mode)

### Realtime Not Working

Check:
```javascript
window.__diagnoseProgressEditing();
// Look at realtimeActive field
```

Common issues:
- Supabase not configured (local mode)
- Network connection issues
- Subscription failed (check console for [progress-realtime] logs)

## Clean Up After Testing

To reset feature flags to default:

```javascript
// Disable all features
window.__featureFlags.set('progressEditing', false);
window.__featureFlags.set('progressAutoFromAssignments', false);

// Or reset to defaults (also false)
localStorage.removeItem('rc_feature_progress_editing');
localStorage.removeItem('rc_feature_progress_auto_assignments');

// Refresh to apply
location.reload();
```

## Performance Notes

- Bulk add with 10+ goals × 10+ dates may take a few seconds
- Realtime updates are debounced (250ms) - multiple rapid changes will batch
- Grid virtualization handles large datasets efficiently
- Watch console for any performance warnings
