# HTML Assignment postMessage Contract

## Overview

HTML assignments run inside a sandboxed `<iframe>` in the student portal.  To
communicate per-question answer data back to the platform the iframe must send a
`postMessage` to its parent window using the `rc-assignment-submit` contract
described here.

Once the platform receives a valid message it:

1. Forwards the answers to `/.netlify/functions/student-submit-answer`
2. Creates / updates the `submissions` record with `score_auto` and `score_total`
3. Upserts `submission_answers` rows (auto-scored for MCQ / boolean / multi types)
4. The Review Queue (`tc-review.js`) and Evidence Reports (`tc-reporting.js`) then
   display per-item breakdowns automatically

---

## Message Format

```js
window.parent.postMessage(
  {
    type:        'rc-assignment-submit',   // REQUIRED – must be this exact string
    instance_id: '<uuid>',                 // OPTIONAL – if omitted the platform uses
                                           // its own instance context
    answers: {                             // REQUIRED – at least one entry
      Q1: 'B',                             // itemRef → student answer (string)
      Q2: 'true',
      Q3: 'The answer is 42',
    },
    scores: {                              // OPTIONAL – informational only
      correct: 8,                          //   the server always re-computes the
      total:   10,                         //   authoritative score from assignment_items
    },
  },
  '*'                                      // targetOrigin – '*' is acceptable here
                                           // because the bridge validates instance_id
);
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `string` | ✅ | Must be `'rc-assignment-submit'` |
| `instance_id` | `string` (UUID) | ⬜ | When supplied, must match the portal's active instance |
| `answers` | `object` | ✅ | At least one `{ itemRef: value }` entry |
| `scores` | `object` | ⬜ | `{ correct, total }` – server ignores this for scoring |

---

## `data-qref` Convention

When authoring an HTML assignment, tag every question container with a
`data-qref` attribute whose value matches the `ref` column in the assignment's
mapping file.  This is how `detectQuestionsFromHTML()` in
`web/assignment-manifest.js` discovers questions during ZIP upload.

```html
<!-- MCQ question -->
<div data-qref="Q1" data-answer-type="mcq">
  <p>What is the capital of France?</p>
  <label><input type="radio" name="Q1" value="A"> London</label>
  <label><input type="radio" name="Q1" value="B"> Paris</label>
  <label><input type="radio" name="Q1" value="C"> Berlin</label>
</div>

<!-- True / false question -->
<div data-qref="Q2" data-answer-type="boolean">
  <p>The Earth orbits the Sun. True or False?</p>
  <label><input type="radio" name="Q2" value="true"> True</label>
  <label><input type="radio" name="Q2" value="false"> False</label>
</div>
```

---

## Mapping File Requirement

When the `assignmentMappingV1` feature flag is enabled, all HTML assignments
(**single HTML file** and **external URL** source types) require a mapping file
to be uploaded in the teacher UI.  Attempting to create an assignment without
one will show the error:

> "HTML assignments require a mapping file for reporting"

ZIP packages must include a valid `assignment.json` manifest (this was already
enforced).

### TXT mapping format

Each data row is pipe-delimited.  The first field (`ref`) is the question
reference that must match the `item_ref` stored in `assignment_items` and the
keys used in the `answers` object sent via postMessage.

```
#ref|points|correct|dese_codes|goal_codes|notes
Q1|1|B|MA.8.EE.1|MATH.1|Capital of France
Q2|1|true|SCI.5.1|SCI.1|Earth orbits Sun
Q3|2|-|ELA.6.1|ELA.2|Short written response
```

### JSON manifest format

```json
{
  "title": "Sample Quiz",
  "version": "1.0",
  "items": [
    { "ref": "Q1", "answer_type": "mcq",       "points": 1, "correct": "B",    "dese_codes": ["MA.8.EE.1"], "goal_codes": ["MATH.1"] },
    { "ref": "Q2", "answer_type": "boolean",   "points": 1, "correct": "true", "dese_codes": ["SCI.5.1"],   "goal_codes": ["SCI.1"]  },
    { "ref": "Q3", "answer_type": "constructed","points": 2, "correct": null,   "dese_codes": ["ELA.6.1"],   "goal_codes": ["ELA.2"]  }
  ]
}
```

---

## Example HTML Assignment Snippet

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sample Quiz</title></head>
<body>

<form id="quizForm">
  <div data-qref="Q1">
    <p>1. What is the capital of France?</p>
    <label><input type="radio" name="Q1" value="A"> London</label>
    <label><input type="radio" name="Q1" value="B"> Paris</label>
    <label><input type="radio" name="Q1" value="C"> Berlin</label>
  </div>

  <div data-qref="Q2">
    <p>2. The Earth orbits the Sun. True or False?</p>
    <label><input type="radio" name="Q2" value="true"> True</label>
    <label><input type="radio" name="Q2" value="false"> False</label>
  </div>

  <button type="submit">Submit</button>
</form>

<script>
  document.getElementById('quizForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const answers = {};
    const formData = new FormData(e.target);
    for (const [key, value] of formData.entries()) {
      answers[key] = value;
    }

    // Send answers back to the student portal via postMessage
    window.parent.postMessage(
      { type: 'rc-assignment-submit', answers },
      '*'
    );
  });
</script>

</body>
</html>
```

---

## Data Flow

```
HTML iframe
  └─ postMessage({ type:'rc-assignment-submit', answers:{Q1:'B',...} })
       │
       ▼
html-assignment-bridge.js (student-portal-init.js)
  └─ validates payload
  └─ POST /.netlify/functions/student-submit-answer
       │  { instance_id, student_code, answers, submit:true }
       ▼
student-submit-answer.js (Netlify function)
  └─ verifies student / instance ownership
  └─ upserts assignment_instances.settings + status='Submitted'
  └─ creates/updates submissions record
  └─ upserts submission_answers (auto-scores mcq/boolean/multi)
  └─ updates submissions.score_auto + score_total
       │
       ▼
tc-review.js     – shows per-item breakdown in Review Queue
tc-reporting.js  – includes item-level detail in Evidence Reports
tc-gradebook.js  – reflects score_total in Gradebook
```

---

## Related Files

| File | Role |
|---|---|
| `site/web/html-assignment-bridge.js` | postMessage listener & forwarder |
| `site/web/student-portal-init.js` | Initialises bridge in `renderHtmlAssignmentPanel` |
| `netlify/functions/student-submit-answer.js` | Server-side submission handler |
| `web/assignment-scoring.js` | `scoreItem()` / `scoreSubmission()` helpers |
| `web/assignment-mapping-parsers.js` | `parseTxtMapping()` / `parseJsonManifest()` |
| `web/assignment-manifest.js` | `detectQuestionsFromHTML()` using `data-qref` |
| `site/web/tc-review.js` | Review Queue reads `submission_answers` |
| `site/web/tc-reporting.js` | Evidence Reports use `buildRichAnswerDetailHtml()` |
| `supabase/schema/002_phase_a_assignments.sql` | DB schema for assignments / submissions |
