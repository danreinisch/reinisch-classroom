# Reinisch Classroom — Canonical Student, Curriculum, Evidence, and Drafting Architecture

- **Status:** Canonical product-direction architecture
- **Captured:** July 14, 2026
- **Implementation status:** Planning only
- **Production baseline:** `RC-2026-27-01`, verified at merge commit `033a594f`

## 1. Purpose

This document defines the intended architecture connecting:

1. the Teacher Center Students workspace;
2. recurring special-education student onboarding;
3. Library and Work curriculum planning and delivery;
4. verified progress evidence;
5. teacher-reviewed drafting assistance for Present Levels, Changes in Current Functioning, Goals, Form C, and progress summaries.

The goal is to preserve the existing classroom workflow while making Reinisch Classroom more useful for daily special-education instruction, progress monitoring, and documentation. This is not a rewrite plan and does not authorize implementation.

## 2. Authority and Existing Documentation

This document governs future product direction for the areas above. Existing documents retain narrower roles:

- `docs/STUDENT_MANAGER.md`: existing Student Manager implementation and history.
- `docs/IEP_PROGRESS_PHASES_4_5.md`: existing progress-entry and assignment-goal-mapping behavior.
- `docs/iep-reference/iep-spec.md`: SpedTrack-derived reference inventory, not Reinisch Classroom product authority.
- `docs/GOAL_DATA_POINTS_RLS.md`: existing database-policy behavior, not authorization to expand client-side access.
- `docs/features/STUDENT_PORTAL_FUNCTIONS_ARCHITECTURE.md`: current Student Portal server-side security boundary.
- `docs/GUARDRAILS.md` and auth/security documents: current security authority.

When an older product idea conflicts with this document, this document governs future direction. Verified current security and production contracts continue to control until a separately approved and tested slice changes them.

## 3. Non-Negotiable Rules

1. Preserve the classroom-critical loop: teacher access → create and issue work → student completion → submission → teacher review → gradebook, reporting, and progress evidence.
2. Teacher Center remains the teacher’s operational home.
3. The official IEP and district records remain controlling.
4. Reinisch Classroom may create teacher-reviewable suggestions; it must not silently create official educational conclusions.
5. Scores may become evidence, but a score alone is not an IEP conclusion.
6. Teacher confirmation is required before evidence supports formal progress interpretation or documentation drafts.
7. New sensitive features require authenticated server-side boundaries and least-privilege access.
8. Student identity remains code-only. Do not store or require student names, addresses, birth dates, guardian information, official student IDs, personal contact information, or code-to-name mappings.
9. Use fake or sanitized coded data for development and automated testing.
10. Archive and version historical records; do not casually overwrite or delete them.
11. Implement through narrow, independently testable slices rather than broad rewrites.

## 4. Surface Responsibilities

### Students

The teacher-facing learner and special-education workspace. It preserves useful existing progress, assignment, grade/status, goal, and student-management functions while adding structured special-education information over time.

### Library

Reusable curriculum sources: collections and books, chapter/segment guides, instructional arcs, lesson and assignment templates, presentations, toolkits, standards mappings, and teacher materials.

### Work

Scheduled classroom execution: weekly and daily plans, assignment drafts, dates, points, class/student targeting, teacher-selected differentiation, issue/release controls, and status through review.

### Review, Gradebook, and Progress Evidence

Interpret completed work while preserving the distinction among scoring, feedback, goal-aligned evidence, and formal progress conclusions.

### Reporting and Drafting

Aggregate teacher-confirmed information and prepare editable suggestions. They do not create official records without teacher review and the district’s required process.

## 5. Record Boundaries

| Record | Meaning |
| --- | --- |
| Curriculum item | Reusable lesson, book, guide, template, presentation, or resource |
| Scheduled work | Curriculum placed on a date for a class |
| Issued assignment | Work released to specific students |
| Submission | Student response to an issued assignment |
| Score and feedback | Evaluation of a submission |
| Evidence candidate | Potential goal/skill evidence awaiting teacher review |
| Verified evidence | Evidence accepted and contextualized by the teacher |
| Progress interpretation | Teacher-approved conclusion based on relevant evidence |
| Documentation draft | Editable suggested language derived from verified information |

Editing Library content must not rewrite historical assignments, submissions, evidence, or reports.

## 6. Teacher Center Students Workspace

The landing view stays fast and operational. Selecting a student progressively opens:

### Overview

- progress, assignments, completion, grades, and revision status;
- alerts, upcoming dates, and record-verification status;
- quick links to goals, supports, and evidence.

### Goals and Evidence

- current/historical goals, baseline, mastery criterion, measurement method, and reporting schedule;
- manual, imported, assignment-derived, and observational evidence;
- conditions, support/independence level, verification state, and reporting history.

