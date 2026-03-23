// End-to-end integration tests for the HTML assignment pipeline (PRs #823–#827)
// Tests: inferAnswerType, parseCodeArray, detectQuestionsFromHTML (7 passes),
//        manifestQuestionsToItems, buildItemsFromMeta (Path B), full pipeline
// Run with: node --test tests/html-assignment-pipeline.test.cjs

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// Set up global DOMParser from jsdom (needed by detectQuestionsFromHTML)
const _dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = _dom.window.DOMParser;

// ── Inlined helpers from web/assignment-manifest.js ──────────────────────────

const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 500;

function inferAnswerType(rawCorrect) {
  var val = (rawCorrect || '').trim();
  if (!val || val === '-') {
    return { answer_type: 'constructed', correct: null };
  }
  if (val.includes(';')) {
    return {
      answer_type: 'multi',
      correct: val.split(';').map(function (c) { return c.trim(); }).filter(function (c) { return c; })
    };
  }
  if (/^(true|false)$/i.test(val)) {
    return { answer_type: 'boolean', correct: val.toLowerCase() === 'true' };
  }
  return { answer_type: 'mcq', correct: val };
}

function parseCodeArray(codeStr) {
  if (!codeStr || codeStr === '-') return [];
  return codeStr.split(';').map(function (c) { return c.trim(); }).filter(function (c) { return c.length > 0; });
}

