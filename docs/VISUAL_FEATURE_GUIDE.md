# IEP Progress System - Phases 4-5 Features

## Visual Feature Overview

### 1. Inline Editing

**Before (Phase 3):**
```
┌─────────────────────────────────────────────────┐
│ Student │ Goal │ ... │ 2024-11-01 │ 2024-11-02 │
├─────────────────────────────────────────────────┤
│ STU001  │ G1   │ ... │    75%     │    80%     │ ← Read-only
│ STU002  │ G2   │ ... │    65%     │    70%     │
└─────────────────────────────────────────────────┘
```

**After (Phase 4) - When progressEditing = true:**
```
┌─────────────────────────────────────────────────┐
│ Student │ Goal │ ... │ 2024-11-01 │ 2024-11-02 │
├─────────────────────────────────────────────────┤
│ STU001  │ G1   │ ... │    75%     │ ┌──────┐   │ ← Click to edit
│ STU002  │ G2   │ ... │    65%     │ │ 85 ✓✗│   │ ← Inline editor
└─────────────────────────────────────────────────┘
```

**Keyboard Shortcuts:**
- `Enter` → Edit mode
- `↑` / `↓` → Adjust ±1
- `Shift+↑` / `Shift+↓` → Adjust ±5
- `Enter` → Save
- `Esc` → Cancel

---

### 2. Bulk Add Modal

**4-Step Wizard:**

```
Step 1: Select Goals
┌────────────────────────────────────────┐
│ 🔍 Search: [math reading     ]        │
│                                        │
│ Filter by Area: [All Areas ▼]         │
│ Filter by Class: [All Classes ▼]      │
│                                        │
│ ☐ STU001 - G1 - Reading Comprehension │
│ ☑ STU001 - G2 - Math Problem Solving  │
│ ☑ STU002 - G3 - Reading Fluency       │
│                                        │
│            [Next: Select Dates →]      │
└────────────────────────────────────────┘

Step 2: Select Dates
┌────────────────────────────────────────┐
│ ○ Single Date  ● Date Range            │
│                                        │
│ Start: [2024-11-01]                    │
│ End:   [2024-11-05]                    │
│ ☑ Skip weekends                        │
│                                        │
│ [← Back]    [Next: Enter Values →]     │
└────────────────────────────────────────┘

Step 3: Enter Values
┌────────────────────────────────────────┐
│ Goal      │ 11/01 │ 11/02 │ 11/04 │ ...│
│───────────┼───────┼───────┼───────┼────│
│ STU001-G2 │  75   │  80   │  85   │ ...│
│ STU002-G3 │  70   │  75   │  80   │ ...│
│                                        │
│ Fill All: [80 ▼] [Fill]                │
│                                        │
│ [← Back]    [Next: Review →]           │
└────────────────────────────────────────┘

Step 4: Review & Commit
┌────────────────────────────────────────┐
│ 6 entries will be created:             │
│                                        │
│ • STU001 - G2 - 2024-11-01: 75%        │
│ • STU001 - G2 - 2024-11-02: 80%        │
│ • STU001 - G2 - 2024-11-04: 85%        │
│ • STU002 - G3 - 2024-11-01: 70%        │
│ • ... and 2 more                       │
│                                        │
│ [← Back]    [✓ Save All Entries]       │
└────────────────────────────────────────┘
```

---

### 3. Assignment Mapping

**Mapping UI:**

```
┌─────────────────────────────────────────────────┐
│ ⚙️ Assignment → Goal Mapping              [✗]  │
├─────────────────────────────────────────────────┤
│ Assignments          │ Mapped Goals             │
│──────────────────────┼──────────────────────────│
│ 🔍 [Search...]       │ Assignment: "Math Quiz 1"│
│                      │                          │
│ ┌──────────────────┐ │ ☐ STU001 - G2 (Math)    │
│ │► Math Quiz 1     │ │   [☑ Primary] [Remove]  │
│ ├──────────────────┤ │                          │
│ │  Reading Test    │ │ ☐ STU002 - G3 (Reading) │
│ ├──────────────────┤ │   [☐ Primary] [Remove]  │
│ │  Science Lab     │ │                          │
│ └──────────────────┘ │ [+ Add Goals]            │
└─────────────────────────────────────────────────┘
```

**Automation Flow:**

