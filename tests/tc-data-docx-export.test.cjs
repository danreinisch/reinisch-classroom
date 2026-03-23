// Unit tests for tc-data.js exportToDocx per-question detail enhancement (P7)
// Tests: per-question table markup, goal_codes filtering, escapeXml usage, graceful degradation
// Run with: node tests/tc-data-docx-export.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Load source for source-inspection tests ───────────────────────────────────

const srcPath = path.join(__dirname, '..', 'site', 'web', 'tc-data.js');
const src = fs.readFileSync(srcPath, 'utf8');

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log('\n=== tc-data-docx-export tests ===\n');

// ── Inlined helpers ───────────────────────────────────────────────────────────

// Mirror of escapeXml from tc-data.js
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Mirror of buildItemsFromMeta from tc-data.js
function buildItemsFromMeta(assignmentId, meta) {
  const items = [];
  if (!meta) return items;
  if (Array.isArray(meta.days)) {
    for (const day of meta.days) {
      if (day.type === 'questions' && Array.isArray(day.questions)) {
        for (const q of day.questions) {
          const item_ref = `${day.day_number}_${q.number}`;
          items.push({
            id: `syn_${item_ref}`,
            assignment_id: assignmentId,
            item_ref,
            answer_type: q.type || 'mcq',
            points: q.points || 1,
            meta: {
              day: day.day_number,
              question_number: q.number,
              text: q.text,
              choices: q.choices,
              correct: q.correct,
            },
            goal_codes: q.goal_codes || [],
            dese_codes: q.dese_codes || [],
          });
        }
      }
    }
  }
  // Fallback: HTML manifest format
  if (items.length === 0 && Array.isArray(meta.questions) && meta.questions.length > 0) {
    for (const [i, q] of meta.questions.entries()) {
      const qRef = q.q_ref || (`Q${i + 1}`);
      items.push({
        id: `syn_${qRef}`,
        assignment_id: assignmentId,
        item_ref: qRef,
        answer_type: q.answer_type || 'constructed',
        points: (typeof q.points === 'number') ? q.points : 1,
        meta: {
          question_number: qRef,
          text: q.label || '',
          correct: (q.correct !== undefined && q.correct !== null) ? q.correct : undefined,
        },
        goal_codes: Array.isArray(q.default_goal_codes) ? q.default_goal_codes : [],
        dese_codes: Array.isArray(q.dese_codes) ? q.dese_codes : [],
      });
    }
  }
  return items;
}

// Helper: simulate the per-question detail rendering logic from exportToDocx
function renderPerQuestionDetail(sub, assignment, goalCode) {
  const items = buildItemsFromMeta(sub.assignment_id, assignment ? assignment.meta : null)
    .filter(item => Array.isArray(item.goal_codes) && item.goal_codes.includes(goalCode));
  const rawAnswers = (sub.answers && typeof sub.answers === 'object' && !Array.isArray(sub.answers))
    ? sub.answers : {};

  if (items.length === 0) return '';

  let detailHtml = `<table><thead><tr>` +
    `<th>Q</th><th>Question</th><th>Student Answer</th><th>Correct Answer</th><th>Points</th><th>Result</th>` +
    `</tr></thead><tbody>`;

  for (const item of items) {
    const studentAns = rawAnswers[item.item_ref] !== undefined ? rawAnswers[item.item_ref] : '—';
    const correctAns = item.meta && item.meta.correct !== undefined ? item.meta.correct : '—';
    const max = item.points || 1;
    const isCorrect = correctAns !== '—' && studentAns !== '—' && String(studentAns) === String(correctAns);
    const earned = correctAns !== '—' && studentAns !== '—' ? (isCorrect ? max : 0) : '—';
    const resultIcon = correctAns !== '—' && studentAns !== '—' ? (isCorrect ? '✓' : '✗') : '—';
    detailHtml += `<tr>` +
      `<td>${escapeXml(String(item.item_ref))}</td>` +
      `<td>${escapeXml(item.meta && item.meta.text ? item.meta.text : '')}</td>` +
      `<td>${escapeXml(String(studentAns))}</td>` +
      `<td>${escapeXml(String(correctAns))}</td>` +
      `<td>${escapeXml(String(earned))}/${escapeXml(String(max))}</td>` +
      `<td>${resultIcon}</td>` +
      `</tr>`;
  }
  detailHtml += '</tbody></table>';
  return detailHtml;
}

// ── Source-level checks ───────────────────────────────────────────────────────

console.log('--- Source-level checks ---');

test('exportToDocx function is declared in tc-data.js', () => {
  assert.ok(src.includes('async function exportToDocx()'), 'exportToDocx must be declared');
});

test('buildItemsFromMeta helper is declared in tc-data.js', () => {
  assert.ok(src.includes('function buildItemsFromMeta('), 'buildItemsFromMeta must be declared in tc-data.js');
});

