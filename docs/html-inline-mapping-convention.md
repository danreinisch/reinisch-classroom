# HTML Inline Mapping Convention

This document describes how to annotate HTML assignments so that Reinisch Classroom can automatically detect questions, extract answer keys, map DESE standards, and link IEP goal codes — without requiring a separate sidecar manifest file.

The convention uses six standard HTML `data-*` attributes (`data-qref`, `data-points`, `data-correct`, `data-answer-type`, `data-dese`, `data-goal`) that can be placed on any element.

---

## Supported Data Attributes

| Attribute | Required | Description |
|---|---|---|
| `data-qref` | **Yes** (for inline mode) | Unique question reference ID (e.g. `Q1`, `Q2`). Triggers Pass 1 detection. |
| `data-points` | No | Point value for the question. Defaults to `1`. Accepts decimals (e.g. `0.5`, `2`). |
| `data-correct` | No | Correct answer string. Auto-detection rules apply (see below). |
| `data-answer-type` | No | Explicit answer type override: `mcq`, `multi`, `boolean`, or `constructed`. |
| `data-dese` | No | Semicolon-separated DESE/standards codes (e.g. `MA.8.EE.1;MA.8.EE.2`). |
| `data-goal` | No | Semicolon-separated IEP goal codes (e.g. `MATH.1;READ.2`). |

---

## Answer Type Auto-Detection Rules

When `data-answer-type` is not specified, the answer type is inferred from `data-correct`:

| `data-correct` value | Inferred `answer_type` | `correct` stored as |
|---|---|---|
| *(empty or `-`)* | `constructed` | `null` |
| Contains `;` (e.g. `A;C`) | `multi` | `string[]` (split on `;`) |
| `true` or `false` (case-insensitive) | `boolean` | `true` / `false` (boolean) |
| Any other string (e.g. `B`) | `mcq` | `string` |

If `data-answer-type` is provided and valid (`mcq`, `multi`, `boolean`, `constructed`), that type is used directly and `data-correct` is still parsed using the same rules to normalize the `correct` value.

---

## Annotated HTML Example

The following example shows all four answer types on a single assignment page:

```html
<!DOCTYPE html>
<html>
<head><title>Quiz: Chapter 5</title></head>
<body>

  <!-- MCQ: single correct answer -->
  <div data-qref="Q1"
       data-points="1"
       data-correct="B"
       data-dese="MA.8.EE.1"
       data-goal="MATH.1">
    <p>1. What is 2³?</p>
    <label><input type="radio" name="Q1" value="A"> 6</label>
    <label><input type="radio" name="Q1" value="B"> 8</label>
    <label><input type="radio" name="Q1" value="C"> 9</label>
    <label><input type="radio" name="Q1" value="D"> 12</label>
  </div>

  <!-- Multi-select: multiple correct answers separated by semicolons -->
  <div data-qref="Q2"
       data-points="2"
       data-correct="A;C"
       data-dese="MA.8.EE.2"
       data-goal="MATH.1">
    <p>2. Select all that apply: which are perfect squares?</p>
    <label><input type="checkbox" name="Q2" value="A"> 4</label>
    <label><input type="checkbox" name="Q2" value="B"> 6</label>
    <label><input type="checkbox" name="Q2" value="C"> 9</label>
    <label><input type="checkbox" name="Q2" value="D"> 10</label>
  </div>

  <!-- Boolean: true/false question -->
  <div data-qref="Q3"
       data-points="1"
       data-correct="true"
       data-dese="MA.8.EE.1">
    <p>3. True or False: A negative exponent indicates a reciprocal.</p>
    <label><input type="radio" name="Q3" value="true"> True</label>
    <label><input type="radio" name="Q3" value="false"> False</label>
  </div>

  <!-- Constructed response: no auto-grading, teacher reviews manually -->
  <div data-qref="Q4"
       data-points="3"
       data-goal="MATH.2;READ.1">
    <p>4. Explain in your own words what an exponent represents.</p>
    <textarea name="Q4" rows="4" cols="60"></textarea>
  </div>

</body>
</html>
```

This HTML is **self-describing**: uploading it as an assignment ZIP automatically generates a complete manifest with answer keys, point values, DESE codes, and IEP goal codes — no separate mapping file needed.

---

## 7-Pass Detection Priority Order