### Present Levels

Domain, current performance, objective evidence/baseline, need, educational or functional impact, effective supports, linked goal, source, and review status.

### Changes in Current Functioning

Prior goal/baseline, documented performance, outcome/change, new baseline/criterion, goal relationship, measurement method, source, and review status.

### Supports and Services

Accommodations, modifications, implementation guidance, settings/frequency, specialized/related services, dates, source, verification, and privacy flags.

### Behavior and BIP

An authorized operational classroom summary—not a replacement for the official BIP/FBA—covering appropriate prevention supports, replacement behavior, strategies, response, monitoring, and safety indicators.

### Form C and Transition

Verified postsecondary goals, interests/preferences, strengths/needs, assessments, activities, responsibilities, Pre-ETS, agencies, and anticipated graduation/exit information.

### Dates, Records, and Review

IEP/evaluation dates, coded source inventory, version information, unresolved questions, human-review queue, data-quality flags, and archive history.

## 7. Recurring Student Onboarding

Onboarding is not a one-time school-year wizard. New students, transfers, schedule/service changes, and incomplete records occur throughout the year.

> A teacher must be able to add a student quickly, begin classroom work immediately, and progressively complete the special-education record as verified information becomes available.

### Readiness states

- **Basic:** code-based profile and classroom access established.
- **Provisional:** some information present but awaiting verification.
- **Partially verified:** selected sections checked; others incomplete.
- **Fully verified:** required current sections reviewed for the intended workflow.
- **Archived/transferred:** removed from active views while history remains.

These states describe record readiness, not eligibility.

### Quick Start

1. Create/activate the student’s code-based profile.
2. Add the correct class enrollment.
3. Provide appropriate current work.
4. Record essential need-to-know supports.
5. Complete deeper records later.

A complete IEP profile must not be required before classroom participation.

### Guided Setup

Progressively add goals, measurement methods, supports, services, dates, Present Levels, Changes in Current Functioning, behavior/BIP information, Form C/transition information, and source/verification notes.

### Structured Import

1. Select an approved source/template.
2. Parse into a staging preview.
3. Match students by code without guessing; reject PII and code-to-name mapping fields.
4. Validate formats and identify missing, duplicate, stale, or conflicting data.
5. Let the teacher exclude/correct records.
6. Require confirmation before active records change.
7. Retain source, date, and verification history.

Failed imports must not damage active records. The system should state what is known, what remains unverified, and what action is recommended—not fill gaps with confident guesses.

## 8. Evidence Lifecycle

Evidence may include goal-specific probes, verified observations, aligned rubric criteria, repeated aligned performance, work samples, imports, and general scores used only as context.

Each evidence record should retain student/goal linkage, source, date/window, result, conditions/supports, independence level, collector/reviewer where appropriate, verification status, and interpretive notes.

Evidence strength must be transparent. Goal-specific probes, verified observations, and directly aligned rubric results generally carry more weight than averages or isolated general scores. Missing work, attendance-related zeros, weak alignment, and contradictory evidence require flags.

Existing assignment-goal mappings and generated progress entries are useful inputs. Automatically created entries remain evidence—not automatic conclusions about mastery, regression, goal revision, or Present Levels.

Before drafting, the system should detect insufficient/old evidence, weak alignment, lack of independent performance, contradictory results, missing baseline/measurement method, distorted averages, or missing transition information. The correct result may be “collect more evidence.”

## 9. IEP Drafting Workbench

This is a teacher-directed drafting workbench, not an autonomous IEP generator.

### Workflow

1. Teacher selects student, reporting period, and sections.
2. System presents the proposed evidence set and readiness warnings.
3. Teacher includes/excludes evidence.
4. System creates clearly labeled suggested language.
5. Teacher reviews, edits, accepts, or rejects each section.
6. System produces clean copy/paste text or an approved document export.
7. Draft history and source receipts remain available.

### Supported suggestions

- Present Levels: strengths, current performance, evidence, need, impact, effective supports, and goal connection.
- Changes in Current Functioning: prior state compared with verified current evidence without invented causation.
- Goals: continue, revise, replace, retire, or collect more data; include condition, skill, baseline, criterion, measurement, reporting schedule, need, and evidence.
- Form C: use verified goals, preferences, assessments, activities, products, and teacher-confirmed student statements; never fabricate family input, agency involvement, or commitments.

The workbench must distinguish independent, supported, inconsistent, not-yet-demonstrated, and insufficient-evidence performance.

### Outputs

- **Teacher working draft:** evidence links, dates, readiness indicators, conflicts, missing information, and questions.
- **Clean draft:** polished copy/paste-ready language without internal annotations.

Drafts must use “the student” or an explicit non-identifying placeholder. They must not require or generate student PII.

