# AI-Assisted Grading Suggestions

## Overview

The Review page has five AI-assisted features that work together to streamline grading and evidence review:

1. **✨ Suggest Grade** — Per-item academic AI scoring for constructed-response questions
2. **✨ Suggest IEP Evidence** — Per-item child-objective evidence suggestions for already-mapped components
3. **✨ Suggest Feedback** — AI-generated holistic assignment feedback in the Grade section
4. **🤖 Auto-Grade All** — Batch academic AI grading for all "Needs Review" submissions in one click
5. **✅ Finalize All Reviewed** — Batch finalize for all submissions in the "Reviewed" tab

**Key design principle:** AI assistance never replaces teacher judgment. Existing academic
workflows may persist academic suggestions as described below, but **Suggest IEP Evidence is
strictly non-mutating**: it first displays suggestions, then requires **Apply Suggestions** to copy
them into the existing Review controls, and objective evidence is not persisted until the teacher
uses the normal item **Save** action.

### Two-Layer Feedback Model

The Review page supports two separate feedback layers:

1. **Per-item Teacher Note** — on each constructed-response card, populated by the AI's
   `suggested_note`. This note is focused specifically on the student's written response to that
   question: what was demonstrated, what could be improved, and any specific guidance. It is
   3–4 sentences and does not address the overall assignment.

2. **Overall Assignment Feedback** — in the Grade section at the bottom of the page. The
   **✨ Suggest Feedback** button fills this with a holistic comment that covers the full assignment
   (score summary, trends across items, and specific guidance). The teacher reviews and edits before
   saving.

The `✨ Suggest Grade` button is only shown for **constructed-response** items (fill-in-blank /
written response). It does not appear on MCQ, boolean, or multi-select items, which are scored
automatically.

---

## Recommended Workflow

```
Submissions arrive in "Needs Review" tab
        ↓
Option A — Manual review:
  Open each submission → score written responses → ✨ Suggest Feedback → Save Grade → Finalize
        ↓
Option B — AI-batch workflow:
  Click "🤖 Auto-Grade All" (batch action bar next to "Needs Review" tab)
        ↓
  AI scores all written responses + generates overall feedback
  Submissions move to "Reviewed" tab
        ↓
  Teacher scans "Reviewed" tab, edits any grades/feedback as needed
        ↓
  Click "✅ Finalize All Reviewed" to finalize all at once
```



---

## Setup

1. Add `OPENAI_API_KEY` to the Netlify environment variables for the site.
2. No other configuration is required. The **✨ Suggest Grade** button always appears on
   constructed-response cards in the Review page. When the key is missing, clicking the button
   returns a `503` with the message "AI suggestions not configured — ask admin to add OPENAI_API_KEY".

---

## How It Works

### ✨ Suggest Grade (per-item)

```
Teacher clicks "✨ Suggest Grade" on a constructed-response card
        ↓
tc-review.js collects:
  • student_response    — the student's written answer text
  • rubric_tiers        — generated from generateRubricTiers(max_points)
  • max_points          — item point value
  • item_label          — question reference label (e.g. "Q6")
  • goal_codes          — IEP goal codes mapped to this item (if any)
  • goal_descriptions   — resolved from Supabase goals cache (ensureGoalsLoaded)
        ↓
POST /.netlify/functions/teacher-ai-suggest
        ↓
Backend builds IEP-aware prompt → calls gpt-4o-mini → parses JSON response
        ↓
Returns { suggested_score, suggested_note, rationale }
        ↓
tc-review.js populates Score input + Teacher Note textarea.
The current academic Suggest Grade workflow may auto-save the suggested academic score through
teacher-review-save. The teacher can still edit and re-save that academic result. This behavior is
separate from child-objective evidence and never writes objective-component evidence.
```

### ✨ Suggest IEP Evidence (per-item objective evidence)

This button appears only inside the **IEP Objective Evidence** section of a written-response item that already has authoritative child-objective mappings.

