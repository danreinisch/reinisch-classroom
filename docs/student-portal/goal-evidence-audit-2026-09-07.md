# Student Goal Evidence Audit — 2026-09-07

## Purpose

This audit followed the Student Portal visual review that exposed a mismatch between displayed goal progress and the evidence students could actually inspect.

The product rule established by this review is:

> **One dot = one discrete evidence event.**

Official goal/progress calculation remains a separate concern. The evidence timeline exists to answer: **What work produced the evidence, and where did the student struggle?**

No student names or other PII are included in this document.

---

## 1. Root cause found

`student-submit-answer.js` historically used an assignment-wide parent-evidence gate. If an assignment contained any constructed response that still required teacher scoring, the old Step 8 skipped parent `goal_progress` and parent `goal_data_points` for the entire assignment.

That was too broad.

A mixed assignment could therefore contain valid auto-scored questions for one IEP goal and a teacher-reviewed written response for another goal, while the auto-scored question evidence was never persisted at the parent-goal level.

Child-objective evidence already ran before this gate, which explains why some objective-aware students had usable `objective_data_points` even when parent question evidence was absent.

### Preventive fix

A narrow mixed-assignment reconciler now runs before the legacy Step 8 gate:

- `netlify/functions/_lib/scored-parent-goal-evidence.js`
- `tests/scored-parent-goal-evidence.test.cjs`

Behavior:

- Fully auto-scoreable assignments remain on the existing path.
- Mixed assignments use per-goal blocking rather than assignment-wide blocking.
- An unscored item blocks only the goal(s) mapped to that item.
- Unrelated scored goal questions still produce item-level evidence.
- Parent `goal_progress` is written only when that goal's own mapped items are fully scored.
- No value is fabricated for an unscored goal.

---

## 2. Q1 historical evidence repair

### Pre-repair audit

Using exact production provenance — latest stored submission answer per assignment instance/item, issued goal mappings, active student goal identity, and instructional assignment status — the Q1 audit found:

- **335 reconstructable parent question-evidence rows missing**
- **32 students affected**
- **62 active goals affected**
- **41 assignment instances affected**

A parallel child-objective audit found:

- **1 reconstructable objective-evidence row missing**

### Repair

Guarded repair script:

- `scripts/sql/20260907_q1_goal_evidence_repair.sql`

The script is a data repair, not a schema migration. It is:

- Q1 scoped
- active-goal scoped
- instructional-assignment scoped
- latest-answer scoped
- exact mapping/provenance scoped
- protected by `NOT EXISTS` identity checks
- idempotent

Production repair result:

- **335 parent `goal_data_points` rows inserted**
- **32 students repaired**
- **62 goals repaired**
- **41 assignments repaired**
- **1 `objective_data_points` row inserted**

### Post-repair verification

Re-running the reconstruction audit returned:

- **0 missing reconstructable parent evidence rows**
- **0 missing reconstructable objective evidence rows**

A separate Week 1 / Week 2 verification also found:

- **0 submitted/scored mapped goal items lacking parent question evidence**
- **0 scored objective-mapped items lacking objective evidence**

---

## 3. Representative cases

### S016

Week 1 contained three scored questions mapped to `S016.CG1`:

- 1 correct
- 2 incorrect
- resulting assignment goal value: 33.33%

The stored answers and mappings existed, but the three parent question-evidence rows were absent before the repair.

After repair, the Student Portal evidence timeline can represent those as **three separate evidence events**, allowing the student to inspect the two misses rather than seeing only one 33.33% checkpoint.

### S065

`S065.CG1` already had five child-objective evidence records:

- Skill 1: 1 event
- Skill 2: 2 events
- Skill 3: 2 events

The old UI showed one point because it defaulted to a single selected skill. The new evidence timeline defaults to **All Evidence**, so the student can see all five events. Skill-specific filtering remains available.

### S060

This is not a lost-evidence case.

Weeks 1 and 2 explicitly did not target assignment-based IEP evidence for S060, and the issued assignment mappings match that design.

`S060.CG1` is a composite x/y performance goal involving reading/comprehension plus regulation/strategy use. `S060.CG2` is a prompt-count behavior goal. Generic academic question correctness would not faithfully measure either goal.

These require explicit teacher-recorded performance/observation evidence contracts rather than invented question mappings.

---

## 4. Student Portal evidence timeline

New read-only endpoint:

- `netlify/functions/student-goal-evidence-events.js`

New Student Portal layer:

- `site/web/student-goal-evidence-timeline.js`
- `site/assets/css/student-goal-evidence-timeline.css`

### Display rules