```
1. Teacher maps goals to assignment
   Assignment "Math Quiz 1" → Goals [G2, G3]

2. Student submits assignment
   Score: 85%

3. System automatically creates progress entries
   ✓ STU001 - G2 - 2024-11-08: 85% (source: assignment)
   ✓ STU001 - G3 - 2024-11-08: 85% (source: assignment)

4. Grid updates in realtime (if Supabase connected)
```

---

### 4. Stacked Indicators

**Single Entry:**
```
┌──────────┐
│   75%    │ ← Single entry
└──────────┘
```

**Multiple Entries (Manual + Assignment):**
```
┌──────────┐
│ 80% [M A]│ ← Two entries: Manual (80%) + Assignment (85%)
└──────────┘
      │
      └─ Hover to see history panel:
         ┌─────────────────────────┐
         │ M  80%  Nov 8, 9:00 AM  │
         │ A  85%  Nov 8, 2:30 PM  │
         └─────────────────────────┘
```

**Badge Legend:**
- `M` = Manual entry (teacher input)
- `A` = Assignment (automated)
- `I` = Import (bulk import)

---

### 5. Feature Flags

**Architecture:**

```javascript
// Feature Flag Storage (localStorage)
┌─────────────────────────────────────────┐
│ rc_feature_progress_editing: false      │ ← Controls inline edit & bulk add
│ rc_feature_progress_auto_assignments:   │ ← Controls mapping & automation
│                              false      │
└─────────────────────────────────────────┘

// Runtime API
window.__featureFlags.set('progressEditing', true);
window.__featureFlags.get('progressEditing');  // → true
window.__featureFlags.getAll();  // → { progressEditing: true, ... }
```

**Visibility Matrix:**

| Feature Flag                    | When OFF        | When ON          |
|---------------------------------|-----------------|------------------|
| `progressEditing`               | Read-only cells | Clickable cells  |
|                                 | No bulk button  | Bulk add button  |
| `progressAutoFromAssignments`   | No mapping btn  | Mapping button   |
|                                 | No automation   | Auto-tracking    |

---

### 6. Realtime Updates

**Flow Diagram:**

```
Browser A                   Supabase                Browser B
─────────                   ────────                ─────────
   │                           │                        │
   │ 1. Add progress (85%)     │                        │
   ├──────────────────────────>│                        │
   │                           │                        │
   │                           │ 2. Insert event        │
   │                           ├───────────────────────>│
   │                           │                        │
   │                           │ 3. Realtime broadcast  │
   │<──────────────────────────┤                        │
   │                           │                        │
   │ 4. Grid updates (250ms debounce)                   │
   │                           │ 5. Grid updates        │
   │                           │                        │
```

**Debouncing:**
- Multiple rapid updates → Single refresh after 250ms
- Prevents UI flicker and performance issues
- All events within window are coalesced

---

### 7. Diagnostics

**Console Commands:**

```javascript
// Get current state
window.__diagnoseProgressEditing();
// Returns:
{
  editingEnabled: true,
  autoFromAssignmentsEnabled: true,
  bulkModalOpen: false,
  pendingBulkRows: 0,
  realtimeActive: true,
  editingCell: null,
  dataRows: 247,
  processedAreas: 5,
  featureFlags: { ... },
  featureDefinitions: [ ... ]
}

// Feature flag management
window.__featureFlags.get('progressEditing');
window.__featureFlags.set('progressEditing', true);
window.__featureFlags.getAll();
window.__featureFlags.getDefinitions();
```

**Console Logging Prefixes:**

```
[progress-inline-edit] → Inline editing operations
[progress-bulk]        → Bulk add modal operations
[progress-mapping]     → Assignment mapping operations
[progress-realtime]    → Realtime subscription events
[progress-assignment]  → Assignment automation triggers
```

---

## Data Flow

### Inline Edit Flow

```
1. User clicks cell
   ↓
2. openInlineEditor() creates input
   ↓
3. User enters value (validated 0-100)
   ↓
4. User presses Enter
   ↓
5. save() called
   ├─ Optimistic UI update (cell shows new value)
   ├─ db.upsertGoalProgress() → Backend
   ├─ Success: refresh() → Update metrics
   └─ Failure: Rollback to original value
```

### Bulk Add Flow

