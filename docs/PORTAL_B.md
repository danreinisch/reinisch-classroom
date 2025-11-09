# Portal B: Student Productivity & Clarity Enhancements

## Overview

Portal B delivers comprehensive enhancements to the Student Portal focused on improving productivity and clarity through better organization, actionable feedback, and mobile accessibility. Now includes assignment detail views with navigation and quarterly grade tracking.

## Features

### 1. Assignment Status Groupings

Assignments are automatically grouped into six status categories with intelligent precedence:

- **Upcoming** - Due ≥ today, not submitted
- **In Progress** - Draft saved, not yet submitted
- **Late** - Past due and ≤ 3 days
- **Missing** - Past due > 3 days, not submitted (triggers login alert)
- **Submitted** - Submitted but not graded yet
- **Graded** - Graded with score displayed

**Status Precedence:** Missing > Late > In Progress > Upcoming

### 2. Assignment Detail Modal ✨ NEW

Click any assignment card to open a detailed view with:

- **Full Details** - Title, class, due date, description
- **Submission Info** - Latest submission details (score, date, notes)
- **Goal Linkage** - Shows linked IEP goals (if configured)
- **Navigation** - Prev/Next buttons to move between assignments in current tab
- **Keyboard Support** 
  - ESC - Close modal
  - ← - Previous assignment
  - → - Next assignment
  - Tab - Focus trap within modal
- **Deep Linking** - Share/bookmark with `#assignment/{instance_id}`
- **Actions** - Resubmit button (if applicable), Close button

**Navigation Behavior:**
- Prev/Next traverse assignments within the current status tab
- Wraps around (last → first, first → last)
- Maintains tab context when navigating

### 3. Grades Card with Quarterly Tracking ✨ ENHANCED

**Overall Metrics:**
- **Overall Average** - Mean of all graded assignments
- **Per-Class Averages** - Grouped by class
- **Trend Indicator** - Compares last 5 graded vs previous 5
  - ↗ Up (improvement > 3%)
  - → Flat (within ±3%)
  - ↘ Down (decline > 3%)
- **Mini Sparkline** - Visual representation of last 5 grades

**Quarterly Averages:** ✨ NEW
- **Q1 (Jan-Mar)** - Average for quarter 1
- **Q2 (Apr-Jun)** - Average for quarter 2
- **Q3 (Jul-Sep)** - Average for quarter 3
- **Q4 (Oct-Dec)** - Average for quarter 4
- **Inline Sparklines** - Visual trend for each quarter
- Calculated from `submitted_at` (UTC) of graded assignments

**Graded Assignments List:** ✨ NEW
- **Sortable Table** - Date, Class, Assignment, Score
- **Quarter Filter** - Dropdown to filter by quarter (Q1-Q4 or All)
- **Interactive** - Click assignment name to open detail modal
- **Deep Links** - Each row links to `#assignment/{instance_id}`

**Export Options:** ✨ NEW
- **CSV Export** - Includes all graded assignments + quarterly summary
- **PDF Export** - Print-friendly report with quarterly breakdown
- Both exports include quarter classification for each grade

### 4. One-Time Resubmission Workflow

- **Allowed:** One resubmission opportunity per assignment
- **Flow:**
  1. Graded assignment shows "Resubmit" button
  2. Confirmation modal explains one-revision limit
  3. On confirm, creates new submission linked to original
  4. Increments resubmission_count on instance
  5. Button replaced with "Revision used" text
- **Idempotency:** Double-click protection via disabled state

### 5. Top Status Bar

Fixed bar at top of portal showing:

- **Live Clock** - Auto-updates every minute, local timezone
  - Format: "Sat Nov 8, 3:10 PM"
