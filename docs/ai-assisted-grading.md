# AI-Assisted Grading Suggestions

## Overview

The AI-Assisted Grading Suggestions feature helps teachers score constructed-response items on the
Review page. When a teacher clicks **✨ Suggest Grade** on a response card, the system sends the
student's written answer and the item's rubric to an AI model, which returns a suggested score and
a feedback note focused specifically on that written response. The teacher reviews both fields,
edits them as needed, and clicks **Save Grade** as normal.

**Key design principle:** The AI suggestion never auto-saves. Teachers always have the final word.

### Two-Layer Feedback Model

The Review page supports two separate feedback layers:

1. **Per-item Teacher Note** — on each constructed-response card, populated by the AI's
   `suggested_note`. This note is focused specifically on the student's written response to that
   question: what was demonstrated, what could be improved, and any specific guidance. It is
   3–4 sentences and does not address the overall assignment.

2. **Overall Assignment Feedback** — in the Grade section at the bottom of the page, written by
   the teacher after all items have been scored. This is where holistic comments about the full
   assignment belong.

The AI only fills the per-item Teacher Note. Overall assignment feedback is always written by the
teacher.

The button is only shown for **constructed-response** items (fill-in-blank / written response). It
does not appear on MCQ, boolean, or multi-select items, which are scored automatically.

---

## Setup

1. Add `OPENAI_API_KEY` to the Netlify environment variables for the site.
2. No other configuration is required. The **✨ Suggest Grade** button always appears on
   constructed-response cards in the Review page. When the key is missing, clicking the button
   returns a `503` with the message "AI suggestions not configured — ask admin to add OPENAI_API_KEY".

---

## How It Works

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
tc-review.js populates Score input + Teacher Note textarea
  (teacher edits and saves manually — no auto-save)
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

| Data sent | Example |
|---|---|
| Student's written response text | `"The slope of the line is 2 because…"` |
| Rubric tier definitions | `"5 — Exemplary: Thorough, evidence-based"` |
| Item label | `"Q6"` |
| IEP goal descriptions | `"Math Computation — Student will identify slope and intercept"` |

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
| Avg input tokens / request | ~400–600 |
| Avg output tokens / request | ~250 |
| Cost per suggestion | ~$0.0002 |
| 16 items × 25 students | ~$0.04 per full class assignment |
| Monthly estimate (4 assignments) | ~$0.16 / month |

Cost is essentially negligible on an existing OpenAI subscription.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| OpenAI times out (> 10 s) | Returns `502`; UI shows "AI suggestion failed — please score manually" |
| OpenAI returns HTTP error | Returns `502`; UI shows error message |
| `OPENAI_API_KEY` not configured | Returns `503`; UI shows error message on click |
| Goals Supabase query fails | AI suggest still runs, without goal context |
| AI returns out-of-range score | Score is clamped to `[0, max_points]` before returning |

---

## Technical Reference

### Backend

**File:** `netlify/functions/teacher-ai-suggest.js`

- **Method:** `POST /.netlify/functions/teacher-ai-suggest`
- **Auth:** Teacher session cookie (`tc`) required — uses existing `requireTeacher()` pattern
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
  "suggested_note": "You correctly identified the rise-over-run relationship to find the slope. Your explanation shows solid understanding of how the slope value affects the steepness of the line. To strengthen your response, consider also explaining what the y-intercept represents and where it appears in the equation. Adding that connection would make your answer complete.",
  "rationale": "Student correctly identifies rise-over-run but omits intercept."
}
```

### Frontend

**File:** `site/web/tc-review.js`

- `generateRubricTiers(maxPoints)` — Builds rubric tier array for the AI prompt
- `ensureGoalsLoaded(studentId)` — Fetches and caches student IEP goals from Supabase
- `handleAiSuggest(button)` — Click handler: collects context, calls backend, populates fields

### Tests

- `tests/teacher-ai-suggest.test.cjs` — Unit tests for the backend function (auth, validation,
  OpenAI mocking, score clamping, error handling, goal context in prompts)
- `tests/teacher-ai-suggest-goals.test.cjs` — Unit tests for goal description resolution and
  `ensureGoalsLoaded` caching logic
- `tests/ai-suggest-integration.test.cjs` — Integration tests covering end-to-end data flow
  (full flow with/without IEP goals, score clamping, graceful degradation, rubric tier generation,
  response format validation)
