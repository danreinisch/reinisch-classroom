'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const constants = read('site/web/constants.js');
const evidence = read('site/web/tc-review-question-evidence.js');
const focusPersistence = read('site/web/tc-review-focus-persistence.js');
const modelSource = read('site/web/tc-review-question-evidence-model.js');
const css = read('site/web/tc-review-question-evidence.css');
const readShare = read('site/web/tc-review-read-share.js');
const boot = read('site/web/tc-review-question-evidence-boot.js');
const badgeEndpoint = read('netlify/functions/teacher-ungraded-count.js');
const reviewSave = read('netlify/functions/teacher-review-save.js');

console.log('--- Review question evidence detail contract ---');

assert.ok(
  constants.includes('/web/tc-review-question-evidence-boot.js?v=20260911-question-evidence5'),
  'Question Evidence first-paint guard must load through the Review bootstrap'
);
assert.ok(
  constants.includes('/web/tc-review-focus-persistence.js?v=20260911-review-focus-persistence3') &&
  constants.includes('/web/tc-review-question-evidence.js?v=20260911-question-evidence7'),
  'Review focus persistence and Question Evidence must load with the current cache keys'
);
assert.ok(
  constants.indexOf('tc-review-question-evidence-boot.js') < constants.indexOf('tc-review-qol.js'),
  'first-paint guard must be installed before delayed Review presentation begins'
);
assert.ok(
  constants.indexOf('tc-review-final-polish.js') < constants.indexOf('tc-review-question-evidence.js'),
  'Question Evidence must layer on after the existing Review command center'
);

for (const marker of [
  'Question Evidence',
  'Student response',
  'Correct answer',
  'Answer choices',
  'data-rv-question-filter="all"',
  'data-rv-question-filter="missed"',
  'data-rv-question-filter="correct"',
  'Question text is unavailable for this legacy item.',
  'Answer choices were not stored with this legacy item.',
  'rv-question-written-prompt',
  'displayRef',
  'displayAnswer',
]) {
  assert.ok(evidence.includes(marker), `missing evidence presentation marker: ${marker}`);
}
console.log('✓ focused Review exposes question, choices, student answer, correct answer, and filters');

assert.ok(
  evidence.includes("window.__rcReviewInitialReadSnapshot('listAssignments')") &&
  evidence.includes('const snapshotAssignment = snapshot ? findAssignment(selected, snapshot) : null') &&
  evidence.includes('decorateAutoSection(selected, lookup'),
  'Question Evidence should render synchronously from the already-captured assignment snapshot when available'
);
assert.ok(
  readShare.includes('window.__rcReviewInitialReadSnapshot'),
  'Review startup sharing must expose the already-loaded read snapshot'
);
assert.ok(
  readShare.includes("initialResults.set(methodName, value)"),
  'initial Review reads must be captured without adding a new startup request'
);
assert.ok(
  readShare.includes('pendingSubmissionReads') &&
  readShare.includes('listSubmissionAnswers'),
  'identical in-flight submission-answer reads must collapse to one request while Review settles'
);
console.log('✓ evidence metadata and answer reads avoid duplicate Review fan-out');

assert.ok(
  focusPersistence.includes('INTENT_WAIT_MS = 4000') &&
  focusPersistence.includes('pendingIntentIsFresh()') &&
  focusPersistence.includes('retryPendingIntent()') &&
  focusPersistence.includes("document.body.classList.contains('rv-qol-focus')"),
  'Focus intent must survive the brief legacy redraw window before command-center Focus mode is applied'
);
assert.ok(
  focusPersistence.includes('queueObserver.observe(queue, {') &&
  focusPersistence.includes('subtree: true') &&
  focusPersistence.includes('attributes: true') &&
  focusPersistence.includes("attributeFilter: ['class', 'aria-expanded']") &&
  focusPersistence.includes("window.dispatchEvent(new Event('rc-review-question-evidence-rescan'))"),
  'Focus persistence must stay queue-scoped, follow Focus class/expansion transitions, and explicitly rescan evidence'
);
console.log('✓ Review focus selection survives pre-focus and later legacy queue redraws');

