# OBS-NQ1 — Non-Question Evidence Contract Engine

Date: 2026-09-07

## Purpose

OBS-NQ1 turns the reviewed non-question goal audit into a machine-readable contract layer before any new capture UI is added.

The contract layer answers one question first:

> What exactly does one legitimate evidence event mean for this goal?

This slice does **not** change IEP wording, mastery criteria, official progress math, reporting cadence, database schema, or existing Observation Center capture behavior.

## Source of truth for this slice

The reviewed recommendations in:

- `docs/student-portal/non-question-evidence-contracts-review-2026-09-07.md`

were encoded into:

- `site/data/observation-evidence-contracts-2026-27.json`

The registry contains the 20 reviewed Q1 non-question goals across 13 students.

## Generic event types

The engine deliberately uses a small reusable set rather than twenty custom mini-apps:

- `opportunity` — one authentic opportunity scored met/not met, with No Opportunity only when the opportunity genuinely did not occur
- `count` — a numeric count or rubric value such as prompt count
- `performance_trial` — one defined task, oral-reading trial, schedule performance, or collection window
- `work_sample` — teacher review of an actual assignment artifact against the IEP criterion
- `composite` — one event requiring multiple visible components rather than collapsing them into a misleading single question
- `objective_driven` — parent goal is not directly scored; measurable child-objective evidence is authoritative
- `benchmark` — parent evidence is entered only when the named benchmark exists

## Capture sources

Contracts also distinguish where the evidence should originate:

- `observation_center`
- `teacher_review`
- `objective_evidence`
- `benchmark`
- `authoritative_record`

That distinction prevents Observation Center from becoming a duplicate attendance system, gradebook, or benchmark database.

## Important reviewed special cases

### S060.CG1

Remains one composite reading-performance trial containing:

1. independent reading
2. comprehension participation
3. regulation/strategy use

A correct comprehension question alone is not sufficient evidence for the parent goal.

### S069.CG1

Parent-level evidence remains MAP Reading RIT benchmark evidence only. More frequent classroom evidence belongs to the active child objectives rather than filler parent dots.

### S070.CG1 and S070.CG4

Both remain objective-driven. The engine explicitly disables generic direct parent capture.

### S071.CG1

The contract records `events_per_period: 2` and `high_frequency: true`. OBS-NQ2 must therefore provide an unusually fast capture path.

## Legacy compatibility

`site/web/observation-evidence-contract.js` can normalize the four legacy Observation Center categories into the same contract vocabulary:

- `session_outcome` → `opportunity`
- `tally` → `performance_trial`
- `prompt_count` → `count`
- `behavior_checklist` → `composite`

An embedded future `goal.observation_config.evidence_contract` takes precedence over the reviewed registry, and the reviewed registry takes precedence over legacy inference.

This lets the next slices adopt the contract engine without breaking existing observation goals.

## Validation rules

The engine rejects incomplete or misleading contract shapes, including:

- unsupported event types or capture sources
- invalid event frequencies
- empty composite contracts
- benchmark contracts without a named metric
- objective-driven parent contracts that accidentally permit direct parent scoring
- Observation Center contracts with no defined fields/components

## Production audit before implementation

A read-only production query on 2026-09-07 verified all 20 reviewed goal codes are active and confirmed their current measurement types/configuration states.

No production data was modified in OBS-NQ1.

## Acceptance criteria

OBS-NQ1 is complete when:

1. all 20 reviewed goals have one machine-readable evidence contract;
2. all contracts pass generic validation;
3. legacy observation categories normalize without breaking their existing meaning;
4. S060, S069, S070, and S071 special cases are explicitly protected by tests;
5. no UI, schema, auth, RLS, student record, assignment record, or goal-progress value is changed.

## Next slice

**OBS-NQ2 — Fast Capture UI** should consume this engine to add the minimum required Observation Center controls for the reviewed `observation_center` contracts while keeping high-frequency capture to two or three taps whenever possible.