```
1. User clicks "Bulk Add Progress"
   ↓
2. Step 1: Select goals (filter, search, multi-select)
   ↓
3. Step 2: Select dates (single or range, weekend skip)
   ↓
4. Step 3: Enter values (Goals × Dates table)
   ↓
5. Step 4: Review (list all pending entries)
   ↓
6. User clicks "Save All Entries"
   ↓
7. db.bulkInsertGoalProgress() → Backend batch insert
   ├─ Success: Show count, close modal, refresh grid
   └─ Failure: Show error, allow retry
```

### Assignment Automation Flow

```
1. Teacher maps Assignment A to Goals [G1, G2]
   ↓
2. Student submits Assignment A
   ↓
3. db.addSubmission() creates submission record
   ↓
4. IF progressAutoFromAssignments flag is ON:
   ↓
5. db.recordProgressForSubmission(instance_id)
   ↓
6. RPC function executes:
   ├─ Fetch submission & instance
   ├─ Get score (auto > manual > total)
   ├─ Lookup mapped goals [G1, G2]
   └─ Insert progress entries for each goal
   ↓
7. Realtime broadcast → All connected clients refresh
```

---

## Security Model

### Input Validation

```javascript
// All user inputs validated
value >= 0 && value <= 100  // Numeric range
escapeHtml(userInput)       // XSS prevention
parseInt(value)             // Type enforcement
```

### HTML Escaping

```javascript
escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;  // Browser handles escaping
  return div.innerHTML;
}

// Used everywhere innerHTML is set with user data:
`<div>${this.escapeHtml(studentName)}</div>`
```

### Feature Flag Access Control

```javascript
// Features invisible when flag = false
if (getFeatureFlag('progressEditing')) {
  // Show button, enable editing
} else {
  // Hide button, cells read-only
}
```

---

## Performance Considerations

### Grid Rendering

- **Column Virtualization**: Only visible date columns rendered
- **Row Grouping**: Collapsible goal areas reduce DOM nodes
- **Debounced Updates**: Filter changes debounced 300ms

### Bulk Operations

- **Batch Insert**: Single DB call for multiple rows
- **Optimistic UI**: UI updates before server confirms
- **Chunking**: Large batches processed in chunks (if needed)

### Realtime

- **Debounced Refresh**: 250ms window for coalescing events
- **Selective Updates**: Only changed rows updated
- **Connection Pooling**: Single channel per client

---

## Browser Compatibility

**Minimum Requirements:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Features Used:**
- ES6 Modules
- CSS Grid & Flexbox
- Fetch API
- localStorage
- Native number input
- ARIA attributes

**Polyfills Not Required** (modern browsers only)

---

## Migration Path

### From Phase 3 to Phases 4-5

**Safe Migration:**
1. Deploy database migration (additive only, no data changes)
2. Deploy web code (flags default to OFF)
3. Test in dev/staging with flags ON
4. Enable in production incrementally
5. Monitor diagnostics and console logs

**Rollback:**
- Disable feature flags (instant)
- No database rollback needed (additive schema)
- No data loss (new tables remain empty when flags off)

---

## Future Enhancements (Out of Scope)

### Potential Phase 6 Features

- **PDF Export**: Generate progress reports as PDF
- **Advanced Filters**: Value ranges, trend filters, risk indicators
- **Saved Presets**: Save filter configurations
- **Aggregation Views**: Weekly/monthly summaries
- **Notifications**: Email alerts for low progress
- **Parent Portal**: Read-only view for parents/guardians
- **Goal Templates**: Reusable goal definitions
- **Bulk Edit**: Edit multiple cells at once
- **Undo/Redo**: Action history with rollback
- **Comments**: Add notes to progress entries

---

## Support & Troubleshooting

### Common Issues

**Issue:** Inline edit not working
**Solution:** Check `window.__featureFlags.get('progressEditing')`

**Issue:** Bulk add fails
**Solution:** Check console for `[progress-bulk]` errors

**Issue:** Realtime not updating
**Solution:** Verify Supabase connection, check `realtimeActive` in diagnostics

**Issue:** Assignment automation not working
**Solution:** Verify flag enabled, goals mapped, submission has score

### Debug Checklist

1. ✓ Feature flags enabled?
2. ✓ Console errors?
3. ✓ Network tab shows requests?
4. ✓ Diagnostics show expected state?
5. ✓ Data exists in database?

### Get Help

- Check documentation: `docs/IEP_PROGRESS_PHASES_4_5.md`
- Run diagnostics: `window.__diagnoseProgressEditing()`
- Check console logs with appropriate prefixes
- Review testing guide: `docs/TESTING_GUIDE_PHASES_4_5.md`
