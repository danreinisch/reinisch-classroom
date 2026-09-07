# Sentence Workshop lessons

Sentence Workshop adds guided editing to Language Arts Skill Builder. Sentence boundaries targets placing a period between two complete sentences and capitalizing their beginnings. Directions explicitly require two sentences; the final period is supplied. Sentence endings adds periods, question marks, and exclamation marks matched to a message's purpose. Fragments & Run-ons adds missing words, repairs joins between complete thoughts, and preserves sentences that already work. Commas in lists adds item separators, multiword item grouping, and two-item lists. These lessons use authored messages and edits; they do not evaluate unrestricted writing or cover all punctuation rules.

A regular-sized card in the existing skill grid opens the module on demand. Both Skill Builder entry copies use the same versioned assets. The workshop has its own visit-only state and results, separate from the existing 140-question score. Returning to the menu preserves workshop work; End/clear, reload, departure, and restored history clear it. The existing Viewer and dialog contracts are reused.

## Sentence boundaries: content and routing

There are two introductory demonstrations and 22 original tasks: eight guided, six reserved checks, four shorter examples, and four message edits. A session uses a subset. Content lives in `site/assets/js/sentence-workshop-content.js`; the literal separator identifies an authored boundary, not a general English parser. An independent key in the unit test checks the intended boundaries.

- Two completed guided tasks lead to fresh checks. Guided success can include corrections.
- Two fresh first-try successes without instructional hints lead to two message edits.
- Reminder, boundary/capital highlighting, and worked examples are available. Ordinary read-aloud and the marks/capitals reader do not count as hints.
- Two distinct unsuccessful submissions pause checking and offer an explicit retry, a worked example, or navigation to another task. Repeated checks of an unchanged edit do not consume another attempt.
- After a demonstration, a shorter task is offered, with at most two prerequisite detours. Persistent difficulty has a clear finish and a help suggestion.
- Automatic progression uses unused examples. Students can revisit opened tasks through Previous/Next; this does not make those tasks fresh again. Exhausting the checks ends the lesson without inventing success.
- Students can finish early. The summary distinguishes independent fresh checks, supported completed edits, and demonstrated answers. An unattempted item is not a mistake.

These are provisional routing rules for a classroom pilot. They are not a validated mastery standard. The content assumes the other words in these selected tasks use lowercase initials; that statement must not be generalized to proper nouns or other capitalization rules.

## Sentence endings: content and routing

The second lesson has three introductory models and 30 original tasks: nine guided, nine reserved checks, six shorter tasks, and six applied messages. A normal independent path uses three guided tasks, three fresh checks, and four applied tasks. A session uses only part of the bank. Content and its checker live in `site/assets/js/sentence-workshop-endings.js`.

Each task supplies a complete message and its purpose. Students place one ending mark, hear their edit with or without the mark named, and check the choice. Context explicitly distinguishes a calm tone from a forceful or excited tone. Two tasks accept either a period or an exclamation mark and explain the different effects. Direct requests, statements containing question words, and exclamations beginning with “What” prevent reliance on the first word alone. The intended answer sets have a separate literal review key in the unit tests.

Three completed guided edits open fresh checks. Moving to applied messages requires first-try success without instructional hints in each of three purposes: direct questions, calm statements/directions, and strong emphasis. Several successes in two purposes cannot substitute for the third. Results describe this visit; the coverage rule is provisional, not a mastery claim. Help, distinct-attempt limits, and finite exits follow the original lesson rules. A shorter task matches the purpose that needed support, and at most two detours are offered.

Students can switch between lessons without losing a draft or summary. Results remain separate by lesson. End/clear, reload, and departure clear every lesson. The Skill Builder menu retains a single regular-sized Sentence Workshop card.

