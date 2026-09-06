# Sentence Workshop pilot

Sentence Workshop adds guided editing to Language Arts Skill Builder. Its initial targets are placing a period between two complete sentences and capitalizing their beginnings. Directions explicitly require two sentences; the final period is supplied. It does not evaluate unrestricted writing or cover all punctuation rules.

A regular-sized card in the existing skill grid opens the module on demand. Both Skill Builder entry copies use the same versioned assets. The workshop has its own visit-only state and results, separate from the existing 140-question score. Returning to the menu preserves workshop work; End/clear, reload, departure, and restored history clear it. The existing Viewer and dialog contracts are reused.

## Instructional content and routing

There are two introductory demonstrations and 22 original tasks: eight guided, six reserved checks, four shorter examples, and four message edits. A session uses a subset. Content lives in `site/assets/js/sentence-workshop-content.js`; the literal separator identifies an authored boundary, not a general English parser. An independent key in the unit test checks the intended boundaries.

- Two completed guided tasks lead to fresh checks. Guided success can include corrections.
- Two fresh first-try successes without instructional hints lead to two message edits.
- Reminder, boundary/capital highlighting, and worked examples are available. Ordinary read-aloud and the marks/capitals reader do not count as hints.
- Two distinct unsuccessful submissions on one task lead to a worked-example option. Repeated checks of an unchanged edit do not consume another attempt.
- After a demonstration, a shorter task is offered, with at most two prerequisite detours. Persistent difficulty has a clear finish and a help suggestion.
- Examples do not repeat in the same visit. Exhausting the checks ends the lesson without inventing success.
- Students can finish early. The summary distinguishes independent fresh checks, supported completed edits, and demonstrated answers. An unattempted item is not a mistake.

These are provisional routing rules for a classroom pilot. They are not a validated mastery standard. The content assumes the other words in these selected tasks use lowercase initials; that statement must not be generalized to proper nouns or other capitalization rules.

## Accessibility and implementation

Words and punctuation gaps use native buttons with keyboard operation and pressed-state labels. Empty gaps are quiet underlined spaces, with no plus signs or dashed boxes; directions ask students to read the message before placing a period. The spaces keep their 44-pixel touch targets and visible keyboard focus. Feedback is text with a live-region announcement and focus placement. Hints have textual explanations as well as outlines. Narration can name punctuation and initial-letter case. Missing speech displays a text notice and preserves the task. No native alert or confirm is needed in the workshop.

The browser adapter owns rendering and draft edits; the engine owns attempts, instructional help, and finite routing. A generation guard prevents a late module load from reopening a cleared visit. Navigation to another skill during loading also takes precedence. CSS is scoped to the workshop and launcher.

## Verification

Run `node tests/sentence-workshop.test.cjs` (also registered in `test:unit`), `node tests/language-arts-skill-builder.test.cjs`, and `node tests/student-activities-word-search-contract.test.cjs`. Run Playwright on `tests/sentence-workshop.spec.js` and `tests/student-activities-word-search.spec.js` using the repository's local static-server setup.

Browser fixtures use synthetic sessions, block external requests, and stub server functions. They cover supported and independent paths, small-screen keyboard use, both mirrored routes, speech fallback, loading failure, clear/load races, the Viewer sandbox, and return to Activities. The speech mock verifies requested text, not the sound of a particular device's voice.

Teacher review should check whether students understand the controls, use the help to recover, and apply the skills to new examples. Actual classroom effectiveness and device-specific voice quality remain to be evaluated. Review the pilot before adding broader punctuation, saved student progress, or formal evidence integration.

## Local review results

- Teacher review follow-up: removed the plus signs and boxed gap cues, and moved the launcher into one regular skill-grid card. Re-ran all 27 workshop/Skill Builder unit checks and all 10 workshop Chromium tests successfully. Browser checks include equal card sizing, unchanged card count after returning, blank-space keyboard/touch access, and matching visible/spoken directions. Reviewed updated menu and editor screenshots.
- 11 workshop unit checks, 16 existing Skill Builder checks, and 5 Activities contract checks passed.
- 14 Chromium tests passed: 10 workshop checks and 4 existing Activities/Viewer regressions. A temporary local configuration used Python's static server at a loopback URL because the repository's `serve` process could not enumerate network interfaces in this runtime. The repository Playwright configuration was unchanged.
- Full ESLint passed with zero errors (157 existing warnings); the asset-path scan passed. New files were formatted and changed inline JavaScript was syntax-checked.
- The full unit command stopped at three date-label assertions in the unchanged `tc-library-helpers.test.cjs`. Running the exact main-branch file separately reproduced its 98-pass/3-fail result. The full suite is therefore not reported as passing.
- The existing inline-script policy scan remains red (2,560 findings in 275 files). Each changed activity copy still has the same one inline-script finding and zero inline-event-attribute findings as main. No HTML elsewhere changed.
- Original question/writing data are byte-identical to the baseline data; both activity copies match. The math toolkits, Student Portal runtime, Viewer runtime, authentication, database, and deployment settings are outside this change.