```
Teacher clicks "✨ Suggest IEP Evidence"
        ↓
Browser sends ONLY:
  • submissionId
  • itemId
        ↓
POST /.netlify/functions/teacher-ai-suggest-objective-evidence
        ↓
Server independently verifies teacher ownership and resolves:
  • submission → assignment instance → student
  • teacher-owned class + active enrollment
  • exact assignment item
  • authoritative assignment_item_objectives mappings
  • official goal_objectives wording / criteria / measurement context
        ↓
Server sends scrubbed response text + mapped objective context to OpenAI
        ↓
Review displays one validated suggestion per component_order
        ↓
Teacher clicks "Apply Suggestions"
        ↓
Existing objective score / Not Scorable controls are populated locally
        ↓
Teacher reviews or edits those controls
        ↓
Teacher clicks the existing item Save button
        ↓
Only then can objective evidence or disposition be persisted
```

Safeguards:

- AI cannot create or infer objective mappings.
- The browser cannot supply objective UUID, max, label, wording, or criteria.
- A measured `0` is legitimate scored evidence; **Not Scorable is never converted to 0**.
- Conflicting official criterion fields remain separate; AI does not choose which criterion controls.
- **Suggest IEP Evidence and Apply Suggestions perform no database write.**
- **Auto-Grade All never invokes objective-evidence AI.**

### ✨ Suggest Feedback (overall assignment)

A **✨ Suggest Feedback** button appears next to the "Feedback:" label in the Grade section for
each expanded submission. It generates a holistic comment covering the full assignment — score
summary, observations across items, and specific guidance for the student.

```
Teacher clicks "✨ Suggest Feedback" in the Grade section
        ↓
tc-review.js collects:
  • assignment_title  — from instance settings
  • total_score       — sum of earned points across all items
  • total_possible    — sum of max points across all items
  • total_percent     — percentage score (0–100)
  • item_summaries    — array of { label, type, earned, max, teacher_note } per item
  • student_code      — opaque student identifier (no PII)
        ↓
POST /.netlify/functions/teacher-ai-suggest-feedback
        ↓
Backend builds prompt → calls gpt-4o-mini → returns holistic feedback
        ↓
Returns { suggested_feedback }
        ↓
tc-review.js populates the Feedback textarea
  (teacher edits and saves manually — no auto-save)
```

### 🤖 Auto-Grade All (batch)

The **🤖 Auto-Grade All** button appears in the batch action bar next to the "Needs Review" tab.
It processes every submission with `review_status` of `pending` or `in_progress` that has unscored
constructed-response items.

```
Teacher clicks "🤖 Auto-Grade All" → confirms prompt
        ↓
For each qualifying submission:
  Step 1: For each unscored constructed item:
    POST /.netlify/functions/teacher-ai-suggest
      → score is saved via POST /.netlify/functions/teacher-review-save (action: save_score)
      → answer cache is updated with suggested score + teacher note
  Step 2: Build item_summaries from updated answers
  Step 3: POST /.netlify/functions/teacher-ai-suggest-feedback
      → holistic feedback generated
  Step 4: POST /.netlify/functions/teacher-review-save (action: save_grade)
      → saves scoreAuto, scoreManual, scoreTotal, feedback; sets review_status → "reviewed"
        ↓
All processed submissions move to the "Reviewed" tab
Progress toast updates as each submission completes
```

### ✅ Finalize All Reviewed (batch)

The **✅ Finalize All Reviewed** button appears in the batch action bar when the "Reviewed" tab
is selected (it is hidden on other tabs). It locks grades and triggers IEP goal progress updates
for every submission with `review_status === 'reviewed'`.

```
Teacher clicks "✅ Finalize All Reviewed" → confirms prompt
        ↓
For each "reviewed" submission:
  Compute scoreAuto, scoreManual, scoreTotal from cached answers
  POST /.netlify/functions/teacher-review-save (action: finalize)
    → sets review_status → "finalized", saves scores
  triggerGoalProgressUpdates() → writes goal data points to Supabase
  POST to archive endpoint for DESE compliance (non-fatal)
        ↓
All processed submissions move to the "Finalized" tab
```

