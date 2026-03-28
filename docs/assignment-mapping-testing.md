# Assignment Mapping Phase 1 - Testing Guide

## Prerequisites

1. **Enable Feature Flag**
   ```javascript
   // Open browser console on teacher-center-unified.html
   setFeatureFlag('assignmentMappingV1', true)
   ```

2. **Supabase Connection**
   - Ensure Supabase is configured in Settings
   - Run the migration: `supabase/migrations/20251108_assignment_mapping_phase_1.sql`

## Test Scenarios

### Scenario 1: TXT Mapping Import (20 items)

**File:** `docs/examples/mapping-example-20items.txt`

**Steps:**
1. Navigate to Assignments tab
2. Select "TXT Quick Quiz" from Type dropdown
3. Choose "TXT (pipe-delimited)" as mapping format
4. Upload `mapping-example-20items.txt`
5. Verify:
   - ✓ Mapping preview table appears
   - ✓ Shows 20 items
   - ✓ Stats show: "With DESE: X, With Goals: Y"
   - ✓ No validation errors
   - ✓ Different answer types shown (mcq, multi, boolean, constructed)

**Expected Validation:**
- Total: 20 items
- Types: mcq, multi, boolean, constructed
- All items have at least one DESE or goal code (except Q19, Q20)

### Scenario 2: JSON Manifest Import

**File:** `docs/examples/mapping-example-science.json`

**Steps:**
1. Select "TXT Quick Quiz" type
2. Choose "JSON Manifest" format
3. Upload `mapping-example-science.json`
4. Verify:
   - ✓ Preview shows 10 items
   - ✓ Title: "Science Lab: Chemical Reactions"
   - ✓ Constructed responses have scoring config with keywords
   - ✓ Multi-select answers shown as arrays

### Scenario 3: HTML Package with Manifest

**Steps:**
1. Create a test ZIP file with:
   ```
   test-assignment.zip
   ├── assignment_manifest.json  (copy from mapping-example-science.json)
   └── index.html (simple HTML file)
   ```

2. Select "HTML Package" type
3. Upload ZIP file
4. Verify:
   - ✓ Manifest detected message appears
   - ✓ Mapping preview populated from manifest
   - ✓ Summary shows item count and title

### Scenario 4: Create Assignment with Mapping

**Steps:**
1. Fill in assignment title: "Test Math Assessment"
2. Upload mapping file (use 20-item example)
3. Verify mapping preview is valid
4. Click "Create Assignment"
5. Verify:
   - ✓ Success notification
   - ✓ Console shows: `[assignment-mapping] Saved X items with Y mappings`
   - ✓ Assignment appears in assignment list

**Database Verification:**
```sql
-- Check assignment_items were created
SELECT count(*) FROM assignment_items WHERE assignment_id = <new_assignment_id>;
-- Should return 20

-- Check mappings
SELECT * FROM assignment_item_mappings aim
JOIN assignment_items ai ON ai.id = aim.item_id
WHERE ai.assignment_id = <new_assignment_id>
LIMIT 5;
```

### Scenario 5: Stress Test (300 items)

**File:** `docs/examples/mapping-stress-300items.txt`

**Steps:**
1. Upload `mapping-stress-300items.txt`
2. Verify:
   - ✓ Preview shows 300 items
   - ✓ No performance issues loading preview
   - ✓ Stats show breakdown by type
3. Create assignment
4. Verify:
   - ✓ Assignment created successfully
   - ✓ Console shows parsing time
   - ✓ No timeout or errors

**Performance Check:**
- Parsing should complete in < 1 second
- Database insert should complete in < 3 seconds
- Preview rendering should be smooth

### Scenario 6: Submission Scoring

**Prerequisites:**
- Created assignment with mapping (use 20-item example)
- Issued assignment to a student

**Steps:**
1. Create test student answers object:
   ```javascript
   const testAnswers = {
     'Q1': 'A',   // Correct
     'Q2': 'B',   // Correct
     'Q3': 'X',   // Wrong
     'Q4': 'Z',   // Wrong
     'Q5': ['A', 'C'],  // Multi-select
     'Q6': ['B', 'D'],  // Multi-select
     'Q7': true,  // Boolean
     'Q8': false, // Boolean
     // ... add more as needed
   };
   ```

2. Call scoring function in console:
   ```javascript
   // Get the instance ID from the instances table
   const instanceId = '<your-instance-uuid>';
   
   // Process submission
   const result = await processSubmissionWithMapping(instanceId, testAnswers);
   console.log('Submission result:', result);
   ```

3. Verify:
   - ✓ Submission created successfully
   - ✓ Console shows: `[assignment-scoring] Scored N items in Xms`
   - ✓ Performance: < 300ms for 300 items (proportional for smaller sets)
   - ✓ Goal rollups computed
   - ✓ Standard rollups computed