assert.ok(
  boot.includes("PRESENTATION_CLASS = 'rv-review-first-paint-pending'") &&
  boot.includes('commandCenterReady') &&
  boot.includes('PRESENTATION_FALLBACK_MS'),
  'Review first paint must suppress legacy chrome until the command center has rendered and fail open'
);
assert.ok(
  css.includes('html.rv-review-first-paint-pending .rv-header') &&
  css.includes('html.rv-review-first-paint-pending #rvQueue'),
  'legacy Review chrome must stay hidden during the command-center first-paint handoff'
);
assert.ok(
  boot.includes("RESCAN_EVENT = 'rc-review-question-evidence-rescan'") &&
  boot.includes('EVIDENCE_RETRY_ATTEMPTS') &&
  boot.includes('requestEvidenceRescan'),
  'evidence guard must use a bounded explicit rescan instead of mutation pulses'
);
assert.ok(
  !boot.includes('rv-question-evidence-retry-pulse') &&
  !boot.includes('setInterval('),
  'evidence retry must not create a class-mutation feedback loop'
);
assert.ok(
  boot.includes("if (details.classList.contains('rv-question-evidence-ready')) {\n      if (details.classList.contains('rv-question-evidence-pending')) {\n        details.classList.remove('rv-question-evidence-pending');\n      }") &&
  boot.includes("!details.classList.contains('rv-question-evidence-ready') &&\n          details.classList.contains('rv-question-evidence-pending')"),
  'evidence guard must never rewrite the class attribute merely to remove an already-absent pending marker'
);
assert.ok(
  boot.includes('const queue = document.getElementById(\'rvQueue\')') &&
  boot.includes('evidenceObserver.observe(queue'),
  'persistent evidence observation must be scoped to the Review queue'
);
assert.ok(
  css.includes('.rv-question-evidence-pending .rv-auto-table{visibility:hidden!important}'),
  'pending evidence must suppress the legacy-table flash without collapsing its layout immediately'
);
assert.ok(
  evidence.includes("details.classList.remove('rv-question-evidence-pending')"),
  'successful evidence decoration must clear the first-paint pending guard'
);
console.log('✓ command-center and question-evidence handoffs avoid self-triggering mutation churn');

assert.ok(
  evidence.includes('decorateAgain = true') &&
  evidence.includes('!currentSelected || selectedSubmissionId(currentSelected) !== submissionId') &&
  evidence.includes('decorateAutoSection(currentSelected') &&
  evidence.includes("window.addEventListener('rc-review-question-evidence-rescan', scheduleDecorate)"),
  'async Review redraws may replace the DOM row, but only a changed submission ID should abort evidence decoration'
);
console.log('✓ async evidence decoration follows same-submission row replacements without decorating a stale student');

assert.ok(
  evidence.includes('const fallback = setTimeout(runDecorate, 160);') &&
  evidence.includes('requestAnimationFrame(runDecorate);') &&
  evidence.includes('clearTimeout(fallback);'),
  'Question Evidence scheduling must prefer the next paint but fail open if animation frames are delayed'
);
console.log('✓ evidence scheduling cannot remain locked behind a delayed animation frame');

for (const forbidden of [
  'teacher-review-save',
  'finalizeSubmission',
  'updateSubmissionAnswer',
  'setSubmissionInProgress',
  '.from(',
  "method: 'POST'",
  'method: "POST"',
]) {
  assert.ok(!evidence.includes(forbidden), `evidence presentation must stay read-only: ${forbidden}`);
}
console.log('✓ evidence layer owns no Review mutation path');

const runtimeSource = modelSource
  .replace(/export\s+const\s+/g, 'const ')
  .replace(/export\s+function\s+/g, 'function ');
const runtime = new Function(`${runtimeSource}\nreturn { parseAssignmentMeta, normalizeChoices, buildHtmlSourceLookup, buildQuestionLookup, formatAnswer, answerTokens, choiceMatches, choicesForQuestion, classifyOutcome };`)();

const assignment = {
  meta: {
    days: [{
      day_number: 1,
      type: 'questions',
      questions: [{
        number: 1,
        type: 'mcq',
        text: 'Which detail supports the claim?',
        choices: ['First detail', 'Second detail', 'Third detail'],
        correct: 'B',
        goal_codes: ['S016.G1'],
        dese_codes: ['RL.9-10.1'],
      }],
    }, {
      day_number: 4,
      type: 'writing_prompt',
      prompt: 'Explain how the character changes.',
    }],
  },
};

const lookup = runtime.buildQuestionLookup(assignment);
assert.strictEqual(lookup.get('1_1').text, 'Which detail supports the claim?');
assert.deepStrictEqual(lookup.get('1_1').choices.map(choice => choice.text), [
  'First detail', 'Second detail', 'Third detail',
]);
assert.strictEqual(lookup.get('1_1').correct, 'B');
assert.deepStrictEqual(lookup.get('1_1').goalCodes, ['S016.G1']);
assert.deepStrictEqual(lookup.get('1_1').deseCodes, ['RL.9-10.1']);
assert.strictEqual(lookup.get('WP_4').text, 'Explain how the character changes.');
console.log('✓ TXT question and writing-prompt metadata become display evidence');

const htmlLookup = runtime.buildQuestionLookup({
  meta: {
    questions: [{
      q_ref: 'Q7',
      label: 'Choose the best transition.',
      choices: { A: 'However', B: 'Therefore' },
      correct: 'B',
      answer_type: 'mcq',
    }],
  },
});
assert.strictEqual(htmlLookup.get('Q7').text, 'Choose the best transition.');
assert.strictEqual(htmlLookup.get('Q7').choices[1].text, 'Therefore');
console.log('✓ HTML-manifest question metadata remains supported');

