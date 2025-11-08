# Phase 6-8 Testing Guide

This guide explains how to test the new power features added to the IEP Progress Grid.

## Prerequisites

1. Load the `teacher-center-unified.html` file in a modern browser
2. Ensure you have sample IEP progress data loaded
3. For PDF export, include jsPDF library with integrity check:
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" 
           integrity="sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==" 
           crossorigin="anonymous" 
           referrerpolicy="no-referrer"></script>
   ```

## Enabling Features

All Phase 6-8 features are behind feature flags. Enable them via browser console:

```javascript
// Enable all Phase 6-8 features
import { setFeatureFlag } from './web/feature-flags.js';

setFeatureFlag('progressSavedViews', true);
setFeatureFlag('progressAdvancedFilters', true);
setFeatureFlag('progressRiskIndicators', true);
setFeatureFlag('progressRollups', true);
setFeatureFlag('progressPdfExport', true);
```

Or enable them individually as needed.

## Feature Testing

### A) Saved Views

**Test Case 1: Save a View**
1. Apply some filters (e.g., select specific quarters, students, goal areas)
2. Click the 💾 (Save) button next to the "Saved Views" dropdown
3. Enter a name for the view (e.g., "At-Risk Reading Q2")
4. Verify the view appears in the dropdown
5. Verify the view is selected after saving

**Test Case 2: Restore a View**
1. Change filters to different values
2. Select your saved view from the dropdown
3. Verify all filters are restored to the saved state
4. Verify the grid updates to show the filtered data

**Test Case 3: Update a View**
1. With a saved view selected, modify some filters
2. Click the ↻ (Update) button
3. Confirm the update
4. Reload the page and restore the view
5. Verify the updated filters are applied

**Test Case 4: Delete a View**
1. Select a saved view from the dropdown
2. Click the 🗑️ (Delete) button
3. Confirm deletion
4. Verify the view is removed from the dropdown

**Test Case 5: Auto-Restore Last Used**
1. Select a saved view
2. Reload the page
3. Verify the same view is automatically restored

### B) Advanced Filters

**Test Case 1: Value Range Filter**
1. Enable advanced filters
2. Set "Value Range (Current %)" Min to 70
3. Verify only goals with current values >= 70% are shown
4. Set Max to 90
5. Verify only goals with current values 70-90% are shown

**Test Case 2: Source Type Filter**
1. Check "Manual" in Data Sources
2. Verify only goals with manual entries are shown
3. Check "Assignment" as well
4. Verify goals with either manual OR assignment entries are shown

**Test Case 3: Data Recency Filter**
1. Select "Last 7 days" from Data Recency dropdown
2. Verify only goals with entries in the last 7 days are shown
3. Change to "Last 14 days"
4. Verify the filter updates correctly

**Test Case 4: Combined Filters**
1. Apply value range: Current >= 80%
2. Apply source: Manual only
3. Apply recency: Last 30 days
4. Verify all filters work together (AND logic)

### C) Risk Indicators

**Test Case 1: Missing Data Risk**
1. Enable risk indicators
2. Show the Risk column (should be visible by default)
3. Find a goal with no data in the last 14+ days
4. Verify it shows a 🔴 (red) risk indicator
5. Hover over the icon to see the tooltip explaining why

**Test Case 2: Below Target Risk**
1. Find a goal with a target set
2. Ensure current value is more than 10pp below target
3. Verify it shows a 🔴 (red) or 🟡 (amber) risk indicator
4. Check the tooltip for explanation

**Test Case 3: Negative Trend Risk**
1. Create or find a goal with 3+ consecutive declining values
2. Verify it shows a risk indicator
3. Check the tooltip mentions "Declining trend"

**Test Case 4: Last Data Age Column**
1. Verify "Last Data" column shows days since last entry
2. Check that it's formatted as "Xd" (e.g., "7d")

**Test Case 5: Delta vs Target Column**
1. For goals with targets, verify "Δ Target" column shows difference
2. Positive deltas should be green, negative should be red
3. Format should be "+Xpp" or "-Xpp"

### D) Rollups: Weekly/Monthly Aggregation

**Test Case 1: Weekly Rollup**
1. Enable rollups feature
2. Click "Weekly" in the Granularity toggles
3. Verify date column headers change to week format (e.g., "W42 (10/15)")
4. Verify values shown are averages for each week
5. Check that grid updates within 500ms

**Test Case 2: Monthly Rollup**
1. Click "Monthly" in the Granularity toggles
2. Verify date column headers change to month format (e.g., "Oct 2025")
3. Verify values shown are averages for each month

**Test Case 3: CSV Export with Rollups**
1. Set granularity to "Weekly"
2. Click "📥 Export CSV"
3. Open the downloaded CSV file
4. Verify column headers reflect weekly periods
5. Verify filename includes "_weekly" suffix

**Test Case 4: Switch Back to Daily**
1. Click "Daily" in the Granularity toggles
2. Verify date columns return to individual dates
3. Verify all individual measurements are shown

### E) PDF Export

**Test Case 1: Basic PDF Export**
1. Enable PDF export feature
2. Click "📄 Export PDF" button
3. Verify PDF is generated and downloaded
4. Open the PDF and check:
   - Header includes date and teacher name
   - Grid data is included
   - Font size is legible

**Test Case 2: PDF with Filtered Data**
1. Apply some filters
2. Export to PDF
3. Verify only filtered rows are in the PDF
4. Check that filter info is shown in the header

**Test Case 3: PDF with Saved View**
1. Select a saved view
2. Export to PDF
3. Verify the view name appears in the PDF header

### F) Accessibility & Keyboard Navigation

**Test Case 1: Tab Navigation**
1. Click in the browser address bar
2. Press Tab repeatedly
3. Verify focus moves through:
   - Saved Views dropdown
   - Filter inputs
   - Granularity toggles
   - Action buttons
   - Grid headers
   - Editable cells (if editing enabled)

**Test Case 2: Keyboard Shortcuts**
1. Focus on a granularity toggle
2. Press Enter or Space to activate
3. Focus on a saved view
4. Press Enter to restore
5. Focus on an area header collapse icon
6. Press Enter to expand/collapse

**Test Case 3: Screen Reader Labels**
1. Use a screen reader (e.g., NVDA, JAWS, VoiceOver)
2. Navigate through the grid
3. Verify cells announce:
   - Student code
   - Goal code
   - Date
   - Value with percentage
4. Verify column headers are announced
5. Verify risk indicators have descriptive tooltips

**Test Case 4: Focus Visible States**
1. Use Tab to navigate
2. Verify all focused elements have visible outline
3. Check contrast is sufficient (should be green/accent color)

### G) Performance & Caching

**Test Case 1: Query Caching**
1. Apply filters and wait for grid to render
2. Note the render time
3. Change filters, then change back to original
4. Verify second render is faster (cache hit)

**Test Case 2: Debouncing**
1. Rapidly type in the search box
2. Verify grid doesn't re-render on every keystroke
3. Verify it waits ~100-200ms after you stop typing

**Test Case 3: Large Dataset Performance**
1. Load a dataset with ~2000 rows
2. Measure initial render time (should be ≤ 1.0s)
3. Test horizontal scrolling (should be smooth)
4. Apply filters (should respond within 500ms)

**Test Case 4: Cache Size Limit**
1. Apply 15 different filter combinations
2. Check browser console for cache size
3. Verify cache doesn't exceed 10 entries (LRU eviction)

## Acceptance Criteria Checklist

- [ ] **Saved Views**: Create, update, delete, and recall configurations work
- [ ] **Saved Views**: Last-used state auto-restores on page load
- [ ] **Advanced Filters**: Value range applies correctly
- [ ] **Advanced Filters**: Source type filter works (OR logic within category)
- [ ] **Advanced Filters**: Data recency filter works
- [ ] **Advanced Filters**: All filters combine with AND logic across categories
- [ ] **Risk Indicators**: Icons/colors reflect rules accurately
- [ ] **Risk Indicators**: Tooltips explain reasons for risk
- [ ] **Risk Indicators**: Configurable thresholds are respected
- [ ] **Rollups**: Switching granularity updates grid correctly
- [ ] **Rollups**: CSV export reflects chosen granularity
- [ ] **Rollups**: Averages are calculated correctly
- [ ] **PDF Export**: Exported file matches visible slice
- [ ] **PDF Export**: Prints legibly
- [ ] **Accessibility**: Keyboard navigation works across all controls
- [ ] **Accessibility**: Screen reader labels are present and accurate
- [ ] **Accessibility**: Focus states are visible with sufficient contrast
- [ ] **Performance**: No regressions vs Phase 4-5
- [ ] **Performance**: Initial render ≤ 1.0s for ~2k rows
- [ ] **Performance**: Smooth horizontal scrolling

## Common Issues & Troubleshooting

### PDF Export Not Working
- Ensure jsPDF library is loaded with integrity check: check browser console for errors
- Try: 
  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" 
          integrity="sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==" 
          crossorigin="anonymous" 
          referrerpolicy="no-referrer"></script>
  ```

