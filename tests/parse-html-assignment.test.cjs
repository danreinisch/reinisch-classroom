// Unit tests for netlify/functions/_lib/parse-html-assignment.js
// Tests: parseHtmlAssignment() for Counting Money, S015, S020 patterns, edge cases
// Run with: node tests/parse-html-assignment.test.cjs

'use strict';

const assert = require('assert');
const { parseHtmlAssignment } = require('../netlify/functions/_lib/parse-html-assignment');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

// ── Pattern 1: Counting Money (constructed + data-correct on .q-card) ────────

console.log('\n--- Pattern 1: Counting Money (constructed + data-correct on .q-card) ---');

test('constructed item with data-correct on q-card → correct is a string', () => {
  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1;S016.11.4" data-points="1" data-answer-type="constructed" data-correct="1.00" id="d0q0">
      <input type="text" name="D1Q1">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'D1Q1');
  assert.strictEqual(questions[0].answer_type, 'constructed');
  assert.strictEqual(questions[0].correct, '1.00');
  assert.strictEqual(questions[0].points, 1);
});

test('constructed item without data-correct → correct is null', () => {
  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1" data-points="1" data-answer-type="constructed" id="d0q0">
      <input type="text" name="D1Q1">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].correct, null);
});

test('data-iep is parsed into default_goal_codes array', () => {
  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1;S016.11.4" data-points="1" data-answer-type="constructed" data-correct="1.00" id="d0q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S008.11.1', 'S016.11.4']);
});

test('multiple counting money questions parsed correctly', () => {
  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1;S016.11.4" data-points="1" data-answer-type="constructed" data-correct="1.00" id="d0q0">
    </div>
    <div class="q-card" data-qref="D1Q2" data-iep="S008.11.1;S016.11.4" data-points="1" data-answer-type="constructed" data-correct="0.40" id="d0q1">
    </div>
    <div class="q-card" data-qref="D1Q3" data-iep="S008.11.1;S016.11.4" data-points="1" data-answer-type="constructed" data-correct="0.65" id="d0q2">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 3);
  assert.strictEqual(questions[0].correct, '1.00');
  assert.strictEqual(questions[1].correct, '0.40');
  assert.strictEqual(questions[2].correct, '0.65');
});

// ── Pattern 2: S015 (MCQ with boolean data-correct on opt-btn) ───────────────

console.log('\n--- Pattern 2: S015 (MCQ with opt-btn data-correct) ---');

test('MCQ item with boolean data-correct on opt-btn → correct is button text', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-goal="S015.11.1-1;S015.11.4-1" data-points="1" data-answer-type="multiple-choice" id="q0">
      <button class="opt-btn" type="button">a) Wrong</button>
      <button class="opt-btn" type="button" data-correct>b) Right answer</button>
      <button class="opt-btn" type="button">c) Also wrong</button>
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  assert.strictEqual(questions[0].answer_type, 'mcq');
  assert.strictEqual(questions[0].correct, 'b) Right answer');
});

test('data-goal is parsed into default_goal_codes (S015 pattern)', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-goal="S015.11.1-1;S015.11.4-1" data-points="2" data-answer-type="multiple-choice" id="q0">
      <button class="opt-btn" type="button" data-correct>Correct</button>
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S015.11.1-1', 'S015.11.4-1']);
  assert.strictEqual(questions[0].points, 2);
});

test('MCQ item with no data-correct opt-btn → correct is null', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-goal="S015.11.1-1" data-points="1" data-answer-type="multiple-choice" id="q0">
      <button class="opt-btn" type="button">a) No correct set</button>
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions[0].correct, null);
});

// ── Pattern 3: S020 (category-group with data-correct="value") ───────────────

console.log('\n--- Pattern 3: S020 (category-group data-correct) ---');

test('MCQ item with data-correct on category-group → correct is category value', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-goal="S020.11.1-1" data-points="1" data-answer-type="multiple-choice" id="q0">
      <div class="category-group" data-correct="Kitchen">
        <span>Item A</span>
      </div>
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].correct, 'Kitchen');
});

// ── Edge cases ────────────────────────────────────────────────────────────────

console.log('\n--- Edge cases ---');

test('empty HTML → empty questions array', () => {
  const { questions } = parseHtmlAssignment('');
  assert.strictEqual(questions.length, 0);
});

test('null input → empty questions array', () => {
  const { questions } = parseHtmlAssignment(null);
  assert.strictEqual(questions.length, 0);
});