const storedHtmlLookup = runtime.buildQuestionLookup({
  meta: {
    questions: [{
      q_ref: 'D2Q1',
      label: 'D2Q1',
      answer_type: 'mcq',
      correct: 'b) Making a sandwich',
    }],
    html_src: `
      <div class="q-card" data-qref="D2Q1" data-goal="S015.11.1-2" data-dese="RL.9-10.1" data-answer-type="multiple-choice">
        <div class="q-prompt">What is the person doing? <button class="tts-btn">Read</button></div>
        <button class="opt-btn" type="button">a) Pouring milk</button>
        <button class="opt-btn" type="button" data-correct>b) Making a sandwich</button>
        <button class="opt-btn" type="button">c) Washing fruit</button>
      </div>
    `,
  },
});
assert.strictEqual(storedHtmlLookup.get('D2Q1').text, 'What is the person doing?');
assert.deepStrictEqual(storedHtmlLookup.get('D2Q1').choices.map(choice => choice.text), [
  'Pouring milk', 'Making a sandwich', 'Washing fruit',
]);
assert.deepStrictEqual(storedHtmlLookup.get('D2Q1').goalCodes, ['S015.11.1-2']);
assert.deepStrictEqual(storedHtmlLookup.get('D2Q1').deseCodes, ['RL.9-10.1']);
assert.strictEqual(storedHtmlLookup.get('D2Q1').correct, 'b) Making a sandwich');
console.log('✓ stored HTML source restores the prompt and choices omitted from issued metadata');

const choices = runtime.normalizeChoices(['Alpha', 'Beta', 'Gamma']);
assert.strictEqual(runtime.choiceMatches('A', choices[0], 0), true);
assert.strictEqual(runtime.choiceMatches('Beta', choices[1], 1), true);
assert.strictEqual(runtime.choiceMatches('B', choices[0], 0), false);
assert.deepStrictEqual(runtime.choicesForQuestion({}, 'boolean').map(choice => choice.text), ['True', 'False']);
assert.strictEqual(runtime.formatAnswer({ value: 'student writing' }), 'student writing');
assert.strictEqual(runtime.formatAnswer('{"value":"B"}'), 'B');
assert.strictEqual(runtime.choiceMatches('{"value":"B"}', choices[1], 1), true);
assert.deepStrictEqual(runtime.answerTokens('["A","B"]'), ['a', 'b']);
assert.deepStrictEqual(runtime.answerTokens('A,B'), ['a,b', 'a', 'b']);
assert.strictEqual(runtime.choiceMatches('A,B', choices[0], 0), true);
assert.strictEqual(runtime.choiceMatches('A,B', choices[1], 1), true);
assert.deepStrictEqual(runtime.answerTokens('Fruit, honey and oats'), ['fruit, honey and oats']);
console.log('✓ choice matching supports wrapped, JSON-array, and compact comma-separated answers');

assert.strictEqual(runtime.classifyOutcome('1/1'), 'correct');
assert.strictEqual(runtime.classifyOutcome('1/2'), 'partial');
assert.strictEqual(runtime.classifyOutcome('0/2'), 'incorrect');
assert.strictEqual(runtime.classifyOutcome('—'), 'unknown');
console.log('✓ existing Review point math drives clear evidence outcome labels');

assert.ok(css.includes('.rv-question-evidence-prompt'));
assert.ok(css.includes('background:transparent'));
assert.ok(css.includes('.is-student-choice'));
assert.ok(css.includes('.is-correct-choice'));
assert.ok(css.includes('.is-incorrect-choice'));
assert.ok(css.includes('.rv-question-evidence-answers>div:first-child'));
assert.ok(css.includes('.rv-question-evidence-answers>div:last-child'));
assert.ok(!/\.rv-question-evidence-prompt[^}]*background\s*:\s*(?:#fff|white)/i.test(css));
console.log('✓ evidence surface is tighter, less boxy, and keeps the approved Review visual language');

for (const marker of [
  'select=id',
  '&status=eq.Submitted',
  "'Prefer': 'count=exact'",
  "'Range': '0-0'",
  'or=(settings->>non_instructional.is.null,settings->>non_instructional.neq.true)',
]) {
  assert.ok(badgeEndpoint.includes(marker), `Review badge endpoint missing lifecycle marker: ${marker}`);
}
assert.ok(
  !badgeEndpoint.includes('/rest/v1/submissions'),
  'Teacher shell badge should use the canonical assignment-instance lifecycle instead of downloading submissions'
);
assert.ok(
  reviewSave.includes("body: JSON.stringify({ status: 'Assigned' })") &&
  reviewSave.includes("body: JSON.stringify({ status: 'Reviewed' })") &&
  reviewSave.includes("status: 'Graded'"),
  'Review mutations must preserve the Submitted → Assigned/Reviewed/Graded lifecycle used by the badge'
);
console.log('✓ Teacher Center Review badge follows the existing actionable instance lifecycle with an exact lightweight count');

console.log('REVIEW QUESTION EVIDENCE DETAIL: PASS');