### Saved Views Not Persisting
- Check browser console for Supabase errors
- In local mode, views save to localStorage (check Application tab in DevTools)
- Ensure user_id is set in grid options

### Risk Indicators Not Showing
- Enable the feature flag: `setFeatureFlag('progressRiskIndicators', true)`
- Verify visibleColumns.risk is true
- Check that you have test data with varying recency

### Filters Not Applying
- Check browser console for JavaScript errors
- Verify filter inputs are updating state (add console.log in event handlers)
- Ensure debouncedRender is being called

## Test Data Setup

For comprehensive testing, ensure your test data includes:

1. **For Risk Indicators**:
   - Goals with recent data (< 7 days old)
   - Goals with old data (> 14 days old)
   - Goals with targets (to test delta vs target)
   - Goals with declining trends (3+ consecutive decreases)

2. **For Advanced Filters**:
   - Mix of manual, assignment, and import entries
   - Range of current values (0-100%)
   - Data spanning multiple weeks/months

3. **For Rollups**:
   - Daily data spanning at least 2-3 weeks
   - Multiple entries per week for averaging

## Reporting Issues

When reporting issues, include:
1. Feature flag states
2. Browser and version
3. Steps to reproduce
4. Expected vs actual behavior
5. Browser console errors (if any)
6. Screenshots (for UI issues)
