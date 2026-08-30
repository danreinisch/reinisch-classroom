// Unit tests for parseStudentSections() from tc-work.js (mega-UX IIFE)
// Run with: node tests/parse-student-sections.test.cjs

'use strict';

const assert = require('assert');
const parseStudentSections = require('../site/web/shared/parse-student-sections.js');

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nparseStudentSections() tests\n');

test('Basic 2-student file with Assignment/Class headers', () => {
  const input = [
    '================================================================================',
    'Assignment: S016',
    'Class: Life Skills Language Arts SC',
    '================================================================================',
    'Q1. What is a synonym?',
    'A) A word meaning the same',
    'B) A word meaning the opposite',
    '================================================================================',
    'Assignment: S017',
    'Class: Language Arts 3 SC',
    '================================================================================',
    'Q1. What is an antonym?',
    'A) A word meaning the same',
    'B) A word meaning the opposite',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 2, `Expected 2 sections, got ${sections.length}`);
  assert.strictEqual(sections[0].studentCode, 'S016');
  assert.strictEqual(sections[0].className, 'Life Skills Language Arts SC');
  assert.ok(sections[0].body.includes('Q1. What is a synonym?'), 'S016 body should contain Q1');
  assert.strictEqual(sections[1].studentCode, 'S017');
  assert.strictEqual(sections[1].className, 'Language Arts 3 SC');
  assert.ok(sections[1].body.includes('Q1. What is an antonym?'), 'S017 body should contain Q1');
});

test('File with preamble text before first student section', () => {
  const input = [
    'Week 9 Individualized Assignments',
    'Teacher notes go here',
    '',
    '================================================================================',
    'Assignment: S018',
    'Class: Life Skills Language Arts SC',
    '================================================================================',
    'DAY 1',
    'Q1. Read the passage.',
    '================================================================================',
    'Assignment: S019',
    'Class: Language Arts 4 SC',
    '================================================================================',
    'DAY 1',
    'Q1. Answer the question.',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 2, `Expected 2 sections, got ${sections.length}`);
  assert.strictEqual(sections[0].studentCode, 'S018');
  assert.strictEqual(sections[1].studentCode, 'S019');
});

test('File with missing Class line should still parse (className empty string)', () => {
  const input = [
    '================================================================================',
    'Assignment: S020',
    '================================================================================',
    'Q1. What is 2 + 2?',
    'A) 3',
    'B) 4 ✓',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 1, `Expected 1 section, got ${sections.length}`);
  assert.strictEqual(sections[0].studentCode, 'S020');
  assert.strictEqual(sections[0].className, '', 'className should be empty string when Class line missing');
  assert.ok(sections[0].body.includes('Q1.'), 'body should contain question');
});

test('Single student section', () => {
  const input = [
    '================================================================================',
    'Assignment: S021',
    'Class: Consumer Math',
    '================================================================================',
    'Calculate the total cost.',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].studentCode, 'S021');
  assert.strictEqual(sections[0].className, 'Consumer Math');
  assert.ok(sections[0].body.includes('Calculate'));
});

test('Empty file returns empty array', () => {
  assert.deepStrictEqual(parseStudentSections(''), []);
  assert.deepStrictEqual(parseStudentSections(null), []);
  assert.deepStrictEqual(parseStudentSections(undefined), []);
});

test('File with no Assignment headers returns empty array', () => {
  const input = [
    '================================================================================',
    'Life Skills Language Arts SC',
    '================================================================================',
    'Q1. A question',
    '================================================================================',
    'Language Arts 3 SC',
    '================================================================================',
    'Q1. Another question',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 0, 'Mega-TXT class sections should not be parsed as student sections');
});

test('Body content is trimmed', () => {
  const input = [
    '================================================================================',
    'Assignment: S022',
    'Class: Geometry SC',
    '================================================================================',
    '',
    '   Q1. Find the area.',
    '',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 1);
  assert.ok(!sections[0].body.startsWith('\n'), 'body should not start with newline');
  assert.ok(!sections[0].body.endsWith('\n'), 'body should not end with newline');
});

test('Parser advances past body (i = bodyEnd), not just past header sep', () => {
  // If loop advancement was wrong (i = sepEnd + 1), the parser might re-process
  // content inside the body and accidentally detect false "Assignment:" headers.
  const input = [
    '================================================================================',
    'Assignment: S023',
    'Class: Language Arts 1 SC',
    '================================================================================',
    '================================================================================',
    'Assignment: S024',
    'Class: Language Arts 2 SC',
    '================================================================================',
    'Q1. Body content here.',
  ].join('\n');

  const sections = parseStudentSections(input);
  // S023 body is empty (the second sep is immediately after), S024 gets the question
  assert.strictEqual(sections.length, 2, `Expected 2 sections, got ${sections.length}`);
  assert.strictEqual(sections[0].studentCode, 'S023');
  assert.strictEqual(sections[1].studentCode, 'S024');
  assert.ok(sections[1].body.includes('Q1. Body content here.'));
});

