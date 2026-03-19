// Unit tests for parseStudentSections function
// Run with: node tests/parse-student-sections.test.cjs

'use strict';

const assert = require('assert');

// ── Mirror of parseStudentSections() from site/web/tc-work.js ─────────────────
// NOTE: Must be kept in sync with production code.

function parseStudentSections(text) {
  const lines = String(text || '').split(/\r?\n/);
  const isSep = (ln) => /^\s*={3,}\s*$/.test(ln);

  // Find all separator line indices
  const sepIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSep(lines[i])) sepIndices.push(i);
  }

  const sections = [];

  // Scan consecutive separator pairs: sep[i] ... sep[i+1]
  // The lines between them should be "Assignment: SXXX" and "Class: ..."
  for (let i = 0; i + 1 < sepIndices.length; i++) {
    const topSep = sepIndices[i];
    const botSep = sepIndices[i + 1];

    // Collect non-blank lines between the two separators
    const between = [];
    for (let k = topSep + 1; k < botSep; k++) {
      const t = lines[k].trim();
      if (t) between.push(t);
    }

    // Must have exactly Assignment: and Class: lines (allow small header blocks)
    const assignLine = between.find((l) => /^Assignment\s*:\s*/i.test(l));
    const classLine = between.find((l) => /^Class\s*:\s*/i.test(l));
    if (!assignLine || !classLine) continue;

    const studentCode = assignLine.replace(/^Assignment\s*:\s*/i, '').trim();
    const className = classLine.replace(/^Class\s*:\s*/i, '').trim();
    if (!studentCode || !className) continue;

    // Body is everything after botSep until the next top-level separator that
    // starts another student block (or end of file)
    const bodyStart = botSep + 1;
    // Find the next student-block opener: a sep that is followed (within a few
    // lines) by another sep with Assignment/Class lines between them
    let bodyEnd = lines.length;
    for (let j = i + 1; j + 1 < sepIndices.length; j++) {
      const nextTop = sepIndices[j];
      const nextBot = sepIndices[j + 1];
      const nextBetween = [];
      for (let k = nextTop + 1; k < nextBot; k++) {
        const t = lines[k].trim();
        if (t) nextBetween.push(t);
      }
      const hasAssign = nextBetween.some((l) => /^Assignment\s*:\s*/i.test(l));
      const hasClass = nextBetween.some((l) => /^Class\s*:\s*/i.test(l));
      if (hasAssign && hasClass) {
        bodyEnd = nextTop;
        break;
      }
    }

    const body = lines.slice(bodyStart, bodyEnd).join('\n').trim();
    sections.push({ studentCode, className, body });
  }

  return sections;
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEP = '================================================================================';

function makeStudentBlock(studentCode, className, body) {
  return `${SEP}\nAssignment: ${studentCode}\nClass: ${className}\n${SEP}\n\n${body}\n`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n--- parseStudentSections() ---');

test('normal multi-student file returns one section per student', () => {
  const text =
    makeStudentBlock('S016', 'Life Skills Language Arts SC', 'DAY 1\nQuestion 1: What is A?\nA) Yes\nB) No\nCorrect Answer: A') +
    makeStudentBlock('S017', 'Life Skills Language Arts SC', 'DAY 1\nQuestion 1: What is B?\nA) Yes\nB) No\nCorrect Answer: B');

  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 2, 'Should return 2 sections');
  assert.strictEqual(result[0].studentCode, 'S016', 'First student should be S016');
  assert.strictEqual(result[0].className, 'Life Skills Language Arts SC', 'First student class');
  assert(result[0].body.includes('DAY 1'), 'First body should contain DAY 1');
  assert.strictEqual(result[1].studentCode, 'S017', 'Second student should be S017');
  assert.strictEqual(result[1].className, 'Life Skills Language Arts SC', 'Second student class');
});

test('file with header notes before first student section is handled', () => {
  const header =
    'NOTE: S015 and S020 will receive separate, non-novel-based assignments.\n' +
    'NOTE: S029, S030, and S037 are inactive and do not have assignments.\n\n';
  const text =
    header +
    makeStudentBlock('S016', 'Life Skills Language Arts SC', 'DAY 1\nBody here') +
    makeStudentBlock('S017', 'Life Skills Language Arts SC', 'DAY 1\nBody here');

  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 2, 'Should detect 2 students despite header notes');
  assert.strictEqual(result[0].studentCode, 'S016');
  assert.strictEqual(result[1].studentCode, 'S017');
});