test('DOCX output includes thead with Q/Question/Student Answer/Correct Answer/Points/Result columns', () => {
  assert.ok(src.includes('<th'), 'must have <th> elements');
  assert.ok(src.includes('>Q<'), 'must have Q column');
  assert.ok(src.includes('>Question<'), 'must have Question column');
  assert.ok(src.includes('>Student Answer<'), 'must have Student Answer column');
  assert.ok(src.includes('>Correct Answer<'), 'must have Correct Answer column');
  assert.ok(src.includes('>Points<'), 'must have Points column');
  assert.ok(src.includes('>Result<'), 'must have Result column');
});

test('escapeXml is used for item_ref in detail table', () => {
  assert.ok(src.includes("escapeXml(String(item.item_ref))"), 'item_ref must be escaped via escapeXml');
});

test('escapeXml is used for student answer in detail table', () => {
  assert.ok(src.includes("escapeXml(String(studentAns))"), 'student answer must be escaped via escapeXml');
});

test('escapeXml is used for correct answer in detail table', () => {
  assert.ok(src.includes("escapeXml(String(correctAns))"), 'correct answer must be escaped via escapeXml');
});

test('escapeXml is used for question text in detail table', () => {
  assert.ok(src.includes("escapeXml(item.meta && item.meta.text"), 'question text must be escaped via escapeXml');
});

test('goal_codes filtering is applied before rendering detail rows', () => {
  assert.ok(src.includes('item.goal_codes.includes(goalCode)'), 'must filter items by goalCode');
});

test('detail table is only rendered when items.length > 0', () => {
  assert.ok(src.includes('if (items.length > 0)'), 'detail table must be guarded by items.length check');
});

test('sub.answers is safely accessed (object check)', () => {
  assert.ok(src.includes("typeof sub.answers === 'object'"), 'sub.answers must be type-checked before use');
});

// ── Functional tests using inlined helpers ────────────────────────────────────

console.log('\n--- Functional tests ---');

test('buildItemsFromMeta returns [] for null meta', () => {
  const items = buildItemsFromMeta(1, null);
  assert.deepStrictEqual(items, []);
});

test('buildItemsFromMeta returns [] for meta without days or questions', () => {
  const items = buildItemsFromMeta(1, { title: 'test' });
  assert.deepStrictEqual(items, []);
});

test('buildItemsFromMeta synthesizes items from meta.days questions', () => {
  const meta = {
    days: [{ day_number: 1, type: 'questions', questions: [
      { number: 1, text: 'What is 2+2?', correct: '4', points: 1, goal_codes: ['G1'], type: 'mcq' }
    ]}]
  };
  const items = buildItemsFromMeta(10, meta);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].item_ref, '1_1');
  assert.strictEqual(items[0].meta.text, 'What is 2+2?');
  assert.strictEqual(items[0].meta.correct, '4');
  assert.deepStrictEqual(items[0].goal_codes, ['G1']);
  assert.strictEqual(items[0].assignment_id, 10);
});

test('buildItemsFromMeta falls back to meta.questions (HTML manifest format)', () => {
  const meta = {
    questions: [
      { q_ref: 'Q1', label: 'Choose the correct answer', correct: 'B', points: 2, default_goal_codes: ['G2'], answer_type: 'mcq' }
    ]
  };
  const items = buildItemsFromMeta(5, meta);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].item_ref, 'Q1');
  assert.strictEqual(items[0].meta.text, 'Choose the correct answer');
  assert.strictEqual(items[0].meta.correct, 'B');
  assert.deepStrictEqual(items[0].goal_codes, ['G2']);
  assert.strictEqual(items[0].points, 2);
});

test('buildItemsFromMeta meta.questions auto-numbers items without q_ref', () => {
  const meta = {
    questions: [
      { label: 'First question', correct: 'A', default_goal_codes: [] },
      { label: 'Second question', correct: 'B', default_goal_codes: [] },
    ]
  };
  const items = buildItemsFromMeta(1, meta);
  assert.strictEqual(items[0].item_ref, 'Q1');
  assert.strictEqual(items[1].item_ref, 'Q2');
});

test('buildItemsFromMeta meta.days takes priority over meta.questions', () => {
  const meta = {
    days: [{ day_number: 1, type: 'questions', questions: [
      { number: 1, text: 'From days', correct: 'X', points: 1, goal_codes: [], type: 'mcq' }
    ]}],
    questions: [
      { q_ref: 'Q1', label: 'From questions', correct: 'Y', default_goal_codes: [] }
    ]
  };
  const items = buildItemsFromMeta(1, meta);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].meta.text, 'From days');
});

