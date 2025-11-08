# Portal B: Student Productivity & Clarity Enhancements

## Overview

Portal B delivers comprehensive enhancements to the Student Portal focused on improving productivity and clarity through better organization, actionable feedback, and mobile accessibility.

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

### 2. Grades Card

Simple, unweighted grade display showing:

- **Overall Average** - Mean of all graded assignments
- **Per-Class Averages** - Grouped by class
- **Trend Indicator** - Compares last 5 graded vs previous 5
  - ↗ Up (improvement > 3%)
  - → Flat (within ±3%)
  - ↘ Down (decline > 3%)
- **Mini Sparkline** - Visual representation of last 5 grades

### 3. One-Time Resubmission Workflow

- **Allowed:** One resubmission opportunity per assignment
- **Flow:**
  1. Graded assignment shows "Resubmit" button
  2. Confirmation modal explains one-revision limit
  3. On confirm, creates new submission linked to original
  4. Increments resubmission_count on instance
  5. Button replaced with "Revision used" text
- **Idempotency:** Double-click protection via disabled state

### 4. Top Status Bar

Fixed bar at top of portal showing:

- **Live Clock** - Auto-updates every minute, local timezone
  - Format: "Sat Nov 8, 3:10 PM"
- **Student Info** - Name and code from session
- **Actions:**
  - 🛠️ Tool Kit (opens https://reinischclassroom.com/language-arts/toolkit/ in new tab)
  - Help (shows support toast)
  - Logout

### 5. Smart Alerts & Toasts

**Login Alerts:**
- Missing assignments trigger prominent toast on login
- Late assignments show optional secondary toast
- Quick links scroll to relevant section

**Toast Features:**
- Auto-dismiss after 8 seconds
- Manual close button
- Action links for navigation
- Types: warning, info, success

### 6. IEP Goal Enhancements

- **Truncation:** Goal text limited to 140 characters
- **Tooltip:** Full text shown on hover/tap
- **Preserved Data:** Baseline, Current, Delta, Trend maintained

### 7. Mobile Viability

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

### 8. Accessibility

- **Keyboard Navigation** - All interactive elements keyboard accessible
- **ARIA Labels** - Status pills and actions properly labeled
- **Semantic HTML** - Proper heading hierarchy
- **Focus Management** - Clear focus indicators
- **Color Contrast** - WCAG AA compliant

## Feature Flags

All Portal B features are controlled by feature flags in `web/feature-flags.js`:

```javascript
portalAssignmentsStatus: true  // Assignment groupings and filters
portalGradesCard: true         // Grades display panel
portalResubmission: true       // One-time resubmission workflow
portalTopBar: true             // Live clock and status bar
```

## Database Schema

### New Fields in `assignment_instances`

```sql
resubmission_count int not null default 0
```

### New Fields in `submissions`

```sql
original_submission_id uuid references submissions(id)
submission_type text not null default 'initial' 
  check (submission_type in ('initial', 'resubmission'))
```

### RPC Functions

**`create_resubmission(p_instance_id, p_original_submission_id, p_answers)`**
- Creates new submission atomically
- Increments resubmission_count
- Returns new submission ID

**`get_latest_submission(p_instance_id)`**
- Returns most recent submission (initial or resubmission)
- Sorted by submitted_at desc

## Data Adapter Methods

### Portal B Extensions

```javascript
// List submissions filtered by student
await db.listSubmissions({ student_code: 'S001' })

// Get latest submission for an instance
await db.getLatestSubmission(instance_id)

// Create resubmission
await db.createResubmission({
  instance_id,
  original_submission_id,
  answers: {}
})
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

### Utilities

```javascript
truncateText(text, maxLength=140)  // With ellipsis
formatDateTime(date, 'full' | 'date' | 'time')  // Localized
countMissingAssignments(groups)
countLateAssignments(groups)
```

## UI Components

### Assignment Card

```html
<div class="assignment-card">
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

## Performance Considerations

- **Memoization:** Assignment groups computed once, cached
- **Lazy Loading:** Submissions fetched only when needed
- **Incremental Updates:** Only changed sections re-render
- **Debouncing:** Filter updates debounced to prevent excessive re-renders

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
4. **Sparkline:** Shows max 5 most recent grades
5. **Trend:** Requires min 2 graded submissions

## Future Enhancements

- Weighted grade calculations
- Multiple resubmission opportunities (configurable)
- Advanced filtering (by goal, by tag)
- Extended sparkline history
- Push notifications for alerts
- Offline support
