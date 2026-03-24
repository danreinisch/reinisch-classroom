# Multi-Paragraph Writing Builder — Feature Documentation

This document describes the complete multi-paragraph writing builder feature delivered across five pull requests. It covers the IEP context, the priority chain for paragraph count resolution, teacher and student workflows, validation rules, and code locations.

---

## Overview

The multi-paragraph writing builder allows the Reinisch Classroom student portal to present structured, multi-section writing prompts (topic sentence, supporting details, conclusion) for each required paragraph. The number of paragraphs is configurable per assignment and per student, driven by teacher settings and IEP goal data.

**IEP context:** Student S001 has Written Expression goal S001.11.3 (variants -1, -2, -3) that explicitly requires multi-paragraph writing. The default builder shows a single paragraph; the new feature enables 2–5 paragraphs where required.

---

## Priority Chain

When the student portal determines how many paragraphs to show for a writing prompt, it uses the following priority order (highest to lowest):

1. **Per-student instance override** — `instance.settings.writing_config.paragraph_count`
   Set via the Teacher Center "Issue Assignment" form (per-student advanced settings) or via the "Reconfigure" action on already-issued instances.

2. **Assignment-level (day data) setting** — `dayData.paragraph_count`
   Set via the draft creation form's "Paragraphs per writing prompt" field.

3. **Default** — `1` (single paragraph)

```
getWritingParagraphCount(dayData, instance):
  instance.settings.writing_config.paragraph_count
    → dayData.paragraph_count
    → 1
```

---

## Phase Summary

### Phase 1 — Dynamic Multi-Paragraph Builder UI (PR #856)

**File:** `site/web/student-portal-init.js`

- `getWritingParagraphCount(dayData, instance)` — resolves paragraph count using the priority chain above
- `renderWritingPromptDay()` — generates N paragraph sections with IDs `builderTopicSentence_p1`, `builderConclusion_p2`, etc.; sets `data-paragraph-count` on `#writingBuilder`
- `transferBuilderToResponse()` — collects all paragraph inputs and writes them to the response textarea
- `clearBuilder()` — resets all paragraph inputs

### Phase 2 — Teacher Writing Config UI + Settings Passthrough (PR #857)

**Files:** `prototypes/teacher-center-unified.html`, `site/teacher/work/index.html`, `site/web/tc-work.js`

- "Paragraphs per writing prompt" number input (1–5) in the Issue Assignment form and the draft creation/edit form
- Backend passthrough of `settings.writing_config.paragraph_count` in `teacher-issue-assignment.js` and `teacher-issue-to-student.js`

### Phase 3 — Validation Hardening + Accessibility Fix (PR #860)

**Files:** All backend issue endpoints, `student-portal-init.js`

- `paragraph_count` clamped to `[1, 5]` with `parseInt` at every boundary (client and server)
- `settings` type guard on backend: must be a plain object (not array, not primitive)
- Accessibility: writing builder section uses `role="region"` and `aria-label`

### Phase 4 — Per-Student Instance Overrides via Teacher Center (PR #865)

**Files:** `prototypes/teacher-center-unified.html`, `netlify/functions/teacher-issue-assignment.js`, `netlify/functions/teacher-issue-to-student.js`, `netlify/functions/teacher-issue-draft.js`, `site/web/data-adapter.js`

- Expandable "Advanced: Per-Student Writing Config" section in the Issue Assignment form
- Per-student paragraph count input (1–5) for each selected student; blank = use assignment default
- All UI built with DOM API (`createElement`, `textContent`, `appendChild`) — no `innerHTML` with dynamic data (CodeQL requirement)
- Backend `per_student_settings` map: `{ [studentCode]: { writing_config: { paragraph_count: N } } }`
- "Reconfigure" PATCH action on issued instances (deep-merge settings, not replace)
- `mergeSettingsObjects()` in `data-adapter.js` for safe nested merge

### Phase 5 — IEP Goal-Aware Auto-Detection + Documentation (this PR)

**Files:** `prototypes/teacher-center-unified.html`, `site/web/tc-work.js`, `docs/WRITING_BUILDER_PHASES.md`

- `detectParagraphCountFromGoals(goals)` — scans a student's IEP goals (Writing/Written Expression goal area only) for paragraph count requirements; returns detected count (2–5) or `null`
- Teacher Center prototype: `refreshPerStudentRows()` auto-suggests paragraph count from IEP goals; shows purple "IEP: 2¶" indicator badge next to the input; sets `data-iep-suggested="true"` on the input; badge and attribute cleared when teacher manually changes the value
- Draft issue flow (`tc-work.js`): before issuing, builds an IEP-derived `perStudentWritingConfig` from local `iepGoals` data; merges with any draft-level overrides (teacher-set values always win); sends to backend
- Goals caching in teacher-center-unified.html now stores `goal_area` alongside `code`, `desc`, `target`, `status`, `id` so area-based filtering works correctly after data pull

---

## Teacher Workflow

### Setting Paragraph Count — Class-Wide

1. Open Teacher Center → Work → create or edit a draft
2. Under "Writing Configuration", set "Paragraphs per writing prompt" to 2–5
3. Issue the draft; all enrolled students receive an instance with `writing_config.paragraph_count = N`

### Setting Paragraph Count — Per Student (Manual)

1. Open Teacher Center prototype → Issue Assignment
2. Select an assignment and one or more students
3. Click "▶ Advanced: Per-Student Writing Config" to expand
4. Set the paragraph count for individual students (leave blank to use the assignment default)
5. Click "Issue to Selected Students"

### Setting Paragraph Count — IEP Auto-Detection