test('single-student file returns 1 section', () => {
  const text = makeStudentBlock('S016', 'Life Skills Language Arts SC', 'DAY 1\nSome content');

  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 1, 'Should return 1 section for single student');
  assert.strictEqual(result[0].studentCode, 'S016');
  assert.strictEqual(result[0].className, 'Life Skills Language Arts SC');
  assert(result[0].body.includes('DAY 1'), 'Body should contain content');
});

test('file with no student sections returns empty array', () => {
  const text = 'Just some text\nWith no separators\nOr student sections.';
  const result = parseStudentSections(text);
  assert.deepStrictEqual(result, [], 'Should return empty array for plain text');
});

test('file with === separators but no Assignment/Class headers returns empty array', () => {
  const text =
    `${SEP}\nLANGUAGE ARTS 3 SC\n${SEP}\n\nDAY 1\nQuestion 1: What?\nA) A\nB) B\nCorrect Answer: A\n`;
  const result = parseStudentSections(text);
  assert.deepStrictEqual(result, [], 'Class-based mega file should not match student format');
});

test('mixed class names across students are preserved', () => {
  const text =
    makeStudentBlock('S016', 'Life Skills Language Arts SC', 'DAY 1\nBody S016') +
    makeStudentBlock('S017', 'Consumer Math', 'DAY 1\nBody S017') +
    makeStudentBlock('S018', 'Geometry SC', 'DAY 1\nBody S018');

  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 3, 'Should return 3 sections');
  assert.strictEqual(result[0].className, 'Life Skills Language Arts SC');
  assert.strictEqual(result[1].className, 'Consumer Math');
  assert.strictEqual(result[2].className, 'Geometry SC');
});

test('body content is correctly trimmed and does not bleed into next student section', () => {
  const body1 = 'DAY 1\nQuestion 1: What is Q1?\nA) Option A\nB) Option B\nCorrect Answer: A\nIEP Goal Code(s): S016.11.1';
  const body2 = 'DAY 1\nQuestion 1: Different Q for S017?\nA) Yes\nB) No\nCorrect Answer: B\nIEP Goal Code(s): S017.11.1';
  const text = makeStudentBlock('S016', 'Life Skills Language Arts SC', body1) +
               makeStudentBlock('S017', 'Life Skills Language Arts SC', body2);

  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 2);
  assert(!result[0].body.includes('S017'), 'S016 body should not contain S017 content');
  assert(!result[1].body.includes('S016'), 'S017 body should not contain S016 content');
  assert(result[0].body.includes('S016.11.1'), 'S016 body should contain its IEP codes');
  assert(result[1].body.includes('S017.11.1'), 'S017 body should contain its IEP codes');
});

test('large multi-student file with 9 students', () => {
  const codes = ['S016', 'S017', 'S018', 'S019', 'S022', 'S023', 'S024', 'S025', 'S026'];
  const text = codes
    .map((code) => makeStudentBlock(code, 'Life Skills Language Arts SC', `DAY 1\nContent for ${code}`))
    .join('');

  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 9, 'Should return 9 sections');
  codes.forEach((code, i) => {
    assert.strictEqual(result[i].studentCode, code, `Student ${i + 1} should be ${code}`);
    assert(result[i].body.includes(`Content for ${code}`), `Body for ${code} should include its content`);
  });
});

test('empty string input returns empty array', () => {
  assert.deepStrictEqual(parseStudentSections(''), []);
});

test('null/undefined input returns empty array', () => {
  assert.deepStrictEqual(parseStudentSections(null), []);
  assert.deepStrictEqual(parseStudentSections(undefined), []);
});

test('Assignment: line is case-insensitive', () => {
  const text = `${SEP}\nassignment: S016\nClass: Life Skills Language Arts SC\n${SEP}\n\nDAY 1\nContent\n`;
  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 1, 'Should match lowercase "assignment:"');
  assert.strictEqual(result[0].studentCode, 'S016');
});

test('Class: line is case-insensitive', () => {
  const text = `${SEP}\nAssignment: S016\nclass: Life Skills Language Arts SC\n${SEP}\n\nDAY 1\nContent\n`;
  const result = parseStudentSections(text);
  assert.strictEqual(result.length, 1, 'Should match lowercase "class:"');
  assert.strictEqual(result[0].className, 'Life Skills Language Arts SC');
});

// ── Summary ───────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${passed} parseStudentSections tests passed!`);
}
