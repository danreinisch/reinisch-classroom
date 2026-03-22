// Unit tests for the expanded detectQuestionsFromHTML function
// Run with: node tests/detect-questions-from-html.test.cjs

'use strict';

const assert = require('assert');

// ── Polyfill DOMParser for Node.js ────────────────────────────────────────────
// These tests run in Node where DOMParser / document are not available.
// We use a minimal HTML parser via the built-in vm + a lightweight JSDOM-like
// approach. Since JSDOM is not installed we inline the pure logic extracted from
// assignment-manifest.js and re-implement the DOM surface we need via the
// 'node:vm' + lightweight stubs below.
//
// Strategy: inline the pure helper functions (inferAnswerType, parseCodeArray)
// and rewrite detectQuestionsFromHTML so that it accepts a pre-built "doc"
// object (simulated DOM) instead of calling DOMParser.  We then test by
// passing simulated DOMs that exercise every code path.

// ── Inlined helpers (must stay in sync with assignment-manifest.js) ───────────

const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 500;

function inferAnswerType(rawCorrect) {
  const val = (rawCorrect || '').trim();
  if (!val || val === '-') {
    return { answer_type: 'constructed', correct: null };
  }
  if (val.includes(';')) {
    return {
      answer_type: 'multi',
      correct: val.split(';').map(c => c.trim()).filter(c => c)
    };
  }
  if (/^(true|false)$/i.test(val)) {
    return { answer_type: 'boolean', correct: val.toLowerCase() === 'true' };
  }
  return { answer_type: 'mcq', correct: val };
}

function parseCodeArray(codeStr) {
  if (!codeStr || codeStr === '-') return [];
  return codeStr.split(';').map(c => c.trim()).filter(c => c.length > 0);
}

// ── Minimal simulated DOM helpers ─────────────────────────────────────────────

/**
 * Build a minimal element stub that supports:
 *   - getAttribute(name)
 *   - get textContent
 *   - querySelectorAll(selector)  (limited — see makeDoc)
 *   - querySelector(selector)
 */
function makeEl(tag, attrs = {}, children = [], text = '') {
  const el = {
    tag: tag.toLowerCase(),
    _attrs: attrs,
    _children: children,
    _text: text,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null; },
    get textContent() {
      const childText = this._children.map(c => (typeof c === 'string' ? c : c.textContent)).join('');
      return this._text + childText;
    },
    querySelector(sel) {
      // Return the first matching descendant in document order
      // by iterating all descendants and checking each selector part
      const parts = sel.split(',').map(s => s.trim());
      const stack = [...this._children];
      while (stack.length > 0) {
        const child = stack.shift();
        if (typeof child === 'string') continue;
        for (const part of parts) {
          if (_matchesSingle(child, part)) return child;
        }
        if (child._children) stack.unshift(...child._children);
      }
      return null;
    },
    querySelectorAll(sel) {
      const results = [];
      querySelectorAll(this, sel, results);
      return results;
    }
  };
  return el;
}

/**
 * Very minimal querySelectorAll that handles the selectors used in the function.
 * Supports: tag, [attr], [attr^="val"], [attr*="val"], .class, tag > child, and
 * comma-separated lists.
 */
function querySelectorAll(root, selector, results) {
  const parts = selector.split(',').map(s => s.trim());
  for (const part of parts) {
    _qsAll(root, part, results);
  }
}

function _qsAll(el, sel, results) {
  // Descend into children
  if (!el._children) return;
  for (const child of el._children) {
    if (typeof child === 'string') continue;
    if (_matches(child, sel)) results.push(child);
    _qsAll(child, sel, results);
  }
}

