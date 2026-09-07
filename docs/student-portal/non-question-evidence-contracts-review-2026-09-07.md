# Non-Question Goal Evidence Contracts — Reviewed Recommendation — 2026-09-07

## Status

**Reviewed implementation recommendation.** This document does **not** change IEP wording, goal math, mastery criteria, or reporting cadence. It defines what one legitimate ReinischClassroom evidence event should represent so future capture controls do not manufacture pseudo-data.

The current Week 1 / Week 2 roster audit found **20 class-context goals across 13 students** whose measurement is not a simple assignment-question Accuracy/Percent score and that currently have no Q1 progress check.

The governing rule is the same one established for the Student Portal:

> **One dot = one discrete evidence event that is faithful to the goal being measured.**

Generic multiple-choice correctness must not be used merely to make a chart non-empty.

---

## Reviewed evidence contracts

| Student / Goal | Area / Measure | One evidence event should mean | Recommended RC capture | Review status |
|---|---|---|---|---|
| S025.CG3 | Social Skills / x-y | One authentic situation in which self-advocacy was reasonably needed; record met/not met | Observation Center opportunity check + optional brief note | Ready |
| S051.CG5 | Social Skills / Observation | One authentic or deliberately structured situational-judgment experience; record whether appropriate judgment and consequence awareness were demonstrated | Observation Center or low-setup scenario performance | Ready |
| S055.CG2 | Written Expression / x-y | One paragraph writing sample evaluated for topic sentence + supporting details + conclusion | Teacher review of the actual assignment writing sample; pass/fail against the goal criteria | Ready; assignment-derived |
| S056.CG4 | Behavior / x-y | One real social-event opportunity in which the student had a chance to process before responding | Observation Center opportunity check | Ready |
| S058.CG1 | Behavior / x-y | One conflict scenario/opportunity containing all three required components: identify conflict, give an appropriate response using a taught regulation strategy, and name an inappropriate response to avoid | Three-component checklist; teacher-recorded or intentionally designed RC scenario task | Ready |
| S059.CG5 | Social Skills / x-y | One naturally occurring dysregulation/break opportunity; record whether an appropriate break request occurred | Observation Center opportunity check; use No Opportunity when no legitimate opportunity occurred | Ready |
| S059.CG6 | Transition / Observation | One daily schedule-following performance; record independently completed expected schedule steps/transitions divided by total expected steps/transitions | Teacher-recorded schedule-performance percentage plus independence/support note if useful | Ready with defined daily denominator |
| S060.CG1 | Basic Reading / x-y | One combined reading-performance trial documenting independent reading, comprehension participation, and regulation/strategy use during the task | Small multi-component teacher checklist tied to one reading opportunity | Needs special handling; do not reduce to MCQ correctness |
| S060.CG2 | Behavior / Number | One classroom-task opportunity recording whether the task was completed and the number of prompts required | Prompt-count field + completion flag; threshold remains no more than 2 prompts | Ready |
| S061.CG1 | Social Skills / Observation | One classroom task: record start latency and prompt count; success requires starting within 5 minutes with 2 or fewer prompts | Observation Center quick capture with latency + prompt count | Ready |
| S061.CG2 | Social Skills / Observation | One actual staff-redirection opportunity; record whether redirection was accepted without the prohibited reactions | Observation Center opportunity check; No Opportunity when no redirection occurred | Ready |
| S061.CG3 | Social Skills / Observation | One defined data-collection period documenting whether inappropriate conversation topics/comments occurred | Observation-period result with a clearly defined collection window; do not count absence/no opportunity as success | Ready once collection window is standardized |
| S061.CG4 | Social Skills / Number | One social-group performance scored with the existing rubric | Numeric rubric score field | Ready |
| S062.CG3 | Reading Fluency / Observation | One oral-reading trial evaluating punctuation/phrasing behavior | Oral-reading performance trial, met/not met against the stated punctuation/phrasing criterion | Ready |
| S063.CG3 | Written Expression / x-y | One complete paragraph writing sample evaluated for the required five sentences | Teacher review of the actual assignment writing sample; pass/fail; returned revisions remain attempts until finalized | Ready; assignment-derived |
| S069.CG1 | Reading Comprehension / Observation | Parent-goal evidence is the periodic MAP Reading RIT result; child-objective evidence may come from vocabulary, informational-text, and literary-text probes | Parent: benchmark record only. Objectives: objective-specific probe evidence | Special benchmark/objective model |
| S070.CG1 | Social/Emotional / Observation | Evidence should be captured at the measurable child-objective level: attendance/tardies, negative-choice behavior, and emotion-management behavior | Use existing attendance records where applicable; Observation Center only for behavior objectives. Do not create one vague parent-goal score | Special objective-driven model |
| S070.CG4 | Executive Functioning / Observation | Evidence should be objective-specific: on-time arrival, task initiation, deadline completion, binder organization, or sustained attention | Attendance/assignment records where appropriate; objective-specific observation or weekly binder check for the remaining objectives | Special objective-driven model |
| S071.CG1 | Social Skills / x-y | One comprehension-check interaction opportunity; goal requires two such opportunities per class period | Two very fast met/not-met captures per class period, ideally from Observation Center | Ready; high-frequency capture |
| S071.CG2 | Social Skills / x-y | One situation in which clarification is genuinely needed; record whether the student appropriately asks a question | Observation Center opportunity check; No Opportunity when clarification was not reasonably needed | Ready |