`detectQuestionsFromHTML()` runs up to 7 detection passes. Each pass runs only if all previous passes found zero questions:

| Pass | Strategy | Trigger condition |
|---|---|---|
| 1 | `[data-qref]` elements — full inline annotation | Any element has `data-qref` attribute |
| 2 | Form inputs (`input[name]`, `select[name]`, `textarea[name]`) grouped by name | Name matches `Q*` or `question*` pattern |
| 3 | `<fieldset>` elements with a `<legend>` | Any fieldset present |
| 4 | `<ol> > <li>` ordered list items | Any `<ol>` list items present |
| 5 | Class/ID patterns: `.question`, `[class*="q-"]`, `[id^="q-"]`, `[id^="question"]`, `[data-question]` | Matching elements found |
| 6 | `<table>` rows where first cell matches a question-number pattern (`1.`, `Q1`, etc.) | Matching rows found |
| 7 | Block-element fallback (`p`, `div.question`, `section`, `article`, `li`) — legacy | Length between `MIN_QUESTION_LENGTH` (10) and `MAX_QUESTION_LENGTH` (500) chars |

Pass 1 is the **recommended** approach for authored assignments because it extracts the full mapping (answer key, points, codes) automatically.

---

## TXT Mapping Parity

The inline annotation convention mirrors the pipe-delimited TXT mapping format parsed by `parseTxtMapping()` in `assignment-mapping-parsers.js`:

| TXT mapping field | Inline HTML attribute | Notes |
|---|---|---|
| `q_ref` (column 1) | `data-qref` | Unique question ID |
| `points` | `data-points` | Defaults to `1` |
| `correct` | `data-correct` | Same auto-detection rules apply |
| `dese_codes` | `data-dese` | Semicolon-separated |
| `goal_codes` | `data-goal` | Semicolon-separated |
| *(answer type inferred)* | `data-answer-type` | Optional explicit override |

An HTML assignment annotated with `data-rc-*` attributes produces a manifest structurally equivalent to one generated from a TXT mapping file, enabling the same scoring pipeline (`scoreSubmission()`), goal rollup (`computeGoalRollups()`), and IEP progress reporting (`tc-reporting.js`) for both assignment types.

---

## Scoring Pipeline Integration

### How `manifestQuestionsToItems()` Bridges Manifest → DB Items

The module `web/html-manifest-to-items.js` (mirrored at `site/web/html-manifest-to-items.js`) provides the bridge between the manifest produced by `detectQuestionsFromHTML()` and the `assignment_items` + `assignment_item_mappings` database rows that the scoring pipeline depends on.

#### Data Flow

```
detectQuestionsFromHTML()          ← parses inline data-* attributes from HTML
        ↓
manifestQuestionsToItems()         ← converts manifest questions → items array
        ↓
insertAssignmentItems()            ← persists assignment_items + assignment_item_mappings rows
        ↓
scoreSubmission()                  ← scores student answers against stored items
        ↓
computeGoalRollups()               ← aggregates per-goal scores from item mappings
        ↓
tc-gradebook.js / tc-reporting.js  ← displays scores and IEP progress
```

#### Field Mapping

`manifestQuestionsToItems()` converts each question object from `detectQuestionsFromHTML()` into the item format required by `insertAssignmentItems()`:

| Manifest field (`detectQuestionsFromHTML`) | Item field (`insertAssignmentItems`) | Notes |
|---|---|---|
| `q_ref` | `ref` | Question identifier; questions with falsy `q_ref` are skipped |
| `answer_type` | `answer_type` | Defaults to `'constructed'` if missing |
| `points` | `points` | Defaults to `1` if missing |
| `correct` | `correct` | Defaults to `null` if missing |
| `dese_codes` | `dese_codes` | Defaults to `[]` if missing |
| `default_goal_codes` | `goal_codes` | Defaults to `[]` if missing |
| `label` | `notes` | First 100 chars of question text |
| *(generated)* | `scoring` | `{}` — Phase 1: no custom scoring config |

#### Gradebook and Reporting Parity

Once items are persisted via `insertAssignmentItems()`, HTML assignments are treated identically to TXT assignments throughout the pipeline:

- **`tc-gradebook.js`** — displays per-assignment scores and weighted averages
- **`tc-reporting.js`** — renders per-question breakdowns in Evidence ZIP exports and IEP Progress Reports
- **Goal rollup** — `computeGoalRollups()` aggregates scores by `goal_codes`, feeding `upsertGoalProgress()` entries that appear in IEP reports and DOCX exports

