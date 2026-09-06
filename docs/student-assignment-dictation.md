# Student assignment dictation

Adds optional voice typing to the existing Student Portal assignment panel.

## Student behavior

- Choose **Dictate** beside an editable response, allow the browser microphone prompt, and speak. Choose **Stop**, check the words, and edit as needed.
- Final recognized words are inserted at the cursor without replacing existing writing. A selected range is preserved; new words go after it. Interim words appear separately and are not saved as answers.
- Typed edits stop dictation. Changing days, activating read-aloud, closing the panel, hiding the tab, losing window focus, or disabling/removing the field ends the current session. Late callbacks cannot write into another response.
- Selecting Submit while listening first finishes dictation. The student reviews the resulting text and selects Submit again; dictation never submits automatically.
- Unsupported browsers, blocked permissions, unavailable microphones, and service errors show a typing fallback. Permission is requested only following the student's Dictate action.
- Writing Builder shows three supporting details in every paragraph as soon as it opens. The third detail includes its transition selector, dictation control, word count, and feedback. Clear Builder empties all three details while keeping them visible; Transfer to Response includes each completed detail in order and autosaves the response.

## Coverage and boundaries

The shared helper decorates editable assignment textareas, including Day 4 responses, short answers, and single/multiple-paragraph Writing Builder fields. It also decorates same-origin and uploaded `srcdoc` HTML assignments, including question-marked text inputs. It preserves field names and IDs and emits normal `input`/`change` events so existing save and submission handlers remain authoritative.

The parent Student Portal owns the recognition instance, including when the target field is inside an accessible iframe. Cross-origin documents and arbitrary rich-text editors are not inspected or modified; they retain their existing typing/device input options. No new audio upload endpoint, recording store, submission type, authentication path, database change, or dependency is introduced.

Native browser speech recognition is not universally supported. Some browsers process audio with an online speech service; this is disclosed under **About voice typing** before use. RC does not record or save audio. See [MDN's SpeechRecognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

The existing global `microphone=()` policy requires narrow exceptions for `/student/` and `/student/index.html`: `microphone=(self)`. Camera/geolocation remain disabled, and no external origin is allowed. Other routes keep the existing global policy. Verify the effective response on the Netlify preview because [Netlify's custom-header handling](https://docs.netlify.com/manage/routing/headers/) occurs outside the local static test server.

Two adjacent defects found by the integration checks are fixed in the same writing workflow:

1. Duplicate assignment-card handlers could open two panels with duplicate response IDs. An opening guard preserves one panel, including after asynchronous graded-detail loading.
2. Writing Builder's Transfer action changed the response value without notifying autosave. It now emits the ordinary input event for typed and dictated drafts.

## Verification

- `npm run test:dictation`: 28 behavioral checks run the actual helper in JSDOM with a synthetic speech provider. They cover explicit activation, capability/policy fallback, interim/final results, duplicate results, cursor preservation, literal markup, length limits, edit races, Stop/end timeouts, errors and retry, submission interception, navigation, Escape, read-only/hidden/removed fields, and cleanup.
- `npm run test:dictation:ui`: 15 Chromium tests run the actual Student Portal using synthetic sessions and mocked endpoints. They verify save/reopen/edit/submit, short-answer payloads, all three Writing Builder details in single/multiple-paragraph assignments (including dictation, word counts, transitions, transfer/autosave, Clear, reopen, and submission), read-aloud interaction, submission timing, day/close cleanup, submitted/graded work, helper loading failure, permission denial, both HTML embedding paths and their existing bridge, keyboard operation, and a 390 px screen.
- The local browser run uses an uncommitted configuration with Python's static server because of this runtime's existing `serve` limitation. The repository's browser configuration remains unchanged.
- Existing HTML-bridge, student-submit-answer, and student deadline tests pass. The deadline test's cache reference follows the new Student Portal runtime version; deadline logic is unchanged.
- Targeted ESLint and JavaScript syntax checks pass with no errors; the portal retains its nine existing unused-variable warnings. The narrow-screen dictation UI was visually inspected.
- The full local unit command reaches the existing `tc-library-helpers.test.cjs` date-label failures (98 passed, 3 failed). The unmodified test taken directly from the base commit reproduces the same result. This is an existing suite limit, not a passing full-suite claim.

Speech recognition was simulated in automated tests: these checks establish text handling and portal integration. Dan confirmed that real microphone dictation worked on the PR 1472 preview on September 6, 2026 and authorized merging. Microphone/service availability still depends on the browser and device permissions.

Rollback: revert the isolated dictation change, including the two microphone header exceptions and versioned assets. No data migration or cleanup is required.