### IEP Goal Context

When an item is mapped to one or more IEP goals, the goal codes and their descriptions are included
in the prompt. The AI is instructed to:

- Prioritize evidence of understanding over grammar and mechanics.
- Give credit for responses that demonstrate progress toward the IEP goal, even if writing quality
  is imperfect.

Goal descriptions are resolved from the Supabase `goals` table via `ensureGoalsLoaded()`, which
caches results per student to avoid redundant network requests. If goal descriptions cannot be
loaded (e.g., Supabase is unreachable), the AI suggest call still proceeds using only the rubric —
goals enrichment degrades gracefully.

### Rubric Tier Generation

`generateRubricTiers(maxPoints)` in `tc-review.js` produces a set of tier objects appropriate for
the item's point value:

| max_points | Tiers generated |
|---|---|
| 5 | Exemplary (5) · Proficient (4) · Developing (3) · Beginning (2) · Minimal (1) · No response (0) |
| 3 | Complete (3) · Partial (2) · Minimal (1) · No response (0) |
| any N | Full credit (N) · N−1/N (partial) · … · No response (0) |

---

## Privacy & FERPA Compliance

Only the following data is sent to the OpenAI API:

**Suggest Grade (per-item):**

| Data sent | Example |
|---|---|
| Student's written response text | `"The slope of the line is 2 because…"` |
| Rubric tier definitions | `"5 — Exemplary: Thorough, evidence-based"` |
| Item label | `"Q6"` |
| IEP goal descriptions | `"Math Computation — Student will identify slope and intercept"` |

**Suggest IEP Evidence (per-item):**

| Data sent | Example |
|---|---|
| Scrubbed student response text | `"The character changes because…"` |
| Item label / question text | `"Q6 — Explain the character's decision"` |
| Pseudonymous official objective code | `S###.CG#.O#` |
| Official objective wording | `"Provide three supporting details"` |
| Separate objective/mastery/parent criterion fields | Preserved separately |
| Component label and evidence scale | `"Supporting Details", 0–3` |

The endpoint does **not** send submission UUIDs, assignment-instance UUIDs, student UUIDs,
objective UUIDs, class information, or teacher identity to OpenAI.

**Suggest Feedback / Auto-Grade (overall):**

| Data sent | Example |
|---|---|
| Assignment title | `"Week 4 Reading Comprehension"` |
| Score summary | `total_score: 18, total_possible: 25, total_percent: 72` |
| Per-item summaries | `{ label: "Q6", type: "constructed", earned: 2, max: 5 }` |
| Teacher notes (if any) | `"Partial credit — addresses topic but lacks evidence"` |
| Opaque student code | `"STU_ABCD"` |

**What is never sent:**

- Student name, student ID, or any other personally identifiable information (PII)
- Teacher name or school identifiers
- Class rosters or enrollment data

