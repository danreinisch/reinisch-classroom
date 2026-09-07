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

These require an explicit teacher-recorded performance/observation evidence contract rather than invented question mappings.

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
- Selecting a dot exposes the associated assignment/task, date, skill/component, question when available, student response, released correct answer/result, and other stored evidence details.
- Correct-answer/result review remains gated by Reviewed/Graded assignment status. An evidence event may still appear before release, but it must not leak the correct answer or finalized correctness state.
- Official goal math is not recalculated by this timeline.

---

## 5. Assignment-plan audit

The canonical Week 1, Week 2, and Week 3 upload files were checked for consistency between each assignment header's `Targeted IEP Goal Codes` and the actual `[IG: ...]` tags used in the assignment.

Results:

- **Week 1: 0 header/tag mismatches**
- **Week 2: 0 header/tag mismatches**
- **Week 3: 1 mismatch**

### Week 3 action item

`S063` — Language Arts 1 SC:

- Week 3 header targets `S063.CG1`, `S063.CG2`, and `S063.CG3`.
- Actual Week 3 `[IG: ...]` tags include `S063.CG1` and `S063.CG3`.
- **`S063.CG2` has no actual tagged evidence item in the assignment.**

This was caught before Week 3 issuance and should be corrected deliberately in the Week 3 assignment source rather than silently invented at runtime.

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

These goals need explicit evidence contracts such as:

- teacher-recorded observation
- prompt count
- successful/unsuccessful performance opportunity
- fluency performance check
- social/behavior task observation
- transition/life-skill performance record

Do **not** convert these to generic academic-question evidence simply to make the chart non-empty.

---

## 7. Returned-for-revision safeguard

The audit found several assignment-linked goals with reconstructed item evidence but no official `goal_progress` row because the assignment was in a returned-for-revision state.

Those values were **not** blindly backfilled into official progress.

The evidence timeline may preserve the existence of the attempt, but official progress calculation must continue to respect review/resubmission semantics. This prevents a returned draft from silently becoming a finalized IEP progress checkpoint.

---

## 8. Recommended next steps

1. Teacher visual QA on PR #1478 with S016 and S065.
2. Confirm S016 shows three evidence dots for `S016.CG1` and that selecting a miss displays the exact question/response.
3. Confirm S065 defaults to five All Evidence dots for `S065.CG1`, with skill filtering available.
4. Keep S060 empty until an appropriate performance/observation capture contract is designed.
5. Correct the Week 3 `S063.CG2` assignment mapping before Week 3 is issued.
6. Build a concise capture contract for the 20 current non-question class-context goals with no Q1 check, using Observation Center / teacher-recorded evidence rather than forced question mappings.
7. Only after visual/functional QA, merge PR #1478.
