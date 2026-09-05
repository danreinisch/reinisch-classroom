'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root =
  path.resolve(__dirname, '..');

function read(relativePath) {
  const full =
    path.join(root, relativePath);

  return fs.existsSync(full)
    ? fs.readFileSync(full, 'utf8')
    : '';
}

const page =
  read('site/teacher/observations/index.html');

const observation =
  read('site/web/tc-observation.js');

const shell =
  read('site/web/teacher-shell.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

function section(source, marker, length = 9000) {
  const start =
    source.indexOf(marker);

  if (start < 0) return '';

  return source.slice(
    start,
    start + length
  );
}

console.log(
  '\n--- OBS-6 Observation Center contract ---'
);

test(
  'dedicated Teacher Observation Center route exists',
  () => {
    assert.ok(
      page,
      'site/teacher/observations/index.html must exist'
    );

    assert.match(
      page,
      /Teacher Center\s*[—-]\s*Observations/i
    );

    assert.match(
      page,
      /id=["']observationCenterApp["']/
    );
  }
);

test(
  'Observation Center uses existing Teacher shell and observation runtime',
  () => {
    assert.match(
      page,
      /\/web\/teacher-shell\.js/
    );

    assert.match(
      page,
      /\/web\/tc-observation\.js\?v=[^"']+/
    );

    assert.doesNotMatch(
      page,
      /tc-observation-center\.js/,
      'OBS-6 must reuse tc-observation.js rather than create a second observation engine'
    );
  }
);

test(
  'Teacher shell ensures one permanent Observations navigation entry after Students',
  () => {
    assert.match(
      shell,
      /function\s+ensureObservationNav\s*\(/
    );

    const navSection =
      section(
        shell,
        'function ensureObservationNav',
        5000
      );

    assert.match(
      navSection,
      /\/teacher\/observations\//
    );

    assert.match(
      navSection,
      /Observations/
    );

    assert.match(
      navSection,
      /\/teacher\/students\//
    );

    assert.match(
      navSection,
      /insertAdjacent|after|insertBefore/,
      'Observations must be inserted relative to the existing Students link'
    );
  }
);

test(
  'Observation Center is initialized by the existing observation runtime',
  () => {
    assert.match(
      observation,
      /function\s+initObservationCenter\s*\(/
    );

    assert.match(
      observation,
      /observationCenterApp/
    );
  }
);

test(
  'Center selected date defaults to today but is explicit state',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        18000
      );

    assert.match(
      center,
      /selectedDate/
    );

    assert.match(
      center,
      /todayStr\s*\(\)/
    );

    assert.match(
      center,
      /type\s*=\s*['"]date['"]|type=["']date["']/
    );
  }
);

test(
  'Center provides Previous Today Next and date-picker navigation',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        18000
      );

    assert.match(center, /Previous/);
    assert.match(center, /Today/);
    assert.match(center, /Next/);
    assert.match(center, /selectedDate/);
  }
);

test(
  'Center prevents accidental future observation dates',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        18000
      );

    assert.match(
      center,
      /\.max\s*=\s*todayStr\s*\(\)|selectedDate\s*>\s*todayStr\s*\(\)|newDate\s*>\s*todayStr\s*\(\)/
    );
  }
);

test(
  'selected instructional date controls the workspace rather than save timestamp',
  () => {
    const center =
      section(
        observation,
        'const renderWorkspace',
        8000
      );

    assert.match(
      center,
      /getInstructionalDayStatus\s*\(\s*selectedDate\s*\)/
    );

    assert.match(
      center,
      /loadRecordedEntriesForWeek\s*\(\s*selectedDate\s*\)/
    );

    assert.doesNotMatch(
      center,
      /saveObservation[\s\S]{0,500}todayStr\s*\(\)/,
      'Center saves must not silently substitute today for selectedDate'
    );
  }
);

test(
  'non-instructional selected dates show the calendar reason and do not render capture cards',
  () => {
    const center =
      section(
        observation,
        'const renderWorkspace',
        8000
      );

    assert.match(
      center,
      /dayStatus\.instructional/
    );

    assert.match(
      center,
      /dayStatus\.label/
    );
  }
);

test(
  'historical entry requires explicit class-period context',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        24000
      );

    assert.match(
      center,
      /selectedPeriod/
    );

    assert.match(
      center,
      /period.*select|select.*period/i
    );

    assert.match(
      center,
      /selectedDate\s*!==\s*todayStr\s*\(\)|selectedDate\s*<\s*todayStr\s*\(\)/
    );

    assert.match(
      center,
      /Select.*period|choose.*period|period.*required/i
    );
  }
);

test(
  'Center period options come from configured observation class periods',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        24000
      );

    assert.match(
      center,
      /getConfiguredClassPeriods/
    );

    assert.match(
      center,
      /selectedPeriod/
    );
  }
);

test(
  'Center filters observation work to the explicitly selected period',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        26000
      );

    assert.match(
      center,
      /selectedPeriod/
    );

    assert.match(
      center,
      /\.filter\s*\(/
    );

    assert.match(
      center,
      /includes\s*\(\s*selectedPeriod\s*\)/
    );
  }
);

test(
  'due-state can receive an explicit Center period without changing Tray defaults',
  () => {
    assert.match(
      observation,
      /function\s+getGoalDueState\s*\(\s*goal\s*,\s*date\s*,\s*[^)]*(Period|period)/
    );

    assert.match(
      observation,
      /currentPeriodOverride|periodOverride|selectedPeriod/
    );
  }
);

test(
  'historical dispositions persist the explicitly selected period',
  () => {
    assert.match(
      observation,
      /function\s+saveObservationDisposition\s*\([^)]*(classPeriodOverride|periodOverride)/
    );

    const dispositionSave =
      section(
        observation,
        'function saveObservationDisposition',
        7000
      );

    assert.match(
      dispositionSave,
      /classPeriodOverride|periodOverride/
    );

    assert.match(
      dispositionSave,
      /buildObservationDispositionNotes/
    );
  }
);

test(
  'Center uses selectedDate for normal observation saves',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        30000
      );

    assert.match(
      center,
      /selectedDate/
    );

    assert.match(
      center,
      /buildGoalCard|saveObservation/
    );
  }
);

test(
  'Center confirms the actual observation date after a save',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        30000
      );

    assert.match(
      center,
      /Saved for/
    );

    assert.match(
      center,
      /selectedDate/
    );
  }
);

test(
  'beautiful real-time Observation Tray remains intact',
  () => {
    assert.match(
      observation,
      /function\s+openTray\s*\(/
    );

    assert.match(
      observation,
      /function\s+injectTrayIcon\s*\(/
    );

    assert.match(
      observation,
      /currentTrayDate\s*=\s*todayStr\s*\(\)/
    );
  }
);

test(
  'OBS-6 does not reintroduce attendance behavior',
  () => {
    assert.doesNotMatch(
      observation,
      /db\.upsertAttendance/
    );

    assert.doesNotMatch(
      observation,
      /observation_auto/
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-6 Observation Center contract is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-6 Observation Center contract passed'
);
