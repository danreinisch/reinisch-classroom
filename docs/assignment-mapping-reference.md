# Assignment Mapping Phase 1 - Quick Reference

## Feature Flag

```javascript
// Enable the feature
setFeatureFlag('assignmentMappingV1', true);

// Check if enabled
getFeatureFlag('assignmentMappingV1');
```

## Key Functions

### Parsing

```javascript
import { parseTxtMapping, parseJsonManifest, validateMapping } from '../web/assignment-mapping-parsers.js';

// Parse TXT file
const txtResult = parseTxtMapping(txtContent);
// Returns: { format, items, errors, valid }

// Parse JSON file
const jsonResult = parseJsonManifest(jsonContent);
// Returns: { format, manifest, items, errors, valid, title, version }

// Validate mapping
const validation = validateMapping(items);
// Returns: { valid, warnings, stats }
```

### Scoring

```javascript
import { scoreSubmission, computeGoalRollups, computeStandardRollups } from '../web/assignment-scoring.js';

// Score entire submission
const result = scoreSubmission(items, studentAnswers);
// Returns: { results, summary }

// Compute goal rollups
const goalRollups = computeGoalRollups(items, results);
// Returns: Array of { goal_code, percent_correct, total_earned, total_possible, item_count }

// Compute standard rollups
const standardRollups = computeStandardRollups(items, results);
// Returns: Array of { dese_code, percent_correct, total_earned, total_possible, item_count }
```

### Database Operations

```javascript
import { 
  insertAssignmentItems, 
  getAssignmentItems,
  saveSubmissionAnswers,
  insertGoalProgress,
  checkVersionLock,
  lockAssignmentVersion
} from '../web/assignment-mapping-db.js';

// Insert items and mappings
const result = await insertAssignmentItems(supabase, assignmentId, items);
// Returns: { success, items, mappings, item_count, mapping_count }

// Get items with mappings
const items = await getAssignmentItems(supabase, assignmentId);
// Returns: Array of items with merged mapping data

// Save submission answers
const saveResult = await saveSubmissionAnswers(
  supabase, 
  submissionId, 
  scoredResults, 
  summary, 
  goalRollups, 
  standardRollups
);
// Returns: { success, answer_count, percent_correct }

// Insert goal progress
const progressResult = await insertGoalProgress(
  supabase,
  submissionId,
  studentId,
  instanceId,
  goalRollups
);
// Returns: { success, inserted_count, skipped_count }

// Check version lock
const lockStatus = await checkVersionLock(supabase, assignmentId);
// Returns: { is_locked, first_submission_at }

// Lock version
const lockResult = await lockAssignmentVersion(supabase, assignmentId);
// Returns: { success }
```

## Data Structures

### TXT Item Format

```txt
#question_ref|points|correct|dese_codes|goal_codes|notes
Q1|1|A|MA.8.EE.1;MA.8.EE.2|MATH.1;MATH.2|Sample question
```

### JSON Item Format

```json
{
  "ref": "Q1",
  "answer_type": "mcq",
  "points": 1,
  "correct": "A",
  "dese_codes": ["MA.8.EE.1"],
  "goal_codes": ["MATH.1"],
  "scoring": {
    "keywords": ["example", "test"],
    "min_keywords": 2
  },
  "notes": "Optional description"
}
```

### Parsed Item Structure

```javascript
{
  ref: "Q1",
  answer_type: "mcq",  // mcq | multi | boolean | constructed
  points: 1,
  correct: "A",        // String, Array, Boolean, or null
  dese_codes: ["MA.8.EE.1"],
  goal_codes: ["MATH.1"],
  scoring: {},         // Optional scoring config
  notes: ""
}
```

### Scoring Result Structure

```javascript
{
  results: [
    {
      item_ref: "Q1",
      is_correct: true,
      earned_points: 1,
      max_points: 1,
      detail: { type: "mcq" },
      raw_answer: "A"
    }
  ],
  summary: {
    total_items: 10,
    correct_count: 8,
    total_earned: 15.5,
    total_possible: 20,
    percent_correct: 78,
    elapsed_ms: 12.3
  }
}
```

## Database Schema

### assignment_items

```sql
CREATE TABLE assignment_items (
  id uuid PRIMARY KEY,
  assignment_id bigint REFERENCES assignments(id),
  item_ref text NOT NULL,
  answer_type text CHECK (answer_type IN ('mcq', 'multi', 'boolean', 'constructed')),
  points numeric,
  meta jsonb,  -- { correct, scoring, notes }
  created_at timestamptz
);
```

### assignment_item_mappings