This means an HTML assignment annotated with `data-qref`, `data-points`, `data-correct`, `data-dese`, and `data-goal` attributes will produce the same gradebook and IEP evidence output as an equivalent TXT quiz with a pipe-delimited mapping file.

---

## Evidence Reports and IEP Progress Reports

### Rich Per-Question Cards for HTML Assignments

Evidence Reports (exported from `tc-reporting.js`) and the Review Queue (`tc-review.js`) and Library evidence view (`tc-library.js`) all render **rich per-question cards** with DESE standard badges and IEP goal descriptions for HTML assignments.

These renderers use `buildItemsFromMeta(assignmentId, meta)` (or `_buildItemsFromMeta` in `tc-library.js`) to build a list of synthetic items from the assignment metadata. The function supports two metadata formats:

1. **TXT/structured format** — `meta.days[].questions[]` — used by assignments created from pipe-delimited TXT mapping files.
2. **HTML manifest format (fallback)** — `meta.questions[]` (flat array) — used by HTML assignments created via the inline `data-*` annotation path from `detectQuestionsFromHTML()`.

When `meta.days` is absent or empty but `meta.questions` is a non-empty flat array, `buildItemsFromMeta` builds synthetic items from that flat array. Each question object in `meta.questions` has the shape:

```js
{
  q_ref: 'Q1',           // question reference ID
  label: 'Question text',
  points: 1,
  answer_type: 'mcq',    // 'mcq' | 'multi' | 'boolean' | 'constructed'
  correct: 'B',          // correct answer (or null for constructed)
  dese_codes: ['MA.8.EE.1'],
  default_goal_codes: ['MATH.1'],
}
```

These are mapped to the same item shape used throughout the rendering pipeline, so DESE badges, IEP goal descriptions, and the ✓/✗ correctness markers all work identically for HTML assignments and TXT assignments.

### What This Enables

- **Evidence Reports** — `buildRichAnswerDetailHtml()` in `tc-reporting.js` renders per-question cards with answer comparison, DESE codes, and IEP goal descriptions for HTML assignments
- **IEP Progress Reports** — per-item detail appears in DOCX exports for HTML assignments
- **Review Queue** — `tc-review.js` renders the same rich detail for HTML assignments submitted by students
- **Library evidence view** — `tc-library.js` renders matching evidence cards for all assignment types

All existing TXT assignment reporting is unchanged — the `meta.days` path is always checked first and takes priority.

---

## Server-Side Backfill and Draft Issuance Parity

### `admin-backfill-items` — Retroactive Backfill for HTML Assignments

`netlify/functions/admin-backfill-items.js` can retroactively create `assignment_items` rows for HTML assignments that were created before the scoring pipeline integration (PR #824). The function's `buildItemsFromMeta()` now supports both metadata formats:

- **Path A (TXT):** `meta.days[].questions[]` — the multi-day structured format.
- **Path B (HTML manifest):** `meta.questions[]` (flat array from `detectQuestionsFromHTML`) — used when `meta.days` is absent or empty.

To backfill all HTML assignments missing items, POST to `/.netlify/functions/admin-backfill-items` with an empty body (or `{ "assignment_id": "<id>" }` for a specific assignment). The function skips assignments that already have items unless `"force": true` is passed alongside a specific `assignment_id`.

### `teacher-issue-draft` — HTML Manifest Item Creation (Step 5b-alt)

`netlify/functions/teacher-issue-draft.js` Step 5b now handles two cases:

- **Step 5b (TXT):** `if (parsedMeta && parsedMeta.days && parsedMeta.days.length > 0)` — existing TXT path, unchanged.
- **Step 5b-alt (HTML manifest):** `else if (parsedMeta && Array.isArray(parsedMeta.questions) && parsedMeta.questions.length > 0)` — new path for HTML assignments whose `parsedMeta` has a flat `questions` array instead of `days`.

When a teacher issues an HTML assignment through the draft flow, Step 5b-alt creates `assignment_items` and `assignment_item_mappings` rows using the same upsert pattern as the TXT path. This ensures HTML assignments issued via `teacher-issue-draft` have per-item scoring enabled from the moment they are issued.