function _matches(el, sel) {
  // Handle child combinator: "ol > li"
  if (sel.includes(' > ')) {
    // We can't easily check parent here in this minimal impl;
    // we rely on the doc-level querySelectorAll to pre-filter.
    return false;
  }
  const s = sel.trim();
  // [attr]
  if (/^\[([^\]^*~|$]+)\]$/.test(s)) {
    const attr = s.slice(1, -1);
    return el.getAttribute(attr) !== null;
  }
  // [attr^="val"]
  const startsWith = s.match(/^\[([^\]]+)\^="([^"]+)"\]$/);
  if (startsWith) {
    const v = el.getAttribute(startsWith[1]);
    return v !== null && v.startsWith(startsWith[2]);
  }
  // [attr*="val"]
  const contains = s.match(/^\[([^\]]+)\*="([^"]+)"\]$/);
  if (contains) {
    const v = el.getAttribute(contains[1]);
    return v !== null && v.includes(contains[2]);
  }
  // .class
  if (s.startsWith('.')) {
    const cls = s.slice(1);
    const v = el.getAttribute('class') || '';
    return v.split(/\s+/).includes(cls);
  }
  // tag
  return el.tag === s.toLowerCase();
}

/**
 * Build a document stub with a custom querySelectorAll that knows about
 * child combinators and comma-selectors.  We pre-process the DOM tree.
 */
function makeDoc(body) {
  function allDescendants(el) {
    const acc = [];
    if (!el._children) return acc;
    for (const c of el._children) {
      if (typeof c === 'string') continue;
      acc.push(c);
      acc.push(...allDescendants(c));
    }
    return acc;
  }

  function allParentChildPairs(el) {
    const pairs = []; // {parent, child}
    if (!el._children) return pairs;
    for (const c of el._children) {
      if (typeof c === 'string') continue;
      pairs.push({ parent: el, child: c });
      pairs.push(...allParentChildPairs(c));
    }
    return pairs;
  }

  return {
    querySelectorAll(sel) {
      const results = [];
      const parts = sel.split(',').map(s => s.trim());
      const allEls = allDescendants(body);

      for (const part of parts) {
        if (part.includes(' > ')) {
          // Child combinator: "parent > child"
          const pairs = allParentChildPairs(body);
          const [parentSel, childSel] = part.split(' > ').map(s => s.trim());
          for (const { parent, child } of pairs) {
            if (_matchesSingle(parent, parentSel) && _matchesSingle(child, childSel)) {
              if (!results.includes(child)) results.push(child);
            }
          }
        } else if (/ /.test(part)) {
          // Descendant combinator: "ancestor descendant"
          const spaceIdx = part.indexOf(' ');
          const ancestorSel = part.substring(0, spaceIdx).trim();
          const descSel = part.substring(spaceIdx + 1).trim();
          for (const el of allEls) {
            if (_matchesSingle(el, ancestorSel)) {
              // Find all descendants of el that match descSel
              const descendants = allDescendants(el);
              for (const desc of descendants) {
                if (_matchesSingle(desc, descSel) && !results.includes(desc)) {
                  results.push(desc);
                }
              }
            }
          }
        } else {
          for (const el of allEls) {
            if (_matchesSingle(el, part) && !results.includes(el)) {
              results.push(el);
            }
          }
        }
      }
      return results;
    }
  };
}

function _matchesSingle(el, s) {
  s = s.trim();
  if (!s) return false;
  if (s === '*') return true;

  // tag[attr], tag[attr^="val"], tag[attr*="val"]
  const tagAndAttr = s.match(/^([a-zA-Z][a-zA-Z0-9]*)(\[.+\])$/);
  if (tagAndAttr) {
    if (el.tag !== tagAndAttr[1].toLowerCase()) return false;
    return _matchesSingle(el, tagAndAttr[2]);
  }

  if (/^\[([^\]^*~|$]+)\]$/.test(s)) {
    const attr = s.slice(1, -1);
    return el.getAttribute(attr) !== null;
  }
  const startsWith = s.match(/^\[([^\]]+)\^="([^"]+)"\]$/);
  if (startsWith) {
    const v = el.getAttribute(startsWith[1]);
    return v !== null && v.startsWith(startsWith[2]);
  }
  const contains = s.match(/^\[([^\]]+)\*="([^"]+)"\]$/);
  if (contains) {
    const v = el.getAttribute(contains[1]);
    return v !== null && v.includes(contains[2]);
  }
  if (s.startsWith('.')) {
    const cls = s.slice(1);
    const v = el.getAttribute('class') || '';
    return v.split(/\s+/).includes(cls);
  }
  return el.tag === s.toLowerCase();
}