test('HTML with no data-qref elements → empty questions array', () => {
  const html = `
    <html><body>
      <div class="q-card" id="q0">No qref here</div>
    </body></html>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 0);
});

test('duplicate data-qref → first occurrence kept, second skipped', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));

  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1" data-points="1" data-answer-type="constructed" data-correct="1.00" id="first">
    </div>
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1" data-points="1" data-answer-type="constructed" data-correct="9.99" id="duplicate">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  console.warn = originalWarn;

  assert.strictEqual(questions.length, 1, 'Duplicate qref should be skipped');
  assert.strictEqual(questions[0].correct, '1.00', 'First occurrence should be kept');
  assert.ok(warnings.some(w => w.includes('D1Q1') && w.includes('skipping')), 'Should log a warning for duplicate qref');
});

test('missing data-correct on constructed item → correct is null', () => {
  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1" data-points="1" data-answer-type="constructed" id="d0q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions[0].correct, null);
});

test('malformed HTML does not crash', () => {
  const malformedHtml = '<div data-qref="Q1" data-points="1" data-answer-type="constructed" unclosed';
  assert.doesNotThrow(() => parseHtmlAssignment(malformedHtml));
});

test('data-points defaults to 1 when absent', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-iep="S008.11.1" data-answer-type="constructed" id="q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions[0].points, 1);
});

test('data-points with invalid value defaults to 1', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-iep="S008.11.1" data-points="abc" data-answer-type="constructed" id="q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions[0].points, 1);
});

// ── Goal code extraction ──────────────────────────────────────────────────────

console.log('\n--- Goal code extraction ---');

test('data-iep with semicolon-separated codes → correct default_goal_codes', () => {
  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1;S016.11.4" data-points="1" data-answer-type="constructed" data-correct="1.00" id="d0q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S008.11.1', 'S016.11.4']);
});

test('data-goal with semicolons → correct default_goal_codes', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-goal="S015.11.1-1;S015.11.4-1" data-points="1" data-answer-type="multiple-choice" id="q0">
      <button class="opt-btn" type="button" data-correct>Answer</button>
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S015.11.1-1', 'S015.11.4-1']);
});

test('data-goal takes precedence over data-iep when both present', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-goal="S015.11.1-1" data-iep="S008.11.1" data-points="1" data-answer-type="multiple-choice" id="q0">
      <button class="opt-btn" type="button" data-correct>Answer</button>
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S015.11.1-1']);
});

test('no data-goal or data-iep → empty default_goal_codes', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-points="1" data-answer-type="constructed" data-correct="1.00" id="q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_goal_codes, []);
});

// ── DESE code extraction ──────────────────────────────────────────────────────

console.log('\n--- DESE code extraction (data-dese) ---');

test('data-dese with semicolon-separated codes → correct default_dese_codes', () => {
  const html = `
    <div class="q-card" data-qref="D1Q1" data-iep="S008.11.1" data-dese="MLS.5.1;MLS.5.2" data-points="1" data-answer-type="constructed" data-correct="1.00" id="d0q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_dese_codes, ['MLS.5.1', 'MLS.5.2']);
});

test('data-dese with comma-separated codes → correct default_dese_codes', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-dese="MLS.5.1,MLS.5.2" data-points="1" data-answer-type="constructed" id="q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_dese_codes, ['MLS.5.1', 'MLS.5.2']);
});

test('missing data-dese → empty default_dese_codes', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-iep="S008.11.1" data-points="1" data-answer-type="constructed" data-correct="1.00" id="q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_dese_codes, []);
});

test('data-iep and data-dese on same element are parsed independently', () => {
  const html = `
    <div class="q-card" data-qref="Q1" data-iep="S008.11.1;S016.11.4" data-dese="MLS.5.1" data-points="1" data-answer-type="constructed" data-correct="1.00" id="q0">
    </div>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S008.11.1', 'S016.11.4']);
  assert.deepStrictEqual(questions[0].default_dese_codes, ['MLS.5.1']);
});

// ── Embedded JSON manifest (Step 0) ──────────────────────────────────────────

console.log('\n--- Embedded JSON manifest ---');

test('HTML with valid manifest → questions from manifest, not data-qref regex', () => {
  const html = `
    <html><body>
      <div class="q-card" data-qref="OLD_REF" data-points="1" data-answer-type="constructed" data-correct="9.99" id="q0">
      </div>
      <script type="application/json" id="assignment-manifest">
      {
        "questions": [
          { "ref": "D1Q1", "answer_type": "constructed", "correct": "1.00", "goal_codes": ["S008.11.1"], "dese_codes": [], "points": 1, "label": "Count 4 quarters" }
        ]
      }
      </script>
    </body></html>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'D1Q1');
  assert.strictEqual(questions[0].correct, '1.00');
  assert.strictEqual(questions[0].label, 'Count 4 quarters');
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S008.11.1']);
  assert.deepStrictEqual(questions[0].default_dese_codes, []);
});