function detectQuestionsFromHTML(htmlContent) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(htmlContent, 'text/html');
  var questions = [];

  // Pass 1: [data-qref] elements
  var explicitQuestions = doc.querySelectorAll('[data-qref]');
  if (explicitQuestions.length > 0) {
    explicitQuestions.forEach(function (el, idx) {
      var q_ref = el.getAttribute('data-qref');
      var label = el.textContent.trim().substring(0, 100) || ('Question ' + (idx + 1));

      var pointsRaw = el.getAttribute('data-points');
      var pointsParsed = parseFloat(pointsRaw);
      var points = (pointsRaw !== null) ? (isNaN(pointsParsed) ? 1 : pointsParsed) : 1;

      var rawCorrect = el.getAttribute('data-correct');
      var rawAnswerType = el.getAttribute('data-answer-type');
      var validTypes = ['mcq', 'multi', 'boolean', 'constructed'];

      var answer_type, correct;
      if (rawAnswerType && validTypes.indexOf(rawAnswerType) !== -1) {
        answer_type = rawAnswerType;
        correct = inferAnswerType(rawCorrect).correct;
      } else {
        var inferred = inferAnswerType(rawCorrect);
        answer_type = inferred.answer_type;
        correct = inferred.correct;
      }

      var dese_codes = parseCodeArray(el.getAttribute('data-dese'));
      var default_goal_codes = parseCodeArray(el.getAttribute('data-goal'));

      questions.push({
        q_ref: q_ref,
        label: label,
        skill_tags: [],
        points: points,
        default_goal_codes: default_goal_codes,
        dese_codes: dese_codes,
        correct: correct,
        answer_type: answer_type,
        per_student_overrides: {}
      });
    });
    return questions;
  }

  // Pass 2: Form inputs grouped by name
  var inputEls = doc.querySelectorAll('input[name], select[name], textarea[name]');
  var seenNames = {};
  inputEls.forEach(function (el) {
    var name = el.getAttribute('name');
    if (!name || seenNames[name]) return;
    if (/^Q\d+$/i.test(name) || /^question/i.test(name)) {
      seenNames[name] = true;
      questions.push({
        q_ref: name,
        label: name,
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });
  if (questions.length > 0) return questions;

  // Pass 3: fieldset elements containing a legend
  var fieldsets = doc.querySelectorAll('fieldset');
  fieldsets.forEach(function (fs, idx) {
    var legend = fs.querySelector('legend');
    var label = legend ? legend.textContent.trim().substring(0, 100) : ('Question ' + (idx + 1));
    questions.push({
      q_ref: 'Q' + (idx + 1),
      label: label,
      skill_tags: [],
      points: 1,
      default_goal_codes: [],
      per_student_overrides: {}
    });
  });
  if (questions.length > 0) return questions;

  // Pass 4: ol > li ordered list items
  var olItems = doc.querySelectorAll('ol > li');
  olItems.forEach(function (li, idx) {
    var text = li.textContent.trim();
    if (text.length > MIN_QUESTION_LENGTH) {
      questions.push({
        q_ref: 'Q' + (idx + 1),
        label: text.substring(0, 100),
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });
  if (questions.length > 0) return questions;

  // Pass 5: Class/ID pattern elements
  var patternEls = doc.querySelectorAll(
    '.question, [class*="q-"], [id^="q-"], [id^="question"], [data-question]'
  );
  patternEls.forEach(function (el, idx) {
    var text = el.textContent.trim();
    if (text.length > MIN_QUESTION_LENGTH) {
      var id = el.getAttribute('id') || el.getAttribute('data-question') || ('Q' + (idx + 1));
      questions.push({
        q_ref: id,
        label: text.substring(0, 100),
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });
  if (questions.length > 0) return questions;

  // Pass 6: Table rows where first cell looks like a question number
  var tableRows = doc.querySelectorAll('table tr');
  tableRows.forEach(function (row, idx) {
    var firstCell = row.querySelector('td, th');
    if (!firstCell) return;
    var cellText = firstCell.textContent.trim();
    if (/^\d+[.)\s]/.test(cellText) || /^Q\d+/i.test(cellText)) {
      var label = row.textContent.trim().substring(0, 100);
      questions.push({
        q_ref: 'Q' + (idx + 1),
        label: label,
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });
  if (questions.length > 0) return questions;

  // Pass 7: Block-element fallback
  var blockElements = doc.querySelectorAll('p, div.question, section, article, li');
  blockElements.forEach(function (el, idx) {
    var text = el.textContent.trim();
    if (text.length > MIN_QUESTION_LENGTH && text.length < MAX_QUESTION_LENGTH) {
      var q_ref = 'Q' + (idx + 1);
      var label = text.substring(0, 100);
      questions.push({
        q_ref: q_ref,
        label: label || q_ref,
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });

  return questions;
}

// ── Inlined from web/html-manifest-to-items.js ───────────────────────────────

function manifestQuestionsToItems(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }
  var items = [];
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    if (!q.q_ref) {
      continue;
    }
    items.push({
      ref: q.q_ref,
      answer_type: q.answer_type || 'constructed',
      points: (typeof q.points === 'number') ? q.points : 1,
      correct: (q.correct !== undefined && q.correct !== null) ? q.correct : null,
      dese_codes: Array.isArray(q.dese_codes) ? q.dese_codes : [],
      goal_codes: Array.isArray(q.default_goal_codes) ? q.default_goal_codes : [],
      scoring: {},
      notes: q.label || ''
    });
  }
  return items;
}

// ── Shared buildItemsFromMeta from canonical server module ────────────────────

const { buildItemsFromMeta } = require('../netlify/functions/_lib/build-items');

// ── Test suites ───────────────────────────────────────────────────────────────

describe('inferAnswerType()', () => {
  it('empty string → constructed, correct: null', () => {
    const result = inferAnswerType('');
    assert.equal(result.answer_type, 'constructed');
    assert.equal(result.correct, null);
  });

  it('dash "-" → constructed, correct: null', () => {
    const result = inferAnswerType('-');
    assert.equal(result.answer_type, 'constructed');
    assert.equal(result.correct, null);
  });

  it('semicolons "A;C" → multi, correct: ["A","C"]', () => {
    const result = inferAnswerType('A;C');
    assert.equal(result.answer_type, 'multi');
    assert.deepEqual(result.correct, ['A', 'C']);
  });

  it('"true" (case-insensitive) → boolean, correct: true', () => {
    assert.equal(inferAnswerType('true').answer_type, 'boolean');
    assert.equal(inferAnswerType('true').correct, true);
    assert.equal(inferAnswerType('TRUE').correct, true);
    assert.equal(inferAnswerType('True').correct, true);
  });

  it('"false" → boolean, correct: false', () => {
    const result = inferAnswerType('false');
    assert.equal(result.answer_type, 'boolean');
    assert.equal(result.correct, false);
  });

  it('single letter "B" → mcq, correct: "B"', () => {
    const result = inferAnswerType('B');
    assert.equal(result.answer_type, 'mcq');
    assert.equal(result.correct, 'B');
  });

  it('whitespace " A ; C " trims correctly → multi', () => {
    const result = inferAnswerType(' A ; C ');
    assert.equal(result.answer_type, 'multi');
    assert.deepEqual(result.correct, ['A', 'C']);
  });
});

describe('parseCodeArray()', () => {
  it('null → []', () => {
    assert.deepEqual(parseCodeArray(null), []);
  });

  it('undefined → []', () => {
    assert.deepEqual(parseCodeArray(undefined), []);
  });

  it('empty string → []', () => {
    assert.deepEqual(parseCodeArray(''), []);
  });

  it('dash "-" → []', () => {
    assert.deepEqual(parseCodeArray('-'), []);
  });

  it('"MA.8.EE.1;MA.8.EE.2" → ["MA.8.EE.1","MA.8.EE.2"]', () => {
    assert.deepEqual(parseCodeArray('MA.8.EE.1;MA.8.EE.2'), ['MA.8.EE.1', 'MA.8.EE.2']);
  });

  it('whitespace " MA.8.EE.1 ; MA.8.EE.2 " → trimmed array', () => {
    assert.deepEqual(parseCodeArray(' MA.8.EE.1 ; MA.8.EE.2 '), ['MA.8.EE.1', 'MA.8.EE.2']);
  });

  it('single code "MATH.1" → ["MATH.1"]', () => {
    assert.deepEqual(parseCodeArray('MATH.1'), ['MATH.1']);
  });
});

describe('detectQuestionsFromHTML() — Pass 1 (data-qref)', () => {
  it('extracts full inline annotations from data-qref elements', () => {
    const html = `<html><body>
      <p data-qref="Q1" data-points="2" data-correct="B" data-dese="MA.8.EE.1" data-goal="MATH.1">
        What is 2 + 2?
      </p>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].q_ref, 'Q1');
    assert.equal(qs[0].answer_type, 'mcq');
    assert.equal(qs[0].correct, 'B');
    assert.equal(qs[0].points, 2);
    assert.deepEqual(qs[0].default_goal_codes, ['MATH.1']);
    assert.deepEqual(qs[0].dese_codes, ['MA.8.EE.1']);
  });

  it('extracts multi answer type with semicolons in data-correct', () => {
    const html = `<html><body>
      <p data-qref="Q1" data-correct="A;C">Select all that apply.</p>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs[0].answer_type, 'multi');
    assert.deepEqual(qs[0].correct, ['A', 'C']);
  });

  it('extracts boolean answer type from data-correct="true"', () => {
    const html = `<html><body>
      <p data-qref="Q1" data-correct="true">Is the sky blue?</p>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs[0].answer_type, 'boolean');
    assert.equal(qs[0].correct, true);
  });

  it('constructed when data-correct is dash', () => {
    const html = `<html><body>
      <p data-qref="Q1" data-correct="-">Describe in detail.</p>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs[0].answer_type, 'constructed');
    assert.equal(qs[0].correct, null);
  });

  it('defaults points to 1 when data-points is absent', () => {
    const html = `<html><body>
      <p data-qref="Q1">Question text here long enough</p>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs[0].points, 1);
  });
});

describe('detectQuestionsFromHTML() — Pass 2 (form inputs)', () => {
  it('detects questions from input[name] with Q-pattern names', () => {
    const html = `<html><body>
      <form>
        <input name="Q1" type="text" />
        <select name="question2"><option>A</option></select>
      </form>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].q_ref, 'Q1');
    assert.equal(qs[1].q_ref, 'question2');
  });
});

describe('detectQuestionsFromHTML() — Pass 3 (fieldsets)', () => {
  it('detects questions from fieldset/legend', () => {
    const html = `<html><body>
      <fieldset><legend>Question 1: Reading Comprehension</legend><input /></fieldset>
      <fieldset><legend>Question 2: Math</legend><input /></fieldset>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].q_ref, 'Q1');
    assert.ok(qs[0].label.includes('Question 1'));
  });
});

describe('detectQuestionsFromHTML() — Pass 4 (ordered lists)', () => {
  it('detects questions from ol > li items', () => {
    const html = `<html><body>
      <ol>
        <li>What is the capital of France? Write a full sentence response.</li>
        <li>Describe the water cycle in your own words and give two examples.</li>
      </ol>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].q_ref, 'Q1');
    assert.equal(qs[1].q_ref, 'Q2');
  });

  it('skips li items shorter than MIN_QUESTION_LENGTH', () => {
    const html = `<html><body>
      <ol>
        <li>Short</li>
        <li>This question is long enough to pass the minimum length filter check.</li>
      </ol>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 1);
  });
});

describe('detectQuestionsFromHTML() — Pass 5 (class/ID patterns)', () => {
  it('detects questions from .question class elements', () => {
    const html = `<html><body>
      <div class="question">What is photosynthesis and how does it work in plants?</div>
      <div class="question">Explain the difference between mitosis and meiosis in detail.</div>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 2);
  });

  it('detects questions from [id^="question"] elements', () => {
    const html = `<html><body>
      <div id="question1">Describe the causes of World War I and their significance.</div>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].q_ref, 'question1');
  });
});

describe('detectQuestionsFromHTML() — Pass 6 (table rows)', () => {
  it('detects questions from table rows with numbered first cell', () => {
    const html = `<html><body>
      <table>
        <tr><td>1.</td><td>What is the speed of light in a vacuum environment?</td></tr>
        <tr><td>2.</td><td>Who discovered penicillin and when was this discovery made?</td></tr>
      </table>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].q_ref, 'Q1');
  });

  it('detects table rows with Q-prefixed first cell', () => {
    const html = `<html><body>
      <table>
        <tr><td>Q1</td><td>What is the Pythagorean theorem and how is it applied?</td></tr>
      </table>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 1);
  });
});

describe('detectQuestionsFromHTML() — Pass 7 (block fallback)', () => {
  it('detects questions from p tags within length range', () => {
    const html = `<html><body>
      <p>What is the meaning of life, the universe, and everything in this context?</p>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.ok(qs.length >= 1);
  });

  it('detects questions from div.question in fallback', () => {
    const html = `<html><body>
      <div class="question">Explain how a bill becomes a law in the United States Congress.</div>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.ok(qs.length >= 1);
  });
});

describe('detectQuestionsFromHTML() — pass priority', () => {
  it('Pass 1 (data-qref) wins over Pass 4 (ol > li) when both are present', () => {
    const html = `<html><body>
      <p data-qref="EXPLICIT1" data-correct="A">Annotated question with explicit qref attribute.</p>
      <ol>
        <li>An ordered list item that is long enough to be detected as a question.</li>
        <li>Another ordered list item that would also be detected in pass four detection.</li>
      </ol>
    </body></html>`;
    const qs = detectQuestionsFromHTML(html);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].q_ref, 'EXPLICIT1');
  });
});

describe('manifestQuestionsToItems() — end-to-end integration', () => {
  it('detect → bridge produces correct item shape', () => {
    const html = `<html><body>
      <p data-qref="Q1" data-points="2" data-correct="B" data-goal="MATH.1" data-dese="MA.8.EE.1">MCQ question text here</p>
    </body></html>`;
    const questions = detectQuestionsFromHTML(html);
    const items = manifestQuestionsToItems(questions);
    assert.equal(items.length, 1);
    assert.equal(items[0].ref, 'Q1');
    assert.equal(items[0].answer_type, 'mcq');
    assert.equal(items[0].points, 2);
    assert.equal(items[0].correct, 'B');
    assert.deepEqual(items[0].goal_codes, ['MATH.1']);
    assert.deepEqual(items[0].dese_codes, ['MA.8.EE.1']);
    assert.deepEqual(items[0].scoring, {});
  });

  it('mixed answer types in one HTML document', () => {
    const html = `<html><body>
      <p data-qref="Q1" data-correct="B">MCQ question here</p>
      <p data-qref="Q2" data-correct="A;C">Multi-select question here</p>
      <p data-qref="Q3" data-correct="true">True or false question here</p>
      <p data-qref="Q4" data-correct="-">Constructed response question here</p>
    </body></html>`;
    const questions = detectQuestionsFromHTML(html);
    const items = manifestQuestionsToItems(questions);
    assert.equal(items.length, 4);

    const byRef = {};
    items.forEach(function (item) { byRef[item.ref] = item; });

    assert.equal(byRef['Q1'].answer_type, 'mcq');
    assert.equal(byRef['Q1'].correct, 'B');

    assert.equal(byRef['Q2'].answer_type, 'multi');
    assert.deepEqual(byRef['Q2'].correct, ['A', 'C']);

    assert.equal(byRef['Q3'].answer_type, 'boolean');
    assert.equal(byRef['Q3'].correct, true);

    assert.equal(byRef['Q4'].answer_type, 'constructed');
    assert.equal(byRef['Q4'].correct, null);
  });
});

describe('buildItemsFromMeta() — Path B (meta.questions)', () => {
  it('meta.questions flat array → items with correct shape', () => {
    const meta = {
      questions: [
        { q_ref: 'Q1', answer_type: 'mcq', points: 2, default_goal_codes: ['MATH.1'], label: 'Q1 text', correct: 'B' },
        { q_ref: 'Q2', answer_type: 'constructed', points: 3, default_goal_codes: [], label: 'Q2 text', correct: null }
      ]
    };
    const items = buildItemsFromMeta('assign-123', meta);
    assert.equal(items.length, 2);
    assert.equal(items[0].item_ref, 'Q1');
    assert.equal(items[0].answer_type, 'mcq');
    assert.equal(items[0].points, 2);
    assert.deepEqual(items[0].goal_codes, ['MATH.1']);
    assert.equal(items[0].meta.correct, 'B');
    assert.equal(items[0].assignment_id, 'assign-123');

    assert.equal(items[1].item_ref, 'Q2');
    assert.equal(items[1].answer_type, 'constructed');
    assert.equal(items[1].points, 3);
    assert.equal(items[1].meta.correct, undefined);
  });

  it('meta.days takes priority when both meta.days and meta.questions exist', () => {
    const meta = {
      days: [
        { day_number: 1, type: 'questions', questions: [{ number: 1, text: 'Day Q', correct: 'A', choices: ['A','B'], hint: '' }] }
      ],
      questions: [
        { q_ref: 'Q1', answer_type: 'mcq', points: 1, label: 'Should be ignored', correct: 'B' }
      ]
    };
    const items = buildItemsFromMeta('assign-456', meta);
    assert.equal(items.length, 1);
    assert.equal(items[0].item_ref, '1_1');
  });

  it('empty meta.questions → []', () => {
    const items = buildItemsFromMeta('assign-789', { questions: [] });
    assert.deepEqual(items, []);
  });

  it('questions with missing q_ref get auto-numbered', () => {
    const meta = {
      questions: [
        { answer_type: 'mcq', points: 1, label: 'No ref question one here', correct: 'A' },
        { answer_type: 'mcq', points: 1, label: 'No ref question two here', correct: 'B' }
      ]
    };
    const items = buildItemsFromMeta('assign-abc', meta);
    assert.equal(items.length, 2);
    assert.equal(items[0].item_ref, 'Q1');
    assert.equal(items[1].item_ref, 'Q2');
  });

  it('questions with default_goal_codes → mapped to goal_codes', () => {
    const meta = {
      questions: [
        { q_ref: 'Q1', answer_type: 'mcq', points: 1, default_goal_codes: ['IEP.GOAL.1', 'IEP.GOAL.2'], label: 'Q1', correct: 'A' }
      ]
    };
    const items = buildItemsFromMeta('assign-def', meta);
    assert.deepEqual(items[0].goal_codes, ['IEP.GOAL.1', 'IEP.GOAL.2']);
  });
});

describe('Full pipeline integration', () => {
  it('detect → bridge and detect → buildItemsFromMeta produce structurally equivalent items', () => {
    const html = `<html><body>
      <p data-qref="Q1" data-points="2" data-correct="B" data-goal="MATH.1">MCQ question about math content</p>
      <p data-qref="Q2" data-points="1" data-correct="A;C" data-goal="MATH.2">Multi question about science</p>
      <p data-qref="Q3" data-points="1" data-correct="true">Boolean true or false question</p>
      <p data-qref="Q4" data-points="3" data-correct="-">Constructed response long answer question</p>
    </body></html>`;

    const questions = detectQuestionsFromHTML(html);
    assert.equal(questions.length, 4);

    // Path via manifestQuestionsToItems (bridge)
    const bridgeItems = manifestQuestionsToItems(questions);

    // Path via buildItemsFromMeta (server backfill) using same questions as meta.questions
    const backfillItems = buildItemsFromMeta('test-assign-001', { questions: questions });

    // Same count
    assert.equal(bridgeItems.length, backfillItems.length);

    // Same item_ref / ref values
    const bridgeRefs = bridgeItems.map(function (i) { return i.ref; }).sort();
    const backfillRefs = backfillItems.map(function (i) { return i.item_ref; }).sort();
    assert.deepEqual(bridgeRefs, backfillRefs);

    // Same answer_type values
    const bridgeTypes = bridgeItems.map(function (i) { return i.answer_type; }).sort();
    const backfillTypes = backfillItems.map(function (i) { return i.answer_type; }).sort();
    assert.deepEqual(bridgeTypes, backfillTypes);
  });
});