```sql
CREATE TABLE assignment_item_mappings (
  id uuid PRIMARY KEY,
  item_id uuid REFERENCES assignment_items(id),
  dese_codes text[],
  goal_codes text[],
  weight numeric DEFAULT 1.0,
  created_at timestamptz
);
```

### submission_answers

```sql
CREATE TABLE submission_answers (
  id uuid PRIMARY KEY,
  submission_id uuid REFERENCES submissions(id),
  item_id uuid REFERENCES assignment_items(id),
  raw_answer jsonb,
  is_correct boolean,
  earned_points numeric,
  max_points numeric,
  created_at timestamptz
);
```

### Views

```sql
-- Goal rollups
CREATE VIEW assignment_goal_rollups AS
SELECT 
  submission_id,
  unnest(goal_codes) as goal_code,
  round((sum(earned_points) / nullif(sum(max_points), 0) * 100)::numeric, 1) as percent_correct,
  sum(earned_points) as total_earned,
  sum(max_points) as total_possible,
  count(*) as item_count
FROM submission_answers sa
JOIN assignment_items ai ON ai.id = sa.item_id
JOIN assignment_item_mappings aim ON aim.item_id = ai.id
WHERE cardinality(goal_codes) > 0
GROUP BY submission_id, goal_code;

-- Standard rollups (similar structure for dese_codes)
```

## Console Logging

All Phase 1 functions use prefixed console logging:

- `[assignment-mapping]` - Parsing, validation, database operations
- `[assignment-scoring]` - Scoring engine operations
- `[assignment-rollup]` - Rollup computation and progress tracking

## Error Handling

All async functions return a result object with success/error:

```javascript
{
  success: true,
  // ... additional data
}

// Or on error:
{
  success: false,
  error: "Error message"
}
```

## Performance Targets

- **Parsing**: 300 items in < 500ms
- **Scoring**: 300 items in < 300ms
- **Database insert**: 300 items in < 3s
- **Query with rollups**: < 100ms

## UI Components

### Assignment Type Selector

```html
<select id="aType">
  <option value="html">HTML Package</option>
  <option value="txt_quiz">TXT Quick Quiz</option>
  <option value="google_form" disabled>Google Form (Coming Soon)</option>
</select>
```

### Mapping Preview Table

```html
<table id="mappingPreviewTable">
  <thead>
    <tr>
      <th>Ref</th>
      <th>Type</th>
      <th>Points</th>
      <th>Correct</th>
      <th>DESE Codes</th>
      <th>Goal Codes</th>
      <th>Weight</th>
    </tr>
  </thead>
  <tbody id="mappingPreviewBody">
    <!-- Populated by displayMappingPreview() -->
  </tbody>
</table>
```

### Submission Detail Modal

```javascript
// Show submission detail
showSubmissionDetail(submissionId);

// Modal displays:
// - Overall score
// - Per-question results
// - Goal rollups
// - DESE standard rollups
```

## Integration Points

### Assignment Creation Flow

1. User uploads mapping file
2. `handleTxtMappingUpload()` or `handleHtmlMappingUpload()` parses file
3. `displayMappingPreview()` shows preview
4. User clicks "Create Assignment"
5. `handleCreateAssignment()` creates assignment
6. `insertAssignmentItems()` saves mapping to database

### Submission Processing Flow

1. Student submits answers
2. `processSubmissionWithMapping(instanceId, studentAnswers)` called
3. Fetches items and mappings from database
4. `scoreSubmission()` scores all items
5. `computeGoalRollups()` and `computeStandardRollups()` compute aggregates
6. `saveSubmissionAnswers()` saves to database
7. `insertGoalProgress()` creates progress entries
8. `lockAssignmentVersion()` locks assignment on first submission

## Migration

Run the migration before using Phase 1 features:

```bash
# Supabase CLI
supabase db push

# Or manually in Supabase dashboard SQL Editor:
# Run: supabase/migrations/20251108_assignment_mapping_phase_1.sql
```

## Rollback

To disable the feature:

```javascript
setFeatureFlag('assignmentMappingV1', false);
```

To remove data (CAUTION - destructive):

```sql
-- Delete all mapping data (cascade will handle child tables)
DELETE FROM assignment_items WHERE assignment_id IN (
  SELECT id FROM assignments WHERE meta->>'source' = 'txt_quiz'
);

-- Drop views
DROP VIEW IF EXISTS assignment_goal_rollups;
DROP VIEW IF EXISTS assignment_standard_rollups;

-- Drop tables (only if completely removing feature)
DROP TABLE IF EXISTS submission_answers CASCADE;
DROP TABLE IF EXISTS assignment_item_mappings CASCADE;
DROP TABLE IF EXISTS assignment_items CASCADE;
```
