'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const constants = read('site/web/constants.js');
const evidence = read('site/web/tc-review-question-evidence.js');
const modelSource = read('site/web/tc-review-question-evidence-model.js');
const css = read('site/web/tc-review-question-evidence.css');
const readShare = read('site/web/tc-review-read-share.js');

console.log('--- Review question evidence detail contract ---');

assert.ok(
  constants.includes('/web/tc-review-question-evidence.js?v=20260911-question-evidence'),
  'Question Evidence must load only through the Review presentation bootstrap'
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
]) {
  assert.ok(evidence.includes(marker), `missing evidence presentation marker: ${marker}`);
}
console.log('✓ focused Review exposes question, choices, student answer, correct answer, and filters');

assert.ok(
  evidence.includes("window.__rcReviewInitialReadSnapshot('listAssignments')"),
  'Question Evidence should reuse the initial Review assignment snapshot before reading again'
);
assert.ok(
  readShare.includes('window.__rcReviewInitialReadSnapshot'),
  'Review startup sharing must expose the already-loaded read snapshot'
);
assert.ok(
  readShare.includes("initialResults.set(methodName, value)"),
  'initial Review reads must be captured without adding a new startup request'
);
console.log('✓ evidence metadata reuses Review startup data instead of adding initial fan-out');

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
const runtime = new Function(`${runtimeSource}\nreturn { parseAssignmentMeta, normalizeChoices, buildQuestionLookup, formatAnswer, answerTokens, choiceMatches, choicesForQuestion, classifyOutcome };`)();

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

const choices = runtime.normalizeChoices(['Alpha', 'Beta']);
assert.strictEqual(runtime.choiceMatches('A', choices[0], 0), true);
assert.strictEqual(runtime.choiceMatches('Beta', choices[1], 1), true);
assert.strictEqual(runtime.choiceMatches('B', choices[0], 0), false);
assert.deepStrictEqual(runtime.choicesForQuestion({}, 'boolean').map(choice => choice.text), ['True', 'False']);
assert.strictEqual(runtime.formatAnswer({ value: 'student writing' }), 'student writing');
console.log('✓ choice matching works for letters, text, booleans, and wrapped answers');

assert.strictEqual(runtime.classifyOutcome('1/1'), 'correct');
assert.strictEqual(runtime.classifyOutcome('1/2'), 'partial');
assert.strictEqual(runtime.classifyOutcome('0/2'), 'incorrect');
assert.strictEqual(runtime.classifyOutcome('—'), 'unknown');
console.log('✓ existing Review point math drives clear evidence outcome labels');

assert.ok(css.includes('.rv-question-evidence-prompt'));
assert.ok(css.includes('rgba(128,198,165,.22)'));
assert.ok(css.includes('.is-student-choice'));
assert.ok(css.includes('.is-correct-choice'));
assert.ok(css.includes('.is-incorrect-choice'));
assert.ok(!/\.rv-question-evidence-prompt[^}]*background\s*:\s*(?:#fff|white)/i.test(css));
console.log('✓ evidence surface stays inside the approved green Review visual language');

console.log('REVIEW QUESTION EVIDENCE DETAIL: PASS');
