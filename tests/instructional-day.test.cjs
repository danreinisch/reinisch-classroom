// Unit/contract tests for the shared instructional-day helper and
// the Observation Tray integration.
// Run with: node tests/instructional-day.test.cjs

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const helperPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'instructional-day.js'
);

const helperRaw = fs.readFileSync(helperPath, 'utf8');

const helperCjs = helperRaw
  .replace(/^export\s+const\s+/gm, 'const ')
  .replace(/^export\s+function\s+/gm, 'function ')
  .replace(/^export\s+/gm, '');

const sandbox = { module: { exports: {} } };

vm.runInNewContext(
  helperCjs + `
  module.exports = {
    SCHOOL_CALENDAR_2026_27,
    getInstructionalDayStatus,
    isInstructionalDay
  };
`,
  sandbox
);

const {
  SCHOOL_CALENDAR_2026_27,
  getInstructionalDayStatus,
  isInstructionalDay,
} = sandbox.module.exports;

const observationPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'tc-observation.js'
);

const observationSource = fs.readFileSync(observationPath, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

function status(date) {
  return getInstructionalDayStatus(date);
}

console.log('\n--- 2026-27 instructional-day contract ---');

test('calendar identifies the correct student school-year bounds', () => {
  assert.strictEqual(
    SCHOOL_CALENDAR_2026_27.firstInstructionalDay,
    '2026-08-25'
  );
  assert.strictEqual(
    SCHOOL_CALENDAR_2026_27.lastInstructionalDay,
    '2027-05-20'
  );
});

test('calendar produces the district-published 169 student instructional days', () => {
  let current = new Date(Date.UTC(2026, 7, 25));
  const end = new Date(Date.UTC(2027, 4, 20));
  let count = 0;

  while (current <= end) {
    const dateKey = current.toISOString().slice(0, 10);
    if (isInstructionalDay(dateKey)) count++;
    current.setUTCDate(current.getUTCDate() + 1);
  }

  assert.strictEqual(count, 169);
});

test('first student day is instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-08-25'), true);
});

test('ordinary Tuesday is instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-09-08'), true);
});

test('Saturday is not instructional', () => {
  const result = status('2026-09-12');
  assert.strictEqual(result.instructional, false);
  assert.strictEqual(result.reason, 'weekend');
});

test('Sunday is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-09-13'), false);
});

test('Labor Day is not instructional', () => {
  const result = status('2026-09-07');
  assert.strictEqual(result.instructional, false);
  assert.strictEqual(result.label, 'Labor Day');
});

test('district progress-end dates remain instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-10-02'), true);
  assert.strictEqual(isInstructionalDay('2026-11-20'), true);
  assert.strictEqual(isInstructionalDay('2027-02-05'), true);
  assert.strictEqual(isInstructionalDay('2027-04-16'), true);
});

test('Fall Break range is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-10-29'), false);
  assert.strictEqual(isInstructionalDay('2026-10-30'), false);
});

test('Thanksgiving Break range is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-11-25'), false);
  assert.strictEqual(isInstructionalDay('2026-11-27'), false);
});

test('last day before Winter Break is instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-12-22'), true);
});

test('Winter Break weekday is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-12-23'), false);
  assert.strictEqual(isInstructionalDay('2026-12-31'), false);
});

test('January professional-development day is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2027-01-04'), false);
});

test('students return after January PD', () => {
  assert.strictEqual(isInstructionalDay('2027-01-05'), true);
});

test('MLK Day is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2027-01-18'), false);
});

test('Presidents Day is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2027-02-15'), false);
});

test('Spring Break through March 29 is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2027-03-22'), false);
  assert.strictEqual(isInstructionalDay('2027-03-26'), false);
  assert.strictEqual(isInstructionalDay('2027-03-29'), false);
});

test('students return after Spring Break', () => {
  assert.strictEqual(isInstructionalDay('2027-03-30'), true);
});