- Ordinary academic question evidence: **one `goal_data_points` row = one dot**.
- Objective-aware evidence: **one `objective_data_points` row = one dot**.
- Manual/performance evidence without item-level work: **one legitimate `goal_progress` check = one dot**.
- Objective goals default to **All Evidence**.
- Cross-skill All Evidence dots are not connected by a trend line.
- Students may filter to one child skill when they want a skill-specific view.
- Students may filter evidence by **All / Needs Review / Demonstrated** without changing official progress math.
- The timeline is windowed for scalability: **five events on normal desktop cards and three on compact/mobile cards**, with Older/Newer navigation. Large quarters do not become an unbounded wall of dots.
- The newest evidence window is full whenever enough events exist; pagination is anchored from the newest evidence rather than leaving a partially filled final page.
- Selecting a dot exposes the associated assignment/task, date, skill/component, question when available, student response, released correct answer/result, and other stored evidence details.
- Multiple-choice evidence displays the **actual answer choices**, marks the student's selected choice, and — only after review release — marks the correct choice.
- Before Reviewed/Graded release, the student may see their own selected response, but the correct answer, correctness state, evidence score, and child-objective score remain hidden.
- Official goal math is not recalculated by this timeline.

### Scalability regression

The browser regression now stress-tests a synthetic **40-event quarter** and verifies:

- only five newest evidence dots appear on a desktop card
- Older/Newer navigation moves through fixed windows
- Needs Review filtering scales independently
- compact/mobile rendering uses three-dot windows
- the total count remains visible without rendering all events at once

---

## 5. Assignment-plan audit and Week 3 repair

The canonical Week 1, Week 2, and Week 3 upload files were checked for consistency between each assignment header's `Targeted IEP Goal Codes` and the actual `[IG: ...]` tags used in the assignment.

Initial results:

- **Week 1: 0 header/tag mismatches**
- **Week 2: 0 header/tag mismatches**
- **Week 3: 1 mismatch**

### S063 Week 3 repair

`S063` — Language Arts 1 SC — originally listed `S063.CG2` in the Week 3 targeted-goal header but had no actual `S063.CG2` evidence item.

The canonical `WEEK_03_UPLOAD.txt` was repaired in place on Google Drive by tagging three existing, already-appropriate comprehension items rather than inventing new questions:

- Day 1 Question 2 — significance/main-idea comprehension about Dan Hadaller
- Day 2 Question 6 — identifying the most important change across Chapters 7–8
- Day 3 Question 6 — sequencing the pattern of Alex moving toward belonging across Chapters 7–9

Post-repair validation:

- **Week 3: 0 header/tag mismatches across all 58 student assignment blocks**

All `[IO: ...]` objective tags appearing across Weeks 1–3 were checked against the live active `goal_objectives` registry:

- **0 invalid or stale objective codes found**

Week 2 issued mappings were also checked against active goals:

- **0 stale/wrong/inactive goal mappings found**

Students whose Week 1 / Week 2 assignment headers intentionally say no assignment-based IEP goal was targeted also have no goal mapping in the issued assignment; those zeroes are expected rather than evidence loss.

---

## 6. Non-question evidence coverage

The current Week 1 / Week 2 roster contains **24 active class-context goals** whose measurement is not a simple Accuracy/Percent question score (Observation, Number, x/y, etc.).

Current Q1 status:

- **4** have at least one recorded progress check
- **20** currently have no recorded progress check
- those 20 goals span **13 students**

This is a separate design/cadence issue, not the repaired question-evidence bug.

The 20 missing-contract goals were individually reviewed against the live goal wording and active child objectives. The reviewed recommendations are in:

- `docs/student-portal/non-question-evidence-contracts-review-2026-09-07.md`

The review organizes future capture into reusable event types rather than twenty custom workflows:

- opportunity / no opportunity
- prompt count or numeric rubric
- defined performance trial
- teacher-reviewed work sample
- composite checklist
- objective-specific evidence
- periodic benchmark evidence

Special cases include S060's composite reading/regulation trial, S069's MAP benchmark + objective probes, and S070's objective-driven parent goals.

Do **not** convert these goals to generic academic-question evidence simply to make the chart non-empty.

---

## 7. Returned-for-revision safeguard

The audit found several assignment-linked goals with reconstructed item evidence but no official `goal_progress` row because the assignment was in a returned-for-revision state.

Those values were **not** blindly backfilled into official progress.

The evidence timeline may preserve the existence of the attempt, but official progress calculation must continue to respect review/resubmission semantics. This prevents a returned draft from silently becoming a finalized IEP progress checkpoint.

---

## 8. Current release gate

Completed:

1. Student Portal evidence timeline built around one event per dot.
2. Historical Q1 reconstructable question/objective evidence repaired and verified.
3. Mixed-assignment evidence-writing bug fixed going forward.
4. S016 and S065 live visual QA confirmed item-level evidence is now visible and clickable.
5. Scalable five/three-event windows and result filters added.
6. Actual answer-choice text added to goal evidence review.
7. S063 Week 3 `CG2` targeting gap repaired; Week 3 now validates at zero header/tag mismatches.
8. The 20 current non-question evidence contracts reviewed and separated into a follow-up capture-design slice.

Remaining before merge:

- final teacher visual QA of the newest window/filter/answer-choice presentation
- green repository CI, Supabase Validation, and Netlify preview on the final head

The non-question Observation Center implementation is intentionally **not** part of PR #1478. It belongs in a focused follow-up after the Student Portal evidence presentation is merged.