- **Student Info** - Name and code from session
- **Actions:**
  - 🛠️ Tool Kit (opens https://reinischclassroom.com/language-arts/toolkit/ in new tab)
  - Help (shows support toast)
  - Logout

### 6. Smart Alerts & Toasts

**Login Alerts:**
- Missing assignments trigger prominent toast on login
- Late assignments show optional secondary toast
- Quick links scroll to relevant section

**Toast Features:**
- Auto-dismiss after 8 seconds
- Manual close button
- Action links for navigation
- Types: warning, info, success

### 7. IEP Goal Enhancements

- **Truncation:** Goal text limited to 140 characters
- **Tooltip:** Full text shown on hover/tap
- **Preserved Data:** Baseline, Current, Delta, Trend maintained
- **Goal Linkage:** ✨ NEW - Assignment detail shows linked IEP goals

### 8. Mobile Viability

**Responsive Breakpoints:**
- 320px - Small phones
- 375px - Standard phones
- 768px - Tablets
- 1024px - Small desktops

**Mobile Optimizations:**
- Collapsible status sections
- Vertical stacking of cards
- Large tap targets (min 44x44px)
- Compressed status bar
- Adjusted font sizes
- Responsive assignment detail modal

### 9. Accessibility

- **Keyboard Navigation** - All interactive elements keyboard accessible
- **ARIA Labels** - Status pills, modals, and actions properly labeled
- **Semantic HTML** - Proper heading hierarchy
- **Focus Management** - Clear focus indicators, modal focus trap
- **Color Contrast** - WCAG AA compliant

## Feature Flags

All Portal B features are controlled by feature flags in `web/feature-flags.js`:

```javascript
portalAssignmentsStatus: true    // Assignment groupings and filters
portalGradesCard: true           // Grades display panel
portalResubmission: true         // One-time resubmission workflow
portalTopBar: true               // Live clock and status bar
portalQuarterAverages: true      // ✨ NEW: Quarterly grade averages (Q1-Q4)
portalQuarterlyExport: true      // ✨ NEW: CSV/PDF export with quarterly data
```

## Helper Functions

All located in `web/portal-b-helpers.js`:

### Status Computation

```javascript
computeAssignmentStatus(instance, latestSubmission, now)
// Returns: 'Upcoming' | 'In Progress' | 'Late' | 'Missing' | 'Submitted' | 'Graded'
```

### Grouping

```javascript
groupAssignmentsByStatus(instances, submissionsMap, now)
// Returns: { [status]: [{ instance, latestSubmission, status }] }
```

### Filtering

```javascript
filterAssignments(assignments, { 
  status: ['Late', 'Missing'],
  dueDateFrom: '2024-01-01',
  dueDateTo: '2024-12-31',
  class_id: 'ENG101'
})
```

### Grade Calculations

```javascript
calculateOverallAverage(submissions)  // Returns average %
calculateClassAverages(submissions, instances, assignments)  // Per-class map
calculateTrend(submissions)  // { direction, lastFiveAvg, prevFiveAvg }
getSparklineData(submissions)  // Array of last 5 scores
```

### Quarterly Calculations ✨ NEW

```javascript
getQuarter(date)  
// Returns: 1-4 based on UTC month (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)

groupSubmissionsByQuarter(submissions)
// Returns: { 1: [...], 2: [...], 3: [...], 4: [...] }

calculateQuarterAverages(submissions)
// Returns: { Q1: pct|null, Q2: pct|null, Q3: pct|null, Q4: pct|null }

getQuarterSparklineData(submissions, quarter)
// Returns: Array of scores for specified quarter (chronological)

filterSubmissionsByQuarter(submissions, quarter)
// Returns: Filtered submissions for specified quarter (1-4) or all if null
```

### Utilities

```javascript
truncateText(text, maxLength=140)  // With ellipsis
formatDateTime(date, 'full' | 'date' | 'time')  // Localized
countMissingAssignments(groups)
countLateAssignments(groups)
```

## UI Components

### Assignment Card (Clickable)

```html
<div class="assignment-card" data-instance-id="abc123">
  <div class="assignment-card-header">
    <div class="assignment-card-title">Assignment Title</div>
    <span class="status-pill graded">Graded</span>
  </div>
  <div class="assignment-card-meta">
    <span>Class: English 101</span>
    <span>Due: Jan 15, 2024</span>
  </div>
  <div class="assignment-card-footer">
    <div>Score: 85%</div>
    <button class="btn small primary" data-action="resubmit">Resubmit</button>
  </div>
</div>
```

**Behavior:** Click anywhere on card (except buttons) to open detail modal.

### Assignment Detail Modal ✨ NEW

```javascript
openAssignmentDetail(instanceId, context)
// Opens modal with assignment details, submission info, and navigation

closeAssignmentDetail()
// Closes the modal

navigatePrevAssignment(context)
// Navigate to previous assignment in current tab

navigateNextAssignment(context)
// Navigate to next assignment in current tab
```

**Modal Structure:**
```html
<div id="assignmentDetailModal" class="assignment-detail-modal" role="dialog" aria-modal="true">
  <div class="assignment-detail-content">
    <div class="assignment-detail-header">
      <!-- Title, meta, close button -->
    </div>
    <div class="assignment-detail-body">
      <!-- Description, submission details, linked goals -->
    </div>
    <div class="assignment-detail-footer">
      <!-- Prev/Next navigation, actions -->
    </div>
  </div>
</div>
```

**Keyboard Navigation:**
- ESC: Close modal
- ←: Previous assignment
- →: Next assignment
- Tab: Trapped within modal

### Graded Assignments Table ✨ NEW

```html
<table class="graded-assignments-table">
  <thead>
    <tr>
      <th>Date</th>
      <th>Class</th>
      <th>Assignment</th>
      <th>Score</th>
    </tr>
  </thead>
  <tbody>
    <tr data-instance-id="abc123">
      <td>Nov 1, 2024</td>
      <td>English 101</td>
      <td><a href="#assignment/abc123" class="assignment-link">Essay Analysis</a></td>
      <td>85%</td>
    </tr>
  </tbody>
</table>
```

**Quarter Filter:**
```html
<select id="gradeQuarterFilter">
  <option value="">All Quarters</option>
  <option value="1">Q1 (Jan-Mar)</option>
  <option value="2">Q2 (Apr-Jun)</option>
  <option value="3">Q3 (Jul-Sep)</option>
  <option value="4">Q4 (Oct-Dec)</option>
</select>
```

### Toast Notification

```javascript
showToast({
  title: 'Missing Assignments',
  message: 'You have 3 missing assignments.',
  type: 'warning',
  link: {
    text: 'View Missing',
    action: () => { /* navigate */ }
  },
  duration: 8000
})
```

## Testing

### Automated Tests

Run test suite at `/site/student/test-portal-b.html`:

1. Feature Flags Test
2. Helper Functions Test
3. Grade Calculations Test
4. Status Precedence Test
5. Date/Time Formatting Test
6. Text Truncation Test

### Manual Testing Checklist

**Basic Features:**
- [ ] Login and verify missing assignment toast appears
- [ ] Check all 6 assignment status tabs populate correctly
- [ ] Verify status precedence (Missing > Late > In Progress > Upcoming)
- [ ] Test filters in All tab
- [ ] Confirm grades card shows overall and per-class averages
- [ ] Check trend indicator direction
- [ ] Test resubmission workflow end-to-end
- [ ] Verify resubmission idempotency (no double submit)
- [ ] Confirm top bar clock updates every minute
- [ ] Test Tool Kit link opens in new tab
- [ ] Verify goal text truncation and tooltips
- [ ] Test mobile layout at 375px and 768px
- [ ] Check keyboard navigation
- [ ] Verify ARIA labels with screen reader

**Assignment Detail Modal:** ✨ NEW
- [ ] Click assignment card to open detail modal
- [ ] Verify all details display correctly (title, class, due date, description)
- [ ] Check submission info shows (score, date, notes)
- [ ] Verify linked IEP goals display (if configured)
- [ ] Test Prev/Next navigation within current tab
- [ ] Confirm navigation wraps around (last → first, first → last)
- [ ] Test keyboard navigation: ESC closes, ← prev, → next
- [ ] Verify Tab key traps focus within modal
- [ ] Test resubmit button in modal (if applicable)
- [ ] Close modal and verify assignments remain visible

**Deep Linking:**
- [ ] Navigate to `/student/#assignment/{instance_id}`
- [ ] Verify modal opens automatically with correct assignment
- [ ] Test with valid and invalid instance IDs
- [ ] Verify back button behavior after deep link

**Quarterly Grades:** ✨ NEW
- [ ] Verify quarterly averages display (Q1-Q4)
- [ ] Check inline sparklines render for each quarter
- [ ] Confirm null values show as "—" for quarters with no data
- [ ] Test quarter filter dropdown in graded assignments table
- [ ] Filter by each quarter and verify table updates
- [ ] Click assignment link in table to open detail modal
- [ ] Verify CSV export includes quarterly summary
- [ ] Verify PDF export includes quarterly breakdown
- [ ] Test with submissions across multiple quarters
- [ ] Test with submissions in single quarter only

## Performance Considerations

- **Memoization:** Assignment groups computed once, cached
- **Lazy Loading:** Submissions fetched only when needed
- **Incremental Updates:** Only changed sections re-render
- **Debouncing:** Filter updates debounced to prevent excessive re-renders
- **Modal Reuse:** Single modal instance reused for all assignments
- **SVG Optimization:** Sparklines rendered with minimal DOM manipulation

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14+
- Chrome Android 90+

## Known Limitations

1. **Grades:** Simple average only, no weights
2. **Resubmissions:** Limited to one per assignment
3. **Filters:** Date filters work on due_at only
4. **Sparkline:** Shows max 5 most recent grades (overall), all grades per quarter
5. **Trend:** Requires min 2 graded submissions
6. **Quarters:** Fixed to calendar year (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec)
7. **PDF Export:** Uses browser print dialog, formatting may vary

## Future Enhancements

- Weighted grade calculations
- Multiple resubmission opportunities (configurable)
- Advanced filtering (by goal, by tag)
- Extended sparkline history
- Push notifications for alerts
- Offline support
- Configurable quarter definitions (alternative school calendars)
- Native PDF generation (without print dialog)
- Assignment completion tracking within detail modal