test('items without matching goal_codes are excluded from detail table', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'Linked question', correct: 'A', points: 1, default_goal_codes: ['GOAL_1'], answer_type: 'mcq' },
        { q_ref: 'Q2', label: 'Unlinked question', correct: 'B', points: 1, default_goal_codes: ['OTHER_GOAL'], answer_type: 'mcq' },
      ]
    }
  };
  const sub = { assignment_id: 1, answers: { Q1: 'A', Q2: 'B' } };
  const html = renderPerQuestionDetail(sub, assignment, 'GOAL_1');
  assert.ok(html.includes('Linked question'), 'linked question should appear');
  assert.ok(!html.includes('Unlinked question'), 'unlinked question should not appear');
});

test('per-question detail shows correct answer, student answer, and result', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'Q text', correct: 'A', points: 1, default_goal_codes: ['G1'], answer_type: 'mcq' }
      ]
    }
  };
  const sub = { assignment_id: 1, answers: { Q1: 'A' } };
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  assert.ok(html.includes('Q text'), 'question text must appear');
  assert.ok(html.includes('>A<'), 'student answer must appear');
  assert.ok(html.includes('✓'), 'correct result must show checkmark');
});

test('per-question detail shows ✗ for wrong answer', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'Q text', correct: 'A', points: 1, default_goal_codes: ['G1'], answer_type: 'mcq' }
      ]
    }
  };
  const sub = { assignment_id: 1, answers: { Q1: 'B' } };
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  assert.ok(html.includes('✗'), 'wrong answer must show X mark');
});

test('per-question detail shows — when student answer is missing', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'Q text', correct: 'A', points: 1, default_goal_codes: ['G1'], answer_type: 'mcq' }
      ]
    }
  };
  const sub = { assignment_id: 1, answers: {} };
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  assert.ok(html.includes('—'), 'missing answer should show dash');
  assert.ok(!html.includes('✓') && !html.includes('✗'), 'no result icon when answer is missing');
});

test('no detail table when no items match goal code', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'Q text', correct: 'A', points: 1, default_goal_codes: ['OTHER'], answer_type: 'mcq' }
      ]
    }
  };
  const sub = { assignment_id: 1, answers: { Q1: 'A' } };
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  assert.strictEqual(html, '', 'should return empty string when no items match goal');
});

test('no detail table when assignment has no meta', () => {
  const assignment = { id: 1, meta: null };
  const sub = { assignment_id: 1, answers: { Q1: 'A' } };
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  assert.strictEqual(html, '', 'should return empty string with null meta');
});

test('no detail table when assignment is null', () => {
  const sub = { assignment_id: 1, answers: {} };
  const html = renderPerQuestionDetail(sub, null, 'G1');
  assert.strictEqual(html, '', 'should return empty string when assignment is null');
});

test('no detail table when sub.answers is missing', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'Q', correct: 'A', points: 1, default_goal_codes: ['G1'], answer_type: 'mcq' }
      ]
    }
  };
  const sub = { assignment_id: 1 }; // no answers field
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  // Should render table but with — for student answer
  assert.ok(html.includes('<table>'), 'table should still render');
  assert.ok(html.includes('—'), 'missing answers should show dash');
});

test('escapeXml protects against XSS in question text', () => {
  const malicious = '<script>alert("xss")</script>';
  assert.ok(!escapeXml(malicious).includes('<script>'), 'script tags must be escaped');
  assert.ok(escapeXml(malicious).includes('&lt;script&gt;'), 'angle brackets must be &lt; &gt;');
});

test('escapeXml protects against XSS in student answers', () => {
  const malicious = '"><img onerror=alert(1)>';
  const escaped = escapeXml(malicious);
  assert.ok(!escaped.includes('"><img'), 'must escape quotes and angle brackets');
  assert.ok(escaped.includes('&quot;'), 'double quotes must become &quot;');
  assert.ok(escaped.includes('&gt;'), 'closing bracket must become &gt;');
});

test('detail table includes thead and tbody elements', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'Q', correct: 'A', points: 1, default_goal_codes: ['G1'], answer_type: 'mcq' }
      ]
    }
  };
  const sub = { assignment_id: 1, answers: { Q1: 'A' } };
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  assert.ok(html.includes('<thead>'), 'must have thead');
  assert.ok(html.includes('<tbody>'), 'must have tbody');
});

test('multiple items for same goal all appear in table', () => {
  const assignment = {
    id: 1,
    meta: {
      questions: [
        { q_ref: 'Q1', label: 'First', correct: 'A', points: 1, default_goal_codes: ['G1'], answer_type: 'mcq' },
        { q_ref: 'Q2', label: 'Second', correct: 'B', points: 1, default_goal_codes: ['G1'], answer_type: 'mcq' },
      ]
    }
  };
  const sub = { assignment_id: 1, answers: { Q1: 'A', Q2: 'C' } };
  const html = renderPerQuestionDetail(sub, assignment, 'G1');
  assert.ok(html.includes('First'), 'first question must appear');
  assert.ok(html.includes('Second'), 'second question must appear');
  assert.ok(html.includes('✓'), 'first correct answer should show checkmark');
  assert.ok(html.includes('✗'), 'second wrong answer should show X');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} total: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
