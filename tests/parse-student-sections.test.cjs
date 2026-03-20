// Unit tests for parseStudentSections() from tc-work.js (mega-UX IIFE)
// Run with: node tests/parse-student-sections.test.cjs

'use strict';

const assert = require('assert');

// ── parseStudentSections (copied from site/web/tc-work.js mega-UX IIFE) ──────

function parseStudentSections(text) {
  const lines = String(text || '').split(/\r?\n/);
  const isSep = (ln) => /^\s*={3,}\s*$/.test(ln);

  const sections = [];
  let i = 0;

  while (i < lines.length) {
    if (!isSep(lines[i])) { i++; continue; }

    // Look for "Assignment: SXXX" on the very next non-blank line
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length) { i++; continue; }

    const assignMatch = lines[j].trim().match(/^Assignment\s*:\s*(\S+)/i);
    if (!assignMatch) { i++; continue; }

    const studentCode = assignMatch[1].trim();

    // Look for "Class: ..." on the following line(s)
    let cls = '';
    for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
      const clsMatch = lines[k].trim().match(/^Class\s*:\s*(.+)/i);
      if (clsMatch) { cls = clsMatch[1].trim(); break; }
    }

    // Find the separator that closes the header block (separates header from content)
    let sepEnd = -1;
    for (let k = i + 1; k < lines.length; k++) {
      if (isSep(lines[k])) { sepEnd = k; break; }
    }
    if (sepEnd === -1) { i++; continue; }

    // Find the separator that ends the content block (start of next student section)
    let bodyEnd = lines.length;
    for (let k = sepEnd + 1; k < lines.length; k++) {
      if (isSep(lines[k])) { bodyEnd = k; break; }
    }
    const fullBody = lines.slice(sepEnd + 1, bodyEnd).join('\n').trim();

    sections.push({ studentCode, className: cls, body: fullBody });

    // Advance past the body end to avoid re-scanning body content (performance fix)
    i = bodyEnd;
  }

  return sections;
}

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

// ── Results ───────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
  console.log(`✅ All ${passed} tests passed!\n`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} test(s) failed, ${passed} passed.\n`);
  process.exit(1);
}