---

## Review conclusions

### 1. Most of the 20 goals are ready for a straightforward capture contract

The majority can be represented cleanly by one of four reusable RC event types:

- **Opportunity:** met / not met / no opportunity
- **Count:** number of prompts, reminders, or rubric score
- **Performance trial:** defined task or oral-reading performance with explicit criteria
- **Work sample:** teacher-reviewed assignment artifact evaluated directly against the IEP criterion

This is good news: we do **not** need twenty custom mini-apps.

### 2. S060.CG1 must remain composite

The goal combines independent reading, comprehension participation, and regulation/strategy use. A correct comprehension question alone does not establish the whole goal. RC should therefore record a single combined trial with the required components visible to the teacher.

The source wording is awkward (`4 out of occasions`) while the stored mastery is `4 / 5`; implementation must preserve the official record rather than silently rewriting the goal language.

### 3. S069.CG1 should not receive weekly parent-goal filler dots

The parent criterion is MAP Reading RIT growth from 215 to 220. Parent evidence should therefore be entered when a legitimate MAP result exists. The three active child objectives already define useful classroom probe evidence for vocabulary, informational text, and literary text; those can generate more frequent objective-level events without pretending they are MAP scores.

### 4. S070.CG1 and S070.CG4 should be objective-first

Both parent goals are broad and have measurable active child objectives. The Student Portal should surface those objective evidence events and rollups rather than encouraging a teacher to invent a single generic parent score.

Where an objective is based on attendance/tardies or assignment deadlines, RC should use the authoritative record when available rather than turning Observation Center into a second attendance or gradebook system.

### 5. High-frequency capture must stay fast

S071.CG1 explicitly calls for two comprehension-check opportunities per class period. That only works in real life if capture is nearly frictionless. This should eventually be a two-tap or keyboard-friendly Observation Center path, not a modal with twelve fields and a small tax form attached.

---

## Shared implementation rules

1. **Evidence-event identity comes first.** Define what one dot means before building the input control.
2. **Question evidence is only for goals genuinely measured by questions or work products.**
3. **Observation goals produce teacher-recorded opportunities, trials, counts, or rubric scores.**
4. **Composite goals use a small checklist rather than collapsing several requirements into a misleading yes/no question.**
5. **Benchmark goals respect benchmark cadence.** No weekly filler data.
6. **Objective-aware broad parent goals capture evidence at the measurable child-objective level whenever possible.**
7. **No Opportunity / Absent remains legitimate when the defined opportunity did not occur.** It must never be converted into a success or failure.
8. **Returned-for-revision work samples may remain visible as attempt evidence but do not silently become finalized progress.**
9. **Student Portal rendering stays common.** Once a legitimate event exists, the same scalable evidence timeline can display question, work-sample, objective, and teacher-recorded evidence.
10. **Capture burden matters.** If a contract cannot realistically be recorded during class, the design is wrong even if the database schema loves it.

---

## Recommended implementation grouping after PR #1478

This review should **not** expand PR #1478 into an Observation Center redesign. The capture work belongs in a separate follow-up slice:

1. Opportunity / No Opportunity quick capture
2. Prompt-count and numeric-rubric capture
3. Work-sample criterion capture during teacher review
4. Composite performance checklist for goals such as S058.CG1 and S060.CG1
5. Objective-specific capture for S070
6. Benchmark-entry path for S069 parent MAP evidence

The existing four non-question class-context goals that already have Q1 progress checks demonstrate that teacher-recorded evidence can coexist with assignment question evidence. The next task is consistency and speed, not another evidence model.