Neither output is official until reviewed through the required process.

## 10. Curriculum Architecture for Library and Work

The planning workbook demonstrates this reusable hierarchy:

curriculum collection/book → instructional arc → week → daily lesson → assessment/product → student evidence.

A curriculum package may contain collection metadata, course/book relationships, chapter/segment sequence, arcs/stages, weekly/daily plans, points, row type, theme/focus, standards, expected evidence, differentiation guidance, and linked materials.

Library owns reusable content. Work owns scheduled and targeted use. Issuing work creates a stable historical instance.

Packages should support draft, validation, teacher review, activation, versioning, retirement, and historical preservation. Spreadsheets may be staging/import sources; direct two-way live synchronization is not the default. Reinisch Classroom becomes the daily operational system after validated publication.

`RC-2026-27-01` established and production-verified registry v2 while preserving the four legacy collections/routes. Future collection dry runs should build on that seam without title-specific changes scattered through unrelated files.

## 11. Security, Privacy, and Governance

1. Reinisch Classroom uses code-only student identity for this architecture.
2. Do not store or require names, addresses, birth dates, guardian information, official student IDs, personal contact information, or code-to-name mappings.
3. Do not expose sensitive student/IEP data through public files, curriculum manifests, client logs, telemetry, or unauthenticated routes.
4. New protected features use authenticated server-side access patterns.
5. Do not broaden existing `anon` database access as a shortcut.
6. Auth, RLS, schema, Netlify configuration, and secrets require separately authorized slices.
7. Preserve source, date, reviewer, verification status, and revision history where appropriate.
8. Never place student PII, credentials, official IEP documents, or code-to-name mappings in development prompts, tests, project chat, or runtime AI context.
9. Any future runtime AI context requires a separately approved privacy/security design and may use only de-identified coded information limited to selected dates, sections, and evidence—never PII or an entire record/archive.
10. Preserve enough provenance to explain suggestions without unnecessarily logging sensitive narrative content.

## 12. Accessibility and Usability

- Maintain keyboard access, labels, focus, contrast, large targets, and screen-reader-aware structure.
- Never communicate verification or risk by color alone.
- Use progressive disclosure rather than displaying every section at once.
- Keep Overview useful when deeper records are incomplete.
- Provide actionable validation messages.
- Support ordinary midyear onboarding without a school-year reset.

## 13. Phased Direction

### Phase 0 — Stabilize and verify

Complete curriculum flexibility, plan archive/reset, verify the classroom loop, and diagnose Students/observational-progress defects.

### Phase 1 — Trustworthy foundations

Repair confirmed defects; verify goal, observation, and assignment-derived evidence; define evidence/verification states; preserve current progress visibility.

### Phase 2 — Student workspace and onboarding

Progressive profile, Quick Start/Guided Setup, goals, supports, services, dates, review status, archive, and transfer handling.

### Phase 3 — Expanded special-education record

Present Levels, Changes, Behavior/BIP summary, Form C/transition, source register, and review queue.

### Phase 4 — Curriculum planning integration

Library packages, Work planning/calendar, curriculum-to-assignment drafting, and stable scheduled/issued snapshots.

### Phase 5 — Evidence-grounded drafting

Readiness checking, evidence selection, source receipts, teacher-reviewed suggestions, and working/clean exports.

Phases describe dependencies, not promises that each phase is one release.

## 14. Future Slice Requirements

Every implementation slice must identify one goal, exact routes/files, preserved behavior, fake-data tests, privacy/security boundary, migration risk, stopping point, and proof that unrelated features were untouched.

Rendering alone is not success. Relevant data flow, authorization, historical preservation, and teacher-visible behavior must be verified in proportion to risk.

## 15. Not Authorized Here

This document does not authorize production-data changes; spreadsheet imports; IEP-document upload/extraction; schema, migration, RLS, auth, session, Netlify, or environment changes; AI calls; official IEP generation without teacher review; replacement of the official IEP system; broad Teacher Center redesign; or implementation outside the active stabilization order.

## 16. Planning Sources and Final Direction

Inputs include the production-verified registry v2 checkpoint; both 2026–27 planning workbooks; current Students, goals, progress, assignment, Student Portal, grading, and security documentation; the stabilization Source of Truth and Parking Lot; and the requirement for recurring onboarding with incomplete/delayed records.

The spreadsheets are design and staging sources, not automatically the production source of truth.

The intended connected workflow is:

Library curriculum → Work planning/assignment → Student completion → Review/grade → Teacher-verified evidence → Progress/reporting → Teacher-reviewed documentation draft.

Students is the operational learner workspace connecting that loop. Onboarding must be recurring, progressive, and usable before every field is complete. Reinisch Classroom assists teacher judgment; it does not replace it.
