# Student goal progress and question review

The Student Portal connects recorded goal progress to the work that produced it. The quarter calculation remains the existing server-owned calculation; an individual high score does not establish IEP mastery.

## Student experience

- Compact goal cards show the quarter value, recorded target when suitable, and check count. Full official goal wording remains available.
- Explore a quarter in the current or previous school year using the configured quarter calendar. Search assignment titles or dates, then move through three checks on a narrow card or six on a wider card.
- Select a point to load that assignment's work. See one question at a time, the student's answer, released correct answer/result, and available teacher feedback. A filter focuses on released answers needing review.
- Objective goals retain the existing equal-weight parent rollup. Their chart shows evidence for a selected objective, clearly separate from an academic question score. Unmeasured skills stay No Data.
- Manual/unlinked checks still count. The interface says when no question work is linked; it never guesses links from a shared date or title.
- The dashboard's assignment-grade chart is contained and labeled “Recent assignment scores.” Its grade reference is not described as an IEP goal.

## Evidence and access

`teacher-goal-progress` invokes the new evidence helper only after its existing teacher, active student/goal, instance ownership, class, and enrollment checks. The helper reads the latest stored submission, scores, assignment items and mappings, then reconciles question rows by exact instance + goal + item identity before saving the parent checkpoint. Null/unscored items and foreign goals/items do not become evidence. Repeat reviews update the existing canonical rows. Parent progress values and school-year rules are unchanged.

Student reads continue through the signed `student-goal-explanations` endpoint. Correct answers, question scores and feedback require the existing Graded/Reviewed release state. Teacher feedback comes from the exact current submission/item answer, never private goal notes. Saved question snapshots that disagree with the current submission are withheld, while recorded goal math remains authoritative. Non-instructional evidence stays excluded.

## Volume

- Parent checkpoints, parent question rows and objective evidence use stable ordered reads beyond PostgREST's response limit. Later-page errors do not return a partial average.
- The initial `summary` response omits question data. Opening a goal requests a compact `timeline`; selecting work requests `work` for one assignment or one objective evidence record. Opaque HMAC references are bound to the authenticated student and exact server-owned provenance. A fabricated or out-of-quarter reference cannot select work.
- Instance/item lookups are batched to keep query URLs bounded. Parent question lookup in the calculation helper uses an index rather than rescanning every question for every checkpoint.
- The DOM contains only the current chart page and one question. Timeline and selected-work caches are bounded, scoped to the authenticated render, and failed requests can be retried.
- The timeline covers active goals and the current/previous school-year quarters. This is not a new archive or an annual IEP reporting calculation. No historical records are relinked or backfilled automatically.

## Verification

`npm run test:goal-review` exercises the real teacher-save to student-read chain against synthetic REST data, release gating, exact provenance, repeated review, failure behavior, legacy contracts, and 1,205-record parent and objective calculations. `npm run test:goal-review:ui` covers the actual Student Portal, lazy timeline/work loading, large-quarter DOM bounds, search, historical quarters, keyboard/touch controls, light/dark themes, objective separation, and fallback states. The existing dictation browser suite covers the shared assignment runtime.

The CI unit suite includes the pipeline regression, and the existing browser smoke job runs the goal-review browser suite. No database migration, RLS/auth policy change, dependency, Netlify configuration change, or production student-data write is required.