test('April professional-development day is not instructional', () => {
  assert.strictEqual(isInstructionalDay('2027-04-19'), false);
});

test('district early-release dates remain instructional', () => {
  assert.strictEqual(isInstructionalDay('2026-09-21'), true);
  assert.strictEqual(isInstructionalDay('2026-10-12'), true);
  assert.strictEqual(isInstructionalDay('2026-10-28'), true);
  assert.strictEqual(isInstructionalDay('2026-11-09'), true);
  assert.strictEqual(isInstructionalDay('2026-12-22'), true);
  assert.strictEqual(isInstructionalDay('2027-02-01'), true);
  assert.strictEqual(isInstructionalDay('2027-05-20'), true);
});

test('date before first student day is outside the school year', () => {
  const result = status('2026-08-24');
  assert.strictEqual(result.instructional, false);
  assert.strictEqual(result.reason, 'outside-school-year');
});

test('date after last student day is outside the school year', () => {
  const result = status('2027-05-21');
  assert.strictEqual(result.instructional, false);
  assert.strictEqual(result.reason, 'outside-school-year');
});

test('invalid dates fail closed', () => {
  assert.strictEqual(status('2027-02-30').instructional, false);
  assert.strictEqual(status('not-a-date').instructional, false);
});

console.log('\n--- Observation Tray integration contract ---');

test('Observation dynamically imports the shared instructional-day helper', () => {
  assert.ok(
    observationSource.includes(
      "await import('/web/instructional-day.js')"
    )
  );
});

test('legacy weekend-only helper is removed', () => {
  assert.ok(!observationSource.includes('function isWeekend(date)'));
});

test('today badge uses instructional-day contract', () => {
  assert.ok(
    observationSource.includes(
      'allGoals.length === 0 || !isInstructionalDay(todayStr())'
    )
  );
});

test('tray body exposes the calendar reason on non-instructional dates', () => {
  assert.ok(
    observationSource.includes(
      'const dayStatus = getInstructionalDayStatus(currentTrayDate);'
    )
  );
  assert.ok(
    observationSource.includes(
      'No observations scheduled — ${dayStatus.label}.'
    )
  );
});

test('navigation avoids evidence reads on non-instructional dates', () => {
  assert.ok(
    observationSource.includes(
      'if (isInstructionalDay(newDate) && !recordedByDate.has(newDate))'
    )
  );
});

test('recorded-entry loader fails closed before database read', () => {
  const start = observationSource.indexOf(
    'async function loadRecordedEntriesForDate(date)'
  );
  const end = observationSource.indexOf(
    '// ─── Init ─',
    start
  );

  assert.ok(start >= 0 && end > start);

  const section = observationSource.slice(start, end);
  const guard = section.indexOf('if (!isInstructionalDay(date)) return;');
  const dbRead = section.indexOf('db.listGoalProgress({');

  assert.ok(guard >= 0, 'instructional-day read guard missing');
  assert.ok(dbRead > guard, 'database read occurs before day guard');
});

test('save fails closed before queue mutation', () => {
  const start = observationSource.indexOf(
    'async function saveObservation('
  );
  const end = observationSource.indexOf(
    '// ─── Rolling Progress',
    start
  );

  assert.ok(start >= 0 && end > start);

  const section = observationSource.slice(start, end);
  const statusCheck = section.indexOf(
    'const dayStatus = getInstructionalDayStatus(date);'
  );
  const guard = section.indexOf('if (!dayStatus.instructional)');
  const queueWrite = section.indexOf('replaceOrPushToQueue(queueEntry)');

  assert.ok(statusCheck >= 0, 'save status check missing');
  assert.ok(guard > statusCheck, 'save guard missing');
  assert.ok(queueWrite > guard, 'queue mutation occurs before save guard');
});

console.log(
  `\nINSTRUCTIONAL-DAY TESTS: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  process.exitCode = 1;
}