Content references: [Purdue OWL punctuation overview](https://owl.purdue.edu/owl/multilingual/multilingual_students/punctuation/index.html) and the [Australian Government Style Manual on direct and indirect questions](https://www.stylemanual.gov.au/grammar-punctuation-and-conventions/punctuation/question-marks). These support the punctuation distinctions, not the software's routing thresholds or instructional effectiveness.

## Fragments & Run-ons: content and routing

The third lesson has three introductory models and 35 original tasks: ten guided, ten reserved checks, ten shorter tasks, and five applied messages. A normal independent route uses five guided tasks, five fresh checks, and three message edits. The remaining examples support additional practice; a visit does not have to exhaust the bank. Content and the checker live in `site/assets/js/sentence-workshop-repairs.js`.

Students try authored word additions and read the resulting draft. Feedback distinguishes a missing subject, an incomplete verb, and a dependent thought that needs a main clause. Context supplies the intended meaning. Complete-sentence tasks include short directions with an understood subject and longer sentences with a shared subject and two actions. Students can keep a draft that already works.

For fused sentences and comma splices, students select a quiet blank space between words, then choose a period with capitalization, a semicolon, or a comma with an appropriate supplied coordinating conjunction. All three methods are accepted at the correct boundary. A comma alone receives specific feedback; selecting a valid method at an incorrect location is also checked. The draft and resulting message stay visible. Read controls do not submit an answer. The period tool supplies capitalization so this lesson focuses on the repair location and method; it does not independently assess capitalization production.

Five completed guided tasks open fresh checks. Applying the skill to messages requires a fresh first-try success without instructional hints in each of five areas: subjects, verbs, dependent thoughts, joins, and sentences needing no change. Successes in four areas cannot replace the fifth. This is a provisional coverage rule for practice, not evidence of mastery. A demonstration leads to a different shorter task in the same area, with at most two detours. Repeated checks of an unchanged edit do not consume retries, first attempts remain intact, and exhausting fresh examples ends the visit honestly.

The message tasks include a late-arrival note, a workplace update, and visitor instructions. The editor accepts supplied operations; it is not an open-ended grammar checker. Future classroom review should look for transfer to students' own writing and whether five guided tasks are an appropriate starting length.

Grammar references: [Purdue OWL on fragments](https://owl.purdue.edu/owl/general_writing/mechanics/sentence_fragments.html) and [Purdue OWL on run-ons and comma splices](https://owl.purdue.edu/owl/general_writing/punctuation/independent_and_dependent_clauses/runonsentences.html). Examples and feedback are original. The references support the grammar distinctions, not the lesson's routing thresholds.

## Accessibility and implementation

Words and punctuation gaps use native buttons with keyboard operation and pressed-state labels. Empty gaps are quiet underlined spaces, with no plus signs or dashed boxes; directions ask students to read the message before placing a period. The spaces keep their 44-pixel touch targets and visible keyboard focus. Feedback is text with a live-region announcement and focus placement. Hints have textual explanations as well as outlines. Narration can name punctuation and initial-letter case. Missing speech displays a text notice and preserves the task. No native alert or confirm is needed in the workshop.

The browser adapter owns rendering and draft edits; the engine owns attempts, instructional help, and finite routing. A generation guard prevents a late module load from reopening a cleared visit. Navigation to another skill during loading also takes precedence. CSS is scoped to the workshop and launcher.

The original Skill Builder readers now show an on-screen notice when speech is absent, incomplete, or throws. They preserve answers and writing, and do not depend on native alerts inside Viewer. The ending mark stays attached to the last word when the sentence wraps on a narrow screen.

## Commas in lists: content and routing

The fourth lesson has three introductory models and 23 original tasks: five guided, nine reserved checks, six shorter tasks, and three applied messages. A normal independent route uses three guided tasks, three fresh checks, and three applied edits. Content and its checker live in `site/assets/js/sentence-workshop-commas.js`.

Students add or remove commas by choosing quiet blank spaces between supplied words. Words and the final period remain fixed. Some drafts already work and can be checked unchanged. Lists include single-word objects, multiword objects, and shared-subject actions joined by `and` or `or`. Feedback distinguishes missing separators, commas inside one item, misplaced commas beside the conjunction, and unnecessary commas in two-item lists.

For the authored clear lists of three or more items, both versions—with and without the final Oxford comma—are accepted. Models and worked examples use the Oxford comma, while directions, feedback, and hints explain the accepted alternative. All earlier item separators remain required. Two-item lists need no comma here. Ambiguous lists, appositives, introductory phrases, independent-clause joins, dates/addresses, and unrestricted writing are outside this lesson; no general comma parser is implied. Students can follow a teacher's requested style in other writing.

Three completed guided tasks open fresh checks. Applied work requires fresh first-try success without hints in each of three targets: separating single-word items, keeping multiword items together, and recognizing two-item lists. Repeated success in two targets cannot replace the third. The summary names coverage and support from this visit; the rule is a provisional routing threshold, not a mastery standard. Shorter tasks match the target needing help, at most two detours are offered, and the finite exit and unchanged-submission rules remain in effect. Read-aloud and the comma-position reader do not count as instructional help.

All five lessons preserve their individual draft and summary during a visit and clear together. Both entry pages share the `20260906-sw8` assets; the menu retains one regular-sized workshop card and the separate 140-question score.

Content references: [Purdue OWL list-comma rules](https://owl.purdue.edu/owl/general_writing/punctuation/commas/extended_rules_for_commas.html) and [Chicago Manual of Style on when the serial comma is necessary](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Commas/faq0077.html). These ground punctuation choices; they do not validate the lesson's routing rules or learning effectiveness.

## Commas after sentence openings: content and routing

The fifth lesson has four models and 32 original tasks: eight guided, twelve reserved checks, eight shorter tasks, and four applied messages. Content and the checker live in `site/assets/js/sentence-workshop-openings.js`. It reuses the quiet blank-space comma editor, read-aloud controls, visit summaries, retry, previous/next, and skipping.

Four targets cover yes/no response words, introductory time or condition clauses, attached final time or condition clauses, and short introductory time phrases. Paired examples move the same clause from the beginning to the end so students examine sentence structure. Initial drafts include missing commas, misplaced commas, and correct sentences needing no change. Feedback identifies a split opening, a split main message, a missing opening separator, or an unnecessary comma before an attached final clause.

Both versions of each authored short-phrase sentence are accepted: with a comma after the phrase or with no comma. The model, hint, worked example, and feedback explain the alternative. Final-clause examples use integrated time/condition meanings; this does not teach that all final dependent clauses forbid commas. Contrast clauses, ambiguous readings, introductory participles, long stacked phrases, dates, addresses, and unrestricted punctuation parsing are outside this slice.

Four completed guided tasks open fresh checks. Applied work requires a fresh first-try success without instructional hints in every target; three kinds cannot substitute for the fourth. A normal independent route is four guided tasks, four fresh checks, and four practical messages about classroom directions, appointments, volunteering, and work. This routing threshold reports practice coverage, not mastery. Shorter tasks match the area needing support; the two-detour limit and finite exits remain. Retrying preserves original first submissions and support exposure, and navigating or skipping does not submit work.

Content references: [Purdue OWL on introductory clauses and phrases](https://owl.purdue.edu/owl/general_writing/punctuation/commas/commas_after_introductions.html), [Purdue sentence punctuation patterns](https://owl.purdue.edu/owl/general_writing/punctuation/sentence_punctuation_patterns.html), [Chicago on short introductory phrases](https://cmosshoptalk.com/2016/02/23/chicago-style-workout-2-commas-with-introductory-words-and-phrases/), and [Australian Government Style Manual on introductory response words](https://www.stylemanual.gov.au/grammar-punctuation-and-conventions/punctuation/commas). All task sentences are original. These references support the punctuation choices, not the learning effectiveness or routing thresholds.

## Starting drafts and new tasks

Teacher review identified apparent carryover: the first response task needs a comma at gap 1, and the next task had an authored incorrect comma at the same gap. Its starting draft therefore looked like the student's previous selection survived navigation. The following final-clause task repeated the same ambiguity at gap 4. These were supplied punctuation, not shared answer state.

The opening lesson's first four guided tasks now start with empty comma spaces. Later punctuation-repair drafts retain their reviewed initial commas and explicitly say **Starting draft · punctuation provided** and **This draft includes commas to review. Add, remove, or keep them.** Unpunctuated starting drafts say so too. The note is read with the directions and is attached to the comma editor's accessible description. This explanation applies to both comma lessons.

New tasks use their own starting drafts; revisiting a task restores only that task's edits. The regression test reproduces the reported gap-1 ambiguity before the correction, then checks fresh defaults and backward/forward isolation across all five lessons on both entry routes, including the blank opening/final-clause sequence and later provided punctuation. Skipped drafts still do not become attempts.

## Retry and task navigation

Teacher review found that the two-attempt limit and worked-example state could leave students unable to edit the same task again or revisit earlier work. All five lessons now share a visible task-navigation row:

- **Try this one again** reopens the current draft after a submission or worked example. It preserves the original submissions, hint exposure, and demonstrated status. Each explicit retry allows another two distinct checks; unchanged repeated checks within that round still do not consume attempts.
- **Previous** restores the prior opened task, including its draft, feedback, and hints. **Next** moves forward through already-opened tasks before the engine creates another example. Revisiting does not reset an item or create fresh evidence.
- **Skip for now** opens another task without submitting the current draft. An unsubmitted task remains unattempted. Guided and fresh-coverage requirements remain in force; skipping every available example leads to a finite summary.
- Summaries offer **Back to last task**. Early finish can be resumed. A completed/exhausted visit can be reviewed without reopening the automatic routing loop.

Task position describes the examples opened in this visit. Navigation retains shorter-task return paths and the two automatic detour limit. A corrected answer after a worked example counts as an edit completed with support; viewing the example alone does not count as a completed edit. Repeating an already recorded task cannot add a second item or replace its original first try. All task history remains in visit memory and clears with the existing clear/reload/departure behavior.

## Verification

- Starting-draft clarification: 34 workshop and 16 original Skill Builder checks passed. All 39 Chromium tests passed with no failures, skips, or flaky results. The new two-route regression verifies new-task defaults and saved-draft isolation across all five lessons, blank initial guided comma tasks, explicit supplied-punctuation instructions and narration, and zero attempts from skipped work. Fresh-sentence and supplied-punctuation screenshots were reviewed. Targeted lint, inline syntax, matching entry pages, and original DATA checks passed.

- Sentence openings: all 34 workshop unit checks and 16 original Skill Builder checks passed. All 37 Chromium tests passed with no failures, skips, or flaky results. New coverage checks all selectable comma combinations for 32 tasks against independent literal answers, both optional styles, four-target fresh coverage, matching shorter tasks, preserved first submissions, bounded recovery, retry after misses/models, draft and feedback restoration, all-five-lesson clear/reload/history on both entry routes, narrow-screen keyboard and speech fallback, and the actual Viewer sandbox. Desktop, mobile, and optional-comma support screenshots were reviewed. Targeted ESLint, inline syntax, matching entry pages, and unchanged original DATA checks passed. The branch starts from main `310aa42a`, preserving the concurrent student voice-typing update.

- Teacher-reported retry/navigation repair: all 30 workshop unit checks and 16 original Skill Builder checks passed. All 33 Chromium tests passed with no failures, skips, or flaky results. New cases cover reopening after two wrong submissions and after a worked example in all four lessons, first-submission preservation, supported corrections, backward/forward draft and feedback restoration, unchanged item counts, shorter-task return paths, skipped/unattempted work, early-finish resume, exhausted-history review, per-lesson switching, clear on both entry routes, and mobile keyboard/touch use. Desktop and mobile navigation screenshots were reviewed. Targeted lint, inline syntax, matching entry copies, and unchanged original DATA checks passed. Main advanced to `062e788b` with a Fractions toolkit repair outside this change's scope.

- Commas in lists: 26 workshop unit checks and 16 original Skill Builder checks passed. All 26 workshop Chromium tests passed with no failures, skips, or flaky results. Browser coverage includes both serial-comma styles, missing and extra marks, multiword-item feedback, unchanged correct drafts, narration, supported recovery, four-lesson resume/clear/reload/history on both entry routes, keyboard/mobile use, and commas inside the real Viewer sandbox. Desktop, mobile, and support screenshots were reviewed. The independent editorial key checks every selectable comma combination for all 23 tasks, invalid inputs, three-target fresh coverage, unchanged-submission handling, matching shorter tasks, and finite exits. Targeted ESLint and inline JavaScript syntax checks passed; the HTML copies match and original question/writing DATA is unchanged. Main advanced to `710ac4ac` with Observation Center changes outside these eight files; that update was fast-forwarded without overlap.

Run `node tests/sentence-workshop.test.cjs` (also registered in `test:unit`), `node tests/language-arts-skill-builder.test.cjs`, and `node tests/student-activities-word-search-contract.test.cjs`. Run Playwright on `tests/sentence-workshop.spec.js` and `tests/student-activities-word-search.spec.js` using the repository's local static-server setup.

Browser fixtures use synthetic sessions, block external requests, and stub server functions. They cover supported and independent paths, small-screen keyboard use, both mirrored routes, speech fallback, loading failure, clear/load races, the Viewer sandbox, and return to Activities. The speech mock verifies requested text, not the sound of a particular device's voice.

Teacher review should check whether students understand the controls, use the help to recover, and apply the skills to new examples. Actual classroom effectiveness and device-specific voice quality remain to be evaluated. Review the pilot before adding broader punctuation, saved student progress, or formal evidence integration.

## Local review results

- Fragments & Run-ons expansion: all 21 workshop unit checks and 16 original Skill Builder checks passed. All 22 workshop Chromium tests passed with zero failures, skips, or flaky results. The new tests cover every authored answer against a separate editorial key, all join locations and methods, five-area fresh coverage, finite support, the full 13-task route, both mirrored routes, three-lesson resume/clear, read controls, and mobile keyboard/touch operation. Desktop/mobile screenshots were reviewed. Targeted ESLint, inline syntax, original DATA preservation, and mirrored-copy checks passed. Assets use `20260906-sw4`.
- Release 1 merged in PR #1459 as `965b19ee3d1bbd51fda94f60d6f4cbc8ea3f7238`. Both production HTML routes and all four workshop assets returned HTTP 200 and matched that commit byte for byte on September 6, 2026. The concurrent Pythagorean repair was preserved; its 31 focused checks passed after resolving the shared test-command registration.
- Sentence endings expansion: 16 workshop unit checks and 16 original Skill Builder checks passed. All 16 workshop Chromium checks passed, including the complete endings route, supported recovery, multiple accepted tones, per-lesson resume/clear on both routes, keyboard/mobile use, narration, and the original readers' speech fallback. Desktop/mobile screenshots were reviewed. No new package command or dependency was needed.

- Teacher review follow-up: removed the plus signs and boxed gap cues, and moved the launcher into one regular skill-grid card. Re-ran all 27 workshop/Skill Builder unit checks and all 10 workshop Chromium tests successfully. Browser checks include equal card sizing, unchanged card count after returning, blank-space keyboard/touch access, and matching visible/spoken directions. Reviewed updated menu and editor screenshots.
- 11 workshop unit checks, 16 existing Skill Builder checks, and 5 Activities contract checks passed.
- 14 Chromium tests passed: 10 workshop checks and 4 existing Activities/Viewer regressions. A temporary local configuration used Python's static server at a loopback URL because the repository's `serve` process could not enumerate network interfaces in this runtime. The repository Playwright configuration was unchanged.
- Full ESLint passed with zero errors (157 existing warnings); the asset-path scan passed. New files were formatted and changed inline JavaScript was syntax-checked.
- The full unit command stopped at three date-label assertions in the unchanged `tc-library-helpers.test.cjs`. Running the exact main-branch file separately reproduced its 98-pass/3-fail result. The full suite is therefore not reported as passing.
- The existing inline-script policy scan remains red (2,560 findings in 275 files). Each changed activity copy still has the same one inline-script finding and zero inline-event-attribute findings as main. No HTML elsewhere changed.
- Original question/writing data are byte-identical to the baseline data; both activity copies match. The math toolkits, Student Portal runtime, Viewer runtime, authentication, database, and deployment settings are outside this change.