test('Week 10 style: Student/Class on same line separated by pipe, multi-line header', () => {
  const input = [
    '================================================================================',
    'WEEK 10 — Lost in Kragdon-ah (Chapters 29–31)',
    'ELA Theme: Sentence Structure & Transitions',
    'Student: S001 | Class: Language Arts 3 SC',
    'IEP Goal Codes: S001.11.1, S001.11.2, S001.11.3-1',
    '================================================================================',
    'Q1. What is the main idea?',
    'A) Adventure',
    'B) Friendship',
    '================================================================================',
    'WEEK 10 — Lost in Kragdon-ah (Chapters 29–31)',
    'ELA Theme: Sentence Structure & Transitions',
    'Student: S002 | Class: Language Arts 4 SC',
    'IEP Goal Codes: S002.11.1, S002.11.2',
    '================================================================================',
    'Q1. What is the theme?',
    'A) Courage',
    'B) Loyalty',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 2, `Expected 2 sections, got ${sections.length}`);
  assert.strictEqual(sections[0].studentCode, 'S001');
  assert.strictEqual(sections[0].className, 'Language Arts 3 SC');
  assert.ok(sections[0].body.includes('Q1. What is the main idea?'), 'S001 body should contain Q1');
  assert.strictEqual(sections[1].studentCode, 'S002');
  assert.strictEqual(sections[1].className, 'Language Arts 4 SC');
  assert.ok(sections[1].body.includes('Q1. What is the theme?'), 'S002 body should contain Q1');
});

test('Mixed Assignment: and Student: formats in same file', () => {
  const input = [
    '================================================================================',
    'Assignment: S010',
    'Class: Life Skills Language Arts SC',
    '================================================================================',
    'Q1. Old format question.',
    '================================================================================',
    'WEEK 10 — Lost in Kragdon-ah (Chapters 29–31)',
    'ELA Theme: Sentence Structure & Transitions',
    'Student: S011 | Class: Language Arts 3 SC',
    'IEP Goal Codes: S011.11.1',
    '================================================================================',
    'Q1. New format question.',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 2, `Expected 2 sections, got ${sections.length}`);
  assert.strictEqual(sections[0].studentCode, 'S010');
  assert.strictEqual(sections[0].className, 'Life Skills Language Arts SC');
  assert.ok(sections[0].body.includes('Q1. Old format question.'));
  assert.strictEqual(sections[1].studentCode, 'S011');
  assert.strictEqual(sections[1].className, 'Language Arts 3 SC');
  assert.ok(sections[1].body.includes('Q1. New format question.'));
});

test('Student: format with Class: on a separate line (no pipe)', () => {
  const input = [
    '================================================================================',
    'Student: S030',
    'Class: Consumer Math SC',
    '================================================================================',
    'Q1. Calculate the total.',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].studentCode, 'S030');
  assert.strictEqual(sections[0].className, 'Consumer Math SC');
  assert.ok(sections[0].body.includes('Q1. Calculate the total.'));
});

test('Header block with only metadata (no Assignment: or Student:) is skipped', () => {
  const input = [
    '================================================================================',
    'WEEK 10 — Lost in Kragdon-ah (Chapters 29–31)',
    'ELA Theme: Sentence Structure & Transitions',
    'IEP Goal Codes: S001.11.1, S001.11.2',
    '================================================================================',
    'Q1. This should not be parsed as a student section.',
  ].join('\n');

  const sections = parseStudentSections(input);
  assert.strictEqual(sections.length, 0, 'Header without Assignment: or Student: should be skipped');
});


test('Self-describing student section preserves its WEEK title', () => {
  const input = [
    '================================================================================',
    'WEEK 1 — Seeker — Prologue + Chapters 1–3',
    'Student: S009 | Class: Language Arts 4 SC',
    'Targeted IEP Goal Codes: S009.CG1, S009.CG2, S009.CG4',
    '================================================================================',
    '--- DAY 1 QUESTIONS ---',
    'Question 1: Example?',
  ].join('\n');

  const sections = parseStudentSections(input);

  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].studentCode, 'S009');
  assert.strictEqual(sections[0].className, 'Language Arts 4 SC');
  assert.strictEqual(
    sections[0].title,
    'WEEK 1 — Seeker — Prologue + Chapters 1–3'
  );
});

test('Legacy individualized section without WEEK title preserves legacy shape', () => {
  const input = [
    '================================================================================',
    'Assignment: S010',
    'Class: Language Arts 3 SC',
    '================================================================================',
    'Question 1: Legacy example?',
  ].join('\n');

  const sections = parseStudentSections(input);

  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].studentCode, 'S010');
  assert.strictEqual(sections[0].className, 'Language Arts 3 SC');
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(sections[0], 'title'),
    false,
    'legacy section must not invent a title'
  );
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
  console.log(`✅ All ${passed} tests passed!\n`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} test(s) failed, ${passed} passed.\n`);
  process.exit(1);
}