When the per-student settings section is expanded, the system automatically reads each student's IEP goals from local storage and pre-fills the paragraph count input if it detects phrases like "writing two paragraphs" or "multi-paragraph writing" in a Written Expression goal. A purple **"IEP: 2¶"** badge appears next to the pre-filled input. The teacher can still change or clear the value.

For the draft issue flow (Work page), IEP-detected values are automatically included as per-student overrides when the teacher clicks "Issue". The teacher does not need to do anything extra — the detection is silent and backwards compatible.

### Reconfiguring After Issue

1. Open Teacher Center prototype → Instances tab
2. Find the student's instance row
3. Click "⚙ Reconfigure"
4. Enter the new paragraph count (1–5)
5. Click OK — the instance settings are deep-merged (existing keys preserved)

---

## Student Experience

When the student opens a writing assignment:

- **1 paragraph (default):** Single "Paragraph 1" section with topic sentence, supporting detail, and conclusion inputs
- **2+ paragraphs:** Multiple numbered sections; each has its own topic sentence, supporting detail, and conclusion inputs
- The builder is rendered in `#writingBuilder` with `data-paragraph-count="N"`
- "Transfer to Response" collects all paragraph inputs into the response field
- "Clear" resets all inputs

---

## Validation Rules

| Boundary | Rule |
|---|---|
| `paragraph_count` input (client) | `parseInt`, clamped to `[1, 5]` |
| Backend issue endpoints | `parseInt`, `Math.min(5, Math.max(1, pc))` |
| `settings` object (backend) | Must be plain object: `typeof s === 'object' && s !== null && !Array.isArray(s)` |
| `per_student_settings` (backend) | Must be plain object; each value must be plain object |
| IEP auto-detection return value | Only returns counts in `[2, 5]`; `null` if no match |

---

## Code Locations

| Concern | File | Key Functions / Identifiers |
|---|---|---|
| Student portal builder | `site/web/student-portal-init.js` | `getWritingParagraphCount()`, `renderWritingPromptDay()`, `transferBuilderToResponse()`, `clearBuilder()` |
| Teacher Center Issue form | `prototypes/teacher-center-unified.html` | `renderPerStudentRow()`, `refreshPerStudentRows()`, `detectParagraphCountFromGoals()`, `#perStudentConfigRows` |
| Draft creation/editing | `site/teacher/work/index.html`, `site/web/tc-work.js` | `#draftParagraphCount`, `handleIssueDraft()`, `buildIepPerStudentWritingConfig()` |
| Backend — issue from form | `netlify/functions/teacher-issue-assignment.js` | `per_student_settings` handling, `handleReconfigure()` |
| Backend — issue to single student | `netlify/functions/teacher-issue-to-student.js` | `per_student_settings` handling |
| Backend — issue from draft | `netlify/functions/teacher-issue-draft.js` | `perStudentWritingConfig` handling |
| Data adapter | `site/web/data-adapter.js`, `web/data-adapter.js` | `mergeSettingsObjects()`, `patchAssignmentInstance()`, `listGoalsByStudentCode()`, `listGoalsAll()` |
| Goals schema | `supabase/migrations/` | `goals` table: `desc` (goal text), `code`, `goal_area`, `student_id` |
| Student portal CSS | `site/student/index.html` | `.st-builder-paragraph-section`, `.st-builder-paragraph-header` |

---

## Testing Guide — Manual QA Checklist

### 1. Single-paragraph (default) — regression

- [ ] Issue an assignment with no writing config set → student sees 1-paragraph builder
- [ ] Issue a draft with `paragraph_count = 1` → student sees 1-paragraph builder
- [ ] "Transfer to Response" and "Clear" work correctly

### 2. Class-wide paragraph count

- [ ] Issue assignment with `paragraph_count = 2` → all students see 2-paragraph builder
- [ ] Issue draft with `paragraph_count = 3` → all students see 3-paragraph builder
- [ ] Values outside [1,5] are clamped (try entering 0, 6, "abc")

### 3. Per-student override (manual)

- [ ] Issue assignment with class default `paragraph_count = 1`, but set S001 to 2
- [ ] S001 sees 2-paragraph builder; other students see 1-paragraph builder
- [ ] Leave another student's per-student field blank → they use the default

### 4. IEP auto-detection in Teacher Center prototype

- [ ] Pull data from Supabase (Tools tab) to populate local `iepGoals` store
- [ ] Open Issue Assignment → expand "Advanced: Per-Student Writing Config"
- [ ] For a student with a Written Expression IEP goal mentioning "two paragraphs", verify the input is pre-filled and a purple "IEP: 2¶" badge appears
- [ ] Verify no auto-suggestion for students without matching Written Expression goals
- [ ] Manually change the auto-suggested value → IEP badge disappears, `data-iep-suggested` removed

### 5. IEP auto-detection in draft issue flow

- [ ] Ensure local `iepGoals` store is populated (pull from Supabase in teacher-center prototype)
- [ ] Issue a draft from the Work page
- [ ] In Supabase, verify that S001's instance has `settings.writing_config.paragraph_count = 2` (or the detected value), while students without matching goals have `paragraph_count = 1` (or the draft default)

### 6. Reconfigure action

- [ ] Locate an issued instance in the Instances tab
- [ ] Click "⚙ Reconfigure" and enter a new paragraph count
- [ ] Verify the instance `settings` is updated (deep-merge, not replace)
- [ ] Student's builder now reflects the new count

### 7. Backwards compatibility

- [ ] An assignment issued before Phase 1 (no `writing_config` in settings) still works — student sees 1-paragraph builder
- [ ] A draft created before Phase 2 (no `writingConfig` field) issues successfully