test('manifest with id before type attribute → also parsed correctly', () => {
  const html = `
    <html><body>
      <script id="assignment-manifest" type="application/json">
      { "questions": [{ "ref": "Q1", "answer_type": "mcq", "correct": "A", "points": 2 }] }
      </script>
    </body></html>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  assert.strictEqual(questions[0].answer_type, 'mcq');
  assert.strictEqual(questions[0].points, 2);
});

test('manifest wins over data-qref elements when both present', () => {
  const html = `
    <html><body>
      <div class="q-card" data-qref="REGEX_REF" data-points="5" data-answer-type="constructed" data-correct="9.99" id="q0"></div>
      <script type="application/json" id="assignment-manifest">
      { "questions": [{ "ref": "MANIFEST_REF", "correct": "1.00", "points": 1 }] }
      </script>
    </body></html>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'MANIFEST_REF');
  assert.strictEqual(questions[0].correct, '1.00');
});

test('malformed manifest JSON → falls back to regex extraction', () => {
  const html = `
    <html><body>
      <div class="q-card" data-qref="D1Q1" data-points="1" data-answer-type="constructed" data-correct="1.00" id="q0"></div>
      <script type="application/json" id="assignment-manifest">
      { this is not valid json }
      </script>
    </body></html>
  `;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  const { questions } = parseHtmlAssignment(html);
  console.warn = originalWarn;

  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'D1Q1', 'Should fall back to regex extraction');
  assert.ok(warnings.some(w => w.includes('assignment-manifest')), 'Should warn about malformed JSON');
});

test('manifest with empty questions array → falls back to regex extraction', () => {
  const html = `
    <html><body>
      <div class="q-card" data-qref="D1Q1" data-points="1" data-answer-type="constructed" data-correct="1.00" id="q0"></div>
      <script type="application/json" id="assignment-manifest">
      { "questions": [] }
      </script>
    </body></html>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'D1Q1', 'Should fall back to regex when manifest.questions is empty');
});

test('manifest with duplicate refs → deduplicates', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));

  const html = `
    <script type="application/json" id="assignment-manifest">
    { "questions": [
        { "ref": "D1Q1", "correct": "1.00", "points": 1 },
        { "ref": "D1Q1", "correct": "9.99", "points": 1 }
      ]
    }
    </script>
  `;
  const { questions } = parseHtmlAssignment(html);
  console.warn = originalWarn;

  assert.strictEqual(questions.length, 1, 'Duplicate manifest refs should be deduped');
  assert.strictEqual(questions[0].correct, '1.00', 'First occurrence should be kept');
  assert.ok(warnings.some(w => w.includes('D1Q1') && w.includes('skipping')), 'Should warn about duplicate manifest ref');
});

test('manifest questions with dese_codes → passed through correctly', () => {
  const html = `
    <script type="application/json" id="assignment-manifest">
    { "questions": [
        { "ref": "Q1", "correct": "A", "goal_codes": ["S008.11.1"], "dese_codes": ["MLS.5.1", "MLS.5.2"], "points": 1 }
      ]
    }
    </script>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.deepStrictEqual(questions[0].default_dese_codes, ['MLS.5.1', 'MLS.5.2']);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['S008.11.1']);
});

test('manifest with q_ref field (instead of ref) → works correctly', () => {
  const html = `
    <script type="application/json" id="assignment-manifest">
    { "questions": [{ "q_ref": "D1Q1", "correct": "1.00", "points": 1 }] }
    </script>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions[0].q_ref, 'D1Q1');
});

test('manifest answer_type goes through normalizeAnswerType', () => {
  const html = `
    <script type="application/json" id="assignment-manifest">
    { "questions": [{ "ref": "Q1", "answer_type": "multiple-choice", "points": 1 }] }
    </script>
  `;
  const { questions } = parseHtmlAssignment(html);
  assert.strictEqual(questions[0].answer_type, 'mcq');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('\n✓ All parse-html-assignment tests passed!');
}