Goal descriptions are educational descriptions of learning targets (e.g., "Student will identify
slope and intercept in linear equations"). They are not student-identifying.

OpenAI's API data usage policy applies. By default, API data is **not** used to train OpenAI
models. See [OpenAI API data privacy](https://openai.com/policies/api-data-usage-policies) for
details.

---

## Cost

| Metric | Value |
|---|---|
| Model | `gpt-4o-mini` |
| Temperature | `0.3` (for consistent scoring) |
| Avg input tokens / request (suggest grade) | ~400–600 |
| Avg output tokens / request (suggest grade) | ~200–350 |
| Avg input tokens / request (suggest feedback) | ~600–900 |
| Avg output tokens / request (suggest feedback) | ~150–250 |
| Cost per suggestion | ~$0.0002–$0.0004 |
| Auto-Grade All: 16 items × 25 students | ~$0.08–$0.12 per full class assignment |
| Monthly estimate (4 assignments) | ~$0.35 / month |

Cost is essentially negligible on an existing OpenAI subscription.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| OpenAI times out (> 15 s) | Returns `502`; UI shows "AI suggestion failed — please score manually" |
| OpenAI returns HTTP error | Returns `502`; UI shows error message |
| `OPENAI_API_KEY` not configured | Returns `503`; UI shows error message on click |
| Goals Supabase query fails | AI suggest still runs, without goal context |
| AI returns out-of-range score | Score is clamped to `[0, max_points]` before returning |

---

## Technical Reference

### Backend

#### `teacher-ai-suggest` — per-item scoring

**File:** `netlify/functions/teacher-ai-suggest.js`

- **Method:** `POST /.netlify/functions/teacher-ai-suggest`
- **Auth:** Teacher session cookie (`tc`) required — uses existing `requireTeacher()` pattern
- **Body size limit:** 10KB
- **Request body:**

```json
{
  "student_response": "string (required)",
  "rubric_tiers": [{ "points": 5, "label": "Exemplary", "desc": "..." }],
  "max_points": 5,
  "item_label": "Q6",
  "goal_codes": ["M.4.1"],
  "goal_descriptions": ["Math Computation — Student will identify slope and intercept"]
}
```

- **Response body:**

```json
{
  "ok": true,
  "suggested_score": 4,
  "suggested_note": "You correctly identified the rise-over-run relationship…",
  "rationale": "Student correctly identifies rise-over-run but omits intercept."
}
```

#### `teacher-ai-suggest-feedback` — overall assignment feedback

**File:** `netlify/functions/teacher-ai-suggest-feedback.js`

- **Method:** `POST /.netlify/functions/teacher-ai-suggest-feedback`
- **Auth:** Teacher session cookie (`tc`) required
- **Body size limit:** 25KB (large assignments with many items can exceed 10KB)
- **Request body:**

```json
{
  "assignment_title": "Week 4 Reading Comprehension",
  "total_score": 18,
  "total_possible": 25,
  "total_percent": 72,
  "item_summaries": [
    { "label": "Q1", "type": "auto", "earned": 3, "max": 3, "teacher_note": "" },
    { "label": "Q6", "type": "constructed", "earned": 2, "max": 5, "teacher_note": "Partial credit…" }
  ],
  "student_code": "STU_ABCD"
}
```

- **Response body:**

```json
{
  "ok": true,
  "suggested_feedback": "You demonstrated solid understanding of the main topic…"
}
```

### Frontend

**File:** `site/web/tc-review.js`

- `generateRubricTiers(maxPoints)` — Builds rubric tier array for the AI prompt
- `ensureGoalsLoaded(studentId)` — Fetches and caches student IEP goals from Supabase
- `handleAiSuggest(button)` — Click handler for ✨ Suggest Grade: collects context, calls
  `teacher-ai-suggest`, populates Score + Teacher Note fields
- `handleAiSuggestFeedback(button)` — Click handler for ✨ Suggest Feedback: collects item
  summaries, calls `teacher-ai-suggest-feedback`, populates the Feedback textarea
- `handleAutoGradeAll()` — Batch handler: iterates "Needs Review" submissions, calls both
  endpoints, saves results via `teacher-review-save` (`save_score` then `save_grade`)
- `handleFinalizeAllReviewed()` — Batch handler: iterates "Reviewed" submissions, finalizes via
  `teacher-review-save` (`finalize`), triggers goal progress updates

### Tests

- `tests/teacher-ai-suggest.test.cjs` — Unit tests for the per-item suggest backend
- `tests/teacher-ai-suggest-goals.test.cjs` — Unit tests for goal description resolution and
  `ensureGoalsLoaded` caching logic
- `tests/teacher-ai-suggest-feedback.test.cjs` — Unit tests for the feedback suggest backend
  (auth, validation, OpenAI mocking, body size limit, goal context injection, edge cases)
- `tests/ai-suggest-integration.test.cjs` — Integration tests covering end-to-end data flow