// ── Inlined detectQuestionsFromHTML (adapted to accept a pre-built doc) ───────

function detectQuestionsFromHTML(doc) {
  const questions = [];

  // Pass 1: [data-qref]
  const explicitQuestions = doc.querySelectorAll('[data-qref]');
  if (explicitQuestions.length > 0) {
    explicitQuestions.forEach((el, idx) => {
      const q_ref = el.getAttribute('data-qref');
      const label = el.textContent.trim().substring(0, 100) || `Question ${idx + 1}`;

      const pointsRaw = el.getAttribute('data-points');
      const pointsParsed = parseFloat(pointsRaw);
      const points = pointsRaw !== null ? (isNaN(pointsParsed) ? 1 : pointsParsed) : 1;

      const rawCorrect = el.getAttribute('data-correct');
      const rawAnswerType = el.getAttribute('data-answer-type');

      let answer_type, correct;
      if (rawAnswerType && ['mcq', 'multi', 'boolean', 'constructed'].includes(rawAnswerType)) {
        answer_type = rawAnswerType;
        const inferred = inferAnswerType(rawCorrect);
        correct = inferred.correct;
      } else {
        const inferred = inferAnswerType(rawCorrect);
        answer_type = inferred.answer_type;
        correct = inferred.correct;
      }

      const dese_codes = parseCodeArray(el.getAttribute('data-dese'));
      const default_goal_codes = parseCodeArray(el.getAttribute('data-goal'));

      questions.push({
        q_ref,
        label,
        skill_tags: [],
        points,
        default_goal_codes,
        dese_codes,
        correct,
        answer_type,
        per_student_overrides: {}
      });
    });
    return questions;
  }

  // Pass 2: Form inputs grouped by name
  const inputEls = doc.querySelectorAll('input[name], select[name], textarea[name]');
  const seenNames = new Set();
  inputEls.forEach((el) => {
    const name = el.getAttribute('name');
    if (!name || seenNames.has(name)) return;
    if (/^Q\d+$/i.test(name) || /^question/i.test(name)) {
      seenNames.add(name);
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

  // Pass 3: fieldset with legend
  const fieldsets = doc.querySelectorAll('fieldset');
  fieldsets.forEach((fs, idx) => {
    const legend = fs.querySelector('legend');
    const label = legend ? legend.textContent.trim().substring(0, 100) : `Question ${idx + 1}`;
    questions.push({
      q_ref: `Q${idx + 1}`,
      label,
      skill_tags: [],
      points: 1,
      default_goal_codes: [],
      per_student_overrides: {}
    });
  });
  if (questions.length > 0) return questions;

  // Pass 4: ol > li
  const olItems = doc.querySelectorAll('ol > li');
  olItems.forEach((li, idx) => {
    const text = li.textContent.trim();
    if (text.length > MIN_QUESTION_LENGTH) {
      questions.push({
        q_ref: `Q${idx + 1}`,
        label: text.substring(0, 100),
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });
  if (questions.length > 0) return questions;

  // Pass 5: Class/ID patterns
  const patternEls = doc.querySelectorAll(
    '.question, [class*="q-"], [id^="q-"], [id^="question"], [data-question]'
  );
  patternEls.forEach((el, idx) => {
    const text = el.textContent.trim();
    if (text.length > MIN_QUESTION_LENGTH) {
      const id = el.getAttribute('id') || el.getAttribute('data-question') || `Q${idx + 1}`;
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

  // Pass 6: Table rows
  const tableRows = doc.querySelectorAll('table tr');
  tableRows.forEach((row, idx) => {
    const firstCell = row.querySelector('td, th');
    if (!firstCell) return;
    const cellText = firstCell.textContent.trim();
    if (/^\d+[.)\s]/.test(cellText) || /^Q\d+/i.test(cellText)) {
      const label = row.textContent.trim().substring(0, 100);
      questions.push({
        q_ref: `Q${idx + 1}`,
        label,
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });
  if (questions.length > 0) return questions;

  // Pass 7: Block-element fallback
  const blockElements = doc.querySelectorAll('p, div.question, section, article, li');
  blockElements.forEach((el, idx) => {
    const text = el.textContent.trim();
    if (text.length > MIN_QUESTION_LENGTH && text.length < MAX_QUESTION_LENGTH) {
      const q_ref = `Q${idx + 1}`;
      const label = text.substring(0, 100);
      questions.push({
        q_ref,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

// Helper: build a body containing a single element
function body(...children) {
  return makeEl('body', {}, children);
}

// ─── inferAnswerType ──────────────────────────────────────────────────────────

console.log('--- inferAnswerType ---');

{
  const r = inferAnswerType('');
  assert.strictEqual(r.answer_type, 'constructed');
  assert.strictEqual(r.correct, null);
  console.log('✓ empty string → constructed');
}
{
  const r = inferAnswerType('-');
  assert.strictEqual(r.answer_type, 'constructed');
  assert.strictEqual(r.correct, null);
  console.log('✓ dash → constructed');
}
{
  const r = inferAnswerType(null);
  assert.strictEqual(r.answer_type, 'constructed');
  assert.strictEqual(r.correct, null);
  console.log('✓ null → constructed');
}
{
  const r = inferAnswerType('A;C;D');
  assert.strictEqual(r.answer_type, 'multi');
  assert.deepStrictEqual(r.correct, ['A', 'C', 'D']);
  console.log('✓ semicolon → multi with array');
}
{
  const r = inferAnswerType('true');
  assert.strictEqual(r.answer_type, 'boolean');
  assert.strictEqual(r.correct, true);
  console.log('✓ "true" → boolean true');
}
{
  const r = inferAnswerType('FALSE');
  assert.strictEqual(r.answer_type, 'boolean');
  assert.strictEqual(r.correct, false);
  console.log('✓ "FALSE" → boolean false');
}
{
  const r = inferAnswerType('B');
  assert.strictEqual(r.answer_type, 'mcq');
  assert.strictEqual(r.correct, 'B');
  console.log('✓ single letter → mcq');
}

// ─── parseCodeArray ───────────────────────────────────────────────────────────

console.log('--- parseCodeArray ---');

{
  assert.deepStrictEqual(parseCodeArray(''), []);
  console.log('✓ empty string → []');
}
{
  assert.deepStrictEqual(parseCodeArray('-'), []);
  console.log('✓ dash → []');
}
{
  assert.deepStrictEqual(parseCodeArray(null), []);
  console.log('✓ null → []');
}
{
  assert.deepStrictEqual(parseCodeArray('MA.8.EE.1;MA.8.EE.2'), ['MA.8.EE.1', 'MA.8.EE.2']);
  console.log('✓ semicolon-separated codes → array');
}
{
  assert.deepStrictEqual(parseCodeArray('MATH.1'), ['MATH.1']);
  console.log('✓ single code → single-element array');
}

// ─── Pass 1: [data-qref] with inline attributes ───────────────────────────────

console.log('--- Pass 1: [data-qref] inline attributes ---');

{
  // Basic data-qref without any optional attributes
  const q1 = makeEl('div', { 'data-qref': 'Q1' }, [], 'What is 2 + 2?');
  const doc = makeDoc(body(q1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  assert.strictEqual(questions[0].points, 1);
  assert.strictEqual(questions[0].answer_type, 'constructed');
  assert.strictEqual(questions[0].correct, null);
  assert.deepStrictEqual(questions[0].dese_codes, []);
  assert.deepStrictEqual(questions[0].default_goal_codes, []);
  assert.deepStrictEqual(questions[0].per_student_overrides, {});
  console.log('✓ basic data-qref sets defaults');
}

{
  // MCQ with all inline attributes
  const q1 = makeEl('div', {
    'data-qref': 'Q1',
    'data-points': '2',
    'data-correct': 'B',
    'data-dese': 'MA.8.EE.1',
    'data-goal': 'MATH.1'
  }, [], 'What is 2 + 2?');
  const doc = makeDoc(body(q1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  assert.strictEqual(questions[0].points, 2);
  assert.strictEqual(questions[0].answer_type, 'mcq');
  assert.strictEqual(questions[0].correct, 'B');
  assert.deepStrictEqual(questions[0].dese_codes, ['MA.8.EE.1']);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['MATH.1']);
  console.log('✓ MCQ with full inline attributes parsed correctly');
}

{
  // Multi-select via semicolons in data-correct
  const q1 = makeEl('div', {
    'data-qref': 'Q2',
    'data-points': '2',
    'data-correct': 'A;C;D',
    'data-dese': 'MA.8.EE.3',
    'data-goal': 'MATH.2'
  }, [], 'Select all that simplify correctly');
  const doc = makeDoc(body(q1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions[0].answer_type, 'multi');
  assert.deepStrictEqual(questions[0].correct, ['A', 'C', 'D']);
  assert.strictEqual(questions[0].points, 2);
  console.log('✓ multi-select auto-detected from semicolons in data-correct');
}

{
  // Boolean via "true" in data-correct
  const q1 = makeEl('div', {
    'data-qref': 'Q3',
    'data-correct': 'true',
    'data-dese': 'MA.8.G.1',
    'data-goal': 'MATH.4'
  }, [], 'All squares are rectangles. True or False?');
  const doc = makeDoc(body(q1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions[0].answer_type, 'boolean');
  assert.strictEqual(questions[0].correct, true);
  console.log('✓ boolean auto-detected from "true" in data-correct');
}

{
  // Constructed response via explicit data-answer-type attribute
  const q1 = makeEl('div', {
    'data-qref': 'Q4',
    'data-points': '3',
    'data-answer-type': 'constructed',
    'data-dese': 'MA.8.EE.4;MA.8.F.2',
    'data-goal': 'MATH.1;MATH.5'
  }, [], 'Explain the relationship between slope and y-intercept.');
  const doc = makeDoc(body(q1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions[0].answer_type, 'constructed');
  assert.strictEqual(questions[0].points, 3);
  assert.deepStrictEqual(questions[0].dese_codes, ['MA.8.EE.4', 'MA.8.F.2']);
  assert.deepStrictEqual(questions[0].default_goal_codes, ['MATH.1', 'MATH.5']);
  console.log('✓ constructed response via explicit data-answer-type');
}

{
  // Multiple questions with inline attributes
  const q1 = makeEl('div', { 'data-qref': 'Q1', 'data-correct': 'A' }, [], 'Q1 text here long enough');
  const q2 = makeEl('div', { 'data-qref': 'Q2', 'data-correct': 'B' }, [], 'Q2 text here long enough');
  const doc = makeDoc(body(q1, q2));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 2);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  assert.strictEqual(questions[1].q_ref, 'Q2');
  console.log('✓ multiple data-qref elements all extracted');
}

{
  // data-answer-type overrides auto-detection
  const q1 = makeEl('div', {
    'data-qref': 'Q1',
    'data-correct': 'B',
    'data-answer-type': 'mcq'
  }, [], 'Question text');
  const doc = makeDoc(body(q1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions[0].answer_type, 'mcq');
  console.log('✓ explicit data-answer-type overrides auto-detection');
}

{
  // data-points="0" — zero should be preserved, not replaced by default 1
  const q1 = makeEl('div', {
    'data-qref': 'Q1',
    'data-points': '0'
  }, [], 'Optional bonus question text');
  const doc = makeDoc(body(q1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions[0].points, 0, 'zero points should be preserved');
  console.log('✓ data-points="0" preserved as zero (not replaced by default 1)');
}

// ─── Pass 2: Form inputs ──────────────────────────────────────────────────────

console.log('--- Pass 2: Form inputs ---');

{
  // Inputs with Q* names
  const i1 = makeEl('input', { name: 'Q1', type: 'radio' });
  const i2 = makeEl('input', { name: 'Q1', type: 'radio' }); // duplicate name — same question
  const i3 = makeEl('input', { name: 'Q2', type: 'text' });
  const doc = makeDoc(body(i1, i2, i3));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 2, 'two unique names Q1 and Q2');
  assert.strictEqual(questions[0].q_ref, 'Q1');
  assert.strictEqual(questions[1].q_ref, 'Q2');
  console.log('✓ form inputs with Q* names grouped by name');
}

{
  // textarea with question* name
  const t = makeEl('textarea', { name: 'question1' });
  const doc = makeDoc(body(t));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'question1');
  console.log('✓ textarea with question* name detected');
}

{
  // Inputs without Q* names are ignored
  const i1 = makeEl('input', { name: 'email', type: 'text' });
  const i2 = makeEl('input', { name: 'submit_btn', type: 'submit' });
  const doc = makeDoc(body(i1, i2));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 0, 'non-matching names should yield 0');
  console.log('✓ inputs with non-matching names are ignored');
}

// ─── Pass 3: Fieldsets ────────────────────────────────────────────────────────

console.log('--- Pass 3: Fieldsets ---');

{
  const legend1 = makeEl('legend', {}, [], 'What is the capital of France?');
  const fs1 = makeEl('fieldset', {}, [legend1], '');
  const legend2 = makeEl('legend', {}, [], 'Select all prime numbers.');
  const fs2 = makeEl('fieldset', {}, [legend2], '');
  const doc = makeDoc(body(fs1, fs2));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 2);
  assert.strictEqual(questions[0].label, 'What is the capital of France?');
  assert.strictEqual(questions[1].label, 'Select all prime numbers.');
  console.log('✓ fieldsets with legends detected');
}

{
  // Fieldset without legend uses fallback label
  const fs = makeEl('fieldset', {}, [], '');
  const doc = makeDoc(body(fs));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].label, 'Question 1');
  console.log('✓ fieldset without legend gets fallback label');
}

// ─── Pass 4: Ordered list items ───────────────────────────────────────────────

console.log('--- Pass 4: Ordered list items ---');

{
  const li1 = makeEl('li', {}, [], 'What is the slope of this line?');
  const li2 = makeEl('li', {}, [], 'Simplify the following expression.');
  const ol = makeEl('ol', {}, [li1, li2]);
  const doc = makeDoc(body(ol));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 2);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  assert.strictEqual(questions[1].q_ref, 'Q2');
  console.log('✓ ordered list items detected');
}

{
  // Short ol items are ignored
  const li1 = makeEl('li', {}, [], 'Hi');
  const ol = makeEl('ol', {}, [li1]);
  const doc = makeDoc(body(ol));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 0, 'too-short li should be ignored');
  console.log('✓ short ordered list items are ignored');
}

// ─── Pass 5: Class/ID patterns ────────────────────────────────────────────────

console.log('--- Pass 5: Class/ID patterns ---');

{
  // .question class
  const el = makeEl('div', { class: 'question' }, [], 'This is a question about math.');
  const doc = makeDoc(body(el));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  console.log('✓ .question class detected');
}

{
  // [class*="q-"]
  const el = makeEl('div', { class: 'q-item' }, [], 'This is another question for testing.');
  const doc = makeDoc(body(el));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  console.log('✓ [class*="q-"] pattern detected');
}

{
  // [id^="q-"]
  const el = makeEl('div', { id: 'q-1' }, [], 'A question with q- prefixed id attribute.');
  const doc = makeDoc(body(el));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'q-1');
  console.log('✓ [id^="q-"] pattern detected, uses id as q_ref');
}

{
  // [id^="question"]
  const el = makeEl('div', { id: 'question-3' }, [], 'A question with question- id prefix.');
  const doc = makeDoc(body(el));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'question-3');
  console.log('✓ [id^="question"] pattern detected, uses id as q_ref');
}

{
  // [data-question]
  const el = makeEl('div', { 'data-question': 'yes' }, [], 'A data-question flagged element text.');
  const doc = makeDoc(body(el));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'yes');
  console.log('✓ [data-question] attribute detected, uses attribute value as q_ref');
}

// ─── Pass 6: Table rows ───────────────────────────────────────────────────────

console.log('--- Pass 6: Table rows ---');

{
  // Rows with digit + period pattern in first cell
  const td1 = makeEl('td', {}, [], '1. ');
  const td2 = makeEl('td', {}, [], 'What is the square root of 144?');
  const tr = makeEl('tr', {}, [td1, td2]);
  const table = makeEl('table', {}, [tr]);
  const doc = makeDoc(body(table));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  console.log('✓ table row with digit-period first cell detected');
}

{
  // Rows with Q* pattern in first cell
  const th = makeEl('th', {}, [], 'Q5');
  const td = makeEl('td', {}, [], 'Describe the water cycle.');
  const tr = makeEl('tr', {}, [th, td]);
  const table = makeEl('table', {}, [tr]);
  const doc = makeDoc(body(table));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  console.log('✓ table row with Q* first cell detected');
}

{
  // Table with header row that doesn't match — ignored
  const th = makeEl('th', {}, [], 'Question Text');
  const tr = makeEl('tr', {}, [th]);
  const table = makeEl('table', {}, [tr]);
  const doc = makeDoc(body(table));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 0, 'non-matching header cell should be ignored');
  console.log('✓ table row with non-matching first cell is ignored');
}

// ─── Pass 7: Fallback (block elements) ───────────────────────────────────────

console.log('--- Pass 7: Block-element fallback ---');

{
  // Paragraphs with suitable length
  const p1 = makeEl('p', {}, [], 'This is a question that is long enough to pass the filter.');
  const doc = makeDoc(body(p1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  console.log('✓ block-element fallback detects <p> with sufficient length');
}

{
  // Too-short paragraph is skipped
  const p1 = makeEl('p', {}, [], 'Short');
  const doc = makeDoc(body(p1));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 0);
  console.log('✓ too-short paragraph is skipped in fallback');
}

// ─── Priority ordering: earlier passes prevent later passes ──────────────────

console.log('--- Priority ordering ---');

{
  // If data-qref elements exist, form inputs pass should NOT run
  const qDiv = makeEl('div', { 'data-qref': 'Q1' }, [], 'A question text');
  const inp = makeEl('input', { name: 'Q2' });
  const doc = makeDoc(body(qDiv, inp));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  console.log('✓ data-qref pass takes priority over form inputs pass');
}

{
  // If form inputs found, fieldset pass should NOT run
  const inp = makeEl('input', { name: 'Q1' });
  const legend = makeEl('legend', {}, [], 'This should not appear');
  const fs = makeEl('fieldset', {}, [legend]);
  const doc = makeDoc(body(inp, fs));
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].q_ref, 'Q1');
  console.log('✓ form inputs pass takes priority over fieldset pass');
}

// ─── Empty HTML fallback ──────────────────────────────────────────────────────

console.log('--- Empty HTML ---');

{
  const doc = makeDoc(body());
  const questions = detectQuestionsFromHTML(doc);
  assert.strictEqual(questions.length, 0);
  console.log('✓ empty document returns empty array');
}

// ─── Output shape compatibility with parseTxtMapping ─────────────────────────

console.log('--- Output shape compatibility ---');

{
  // The output shape should be compatible with what parseTxtMapping produces
  // parseTxtMapping items: { ref, answer_type, points, correct, dese_codes, goal_codes, notes }
  // detectQuestionsFromHTML items: { q_ref, label, skill_tags, points, default_goal_codes,
  //                                  dese_codes, correct, answer_type, per_student_overrides }
  const q = makeEl('div', {
    'data-qref': 'Q1',
    'data-points': '2',
    'data-correct': 'A',
    'data-dese': 'MA.8.EE.1',
    'data-goal': 'MATH.1'
  }, [], 'Sample question text for testing');
  const doc = makeDoc(body(q));
  const questions = detectQuestionsFromHTML(doc);
  const item = questions[0];

  // Shared fields present in both formats
  assert.strictEqual(typeof item.answer_type, 'string', 'answer_type should be a string');
  assert.strictEqual(typeof item.points, 'number', 'points should be a number');
  assert.ok(Array.isArray(item.dese_codes), 'dese_codes should be an array');
  assert.ok(Array.isArray(item.default_goal_codes), 'default_goal_codes should be an array');
  assert.ok('correct' in item, 'correct field should be present');
  assert.ok('per_student_overrides' in item, 'per_student_overrides should be present');
  assert.ok(Array.isArray(item.skill_tags), 'skill_tags should be an array');
  console.log('✓ output shape is compatible with parseTxtMapping output');
}

console.log('\nAll detect-questions-from-html tests passed ✓');