**Database Verification:**
```sql
-- Check submission_answers
SELECT count(*) FROM submission_answers WHERE submission_id = <submission_id>;

-- Check goal_progress entries
SELECT * FROM goal_progress 
WHERE assignment_instance_id = <instance_id> 
ORDER BY created_at DESC;

-- Check rollup views
SELECT * FROM assignment_goal_rollups WHERE submission_id = <submission_id>;
SELECT * FROM assignment_standard_rollups WHERE submission_id = <submission_id>;
```

### Scenario 7: Audit View

**Steps:**
1. After creating a submission (from Scenario 6)
2. Call audit view in console:
   ```javascript
   showSubmissionDetail('<submission_id>');
   ```
3. Verify modal displays:
   - ✓ Overall score percentage
   - ✓ Per-question results table with checkmarks/x's
   - ✓ Earned vs max points per item
   - ✓ Goal rollups table
   - ✓ DESE standard rollups table

### Scenario 8: Version Lock

**Steps:**
1. Create assignment with mapping
2. Issue to student
3. Create submission (Scenario 6)
4. Try to edit the assignment
5. Verify:
   - ✓ Warning appears: "Assignment Locked"
   - ✓ Guidance to create new version
   - ✓ Mapping cannot be changed

**Database Verification:**
```sql
-- Check version lock status
SELECT version_locked, first_submission_at 
FROM assignments 
WHERE id = <assignment_id>;
-- Should show version_locked = true
```

### Scenario 9: Validation Errors

**Test Invalid TXT File:**
```txt
# Missing required fields
Q1|1|A
Q2|invalid|B|MA.8.EE.1|MATH.1|Test
Q3|1|A|MA.8.EE.1|MATH.1|Duplicate ref test
Q3|1|B|MA.8.EE.2|MATH.2|Duplicate ref (should error)
```

**Expected:**
- ✓ Error messages displayed in red box
- ✓ Specific line numbers and issues shown
- ✓ Mapping preview not shown
- ✓ Create button disabled or shows warning

### Scenario 10: Scoring Validation

**Test Different Answer Types:**

**MCQ (case-insensitive):**
```javascript
// Correct answer: 'A'
scoreItem({answer_type: 'mcq', correct: 'A', points: 1}, 'a')
// Should return: is_correct = true
```

**Multi-select (order-agnostic):**
```javascript
// Correct: ['A', 'B', 'C']
scoreItem({answer_type: 'multi', correct: ['A', 'B', 'C'], points: 2}, ['C', 'B', 'A'])
// Should return: is_correct = true

scoreItem({answer_type: 'multi', correct: ['A', 'B', 'C'], points: 2}, ['A', 'B'])
// Should return: is_correct = false (partial credit based on correct_hits ratio)
```

**Boolean:**
```javascript
// Correct: true
scoreItem({answer_type: 'boolean', correct: true, points: 1}, 'true')
// Should return: is_correct = true

scoreItem({answer_type: 'boolean', correct: true, points: 1}, '1')
// Should return: is_correct = true
```

**Constructed response:**
```javascript
const item = {
  answer_type: 'constructed',
  points: 3,
  scoring: {
    keywords: ['slope', 'intercept', 'linear'],
    min_keywords: 2
  }
};

scoreItem(item, 'The slope determines how steep the line is and the intercept is where it crosses.')
// Should return: is_correct = true, earned_points = 2.00 (2/3 keywords × 3pts)

scoreItem(item, 'The slope is steep.')
// Should return: is_correct = false, earned_points = 1.00 (1/3 keywords — partial credit)

scoreItem(item, 'The graph goes up.')
// Should return: is_correct = false, earned_points = 0.00 (0 keywords found)
```

## Performance Benchmarks

### Parsing Performance
- 20 items: < 50ms
- 100 items: < 200ms
- 300 items: < 500ms

### Scoring Performance
- 20 items: < 20ms
- 100 items: < 100ms
- 300 items: < 300ms (target)

### Database Operations
- Insert 20 items: < 500ms
- Insert 300 items: < 3s
- Query with rollups: < 100ms

## Common Issues and Troubleshooting

### Issue: "Feature flag disabled"
**Solution:** Run `setFeatureFlag('assignmentMappingV1', true)` in console

### Issue: Mapping preview not showing
**Solution:** 
- Check browser console for parser errors
- Verify file format matches selected type (TXT vs JSON)
- Check for validation errors

### Issue: Database insert fails
**Solution:**
- Verify Supabase connection
- Check that migration was run
- Verify RLS policies allow inserts

### Issue: Scoring returns 0 for all questions
**Solution:**
- Verify item refs match between mapping and student answers
- Check that correct answers are properly formatted
- Review console logs for scoring details

### Issue: Progress entries not created
**Solution:**
- Verify student has matching goals with codes
- Check goal_codes in mapping match goal.code in database
- Review console logs for goal lookup failures

## Success Criteria

All scenarios should pass with:
- ✓ No JavaScript errors in console
- ✓ All database operations complete successfully
- ✓ Performance within target ranges
- ✓ UI feedback is clear and accurate
- ✓ Data integrity maintained (no orphaned records)
- ✓ Feature flag properly gates functionality
- ✓ Version lock prevents unwanted edits
- ✓ Console logging provides useful diagnostics
