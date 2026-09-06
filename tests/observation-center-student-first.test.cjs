const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

const observation =
  read('site/web/tc-observation.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

function section(source, marker, length = 18000) {
  const start = source.indexOf(marker);

  assert.ok(
    start >= 0,
    `missing source marker: ${marker}`
  );

  return source.slice(
    start,
    start + length
  );
}

console.log(
  '\n--- OBS-7 student-first Observation Center contract ---'
);

test(
  'Observation Center defaults to Student browse mode',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter'
      );

    assert.match(
      center,
      /let\s+selectedBrowseMode\s*=\s*['"]student['"]/
    );
  }
);

test(
  'Center exposes Student and Class Period as explicit browse modes',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter'
      );

    assert.match(
      center,
      /obs-center-mode-student/
    );

    assert.match(
      center,
      /obs-center-mode-period/
    );

    assert.match(
      center,
      />Student<|['"]Student['"]/
    );

    assert.match(
      center,
      /Class Period|Class period/
    );
  }
);

test(
  'student picker is derived from the already-loaded roster and observation goals',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter'
      );

    assert.match(
      center,
      /function\s+getObservationCenterStudents|const\s+getObservationCenterStudents/
    );

    const helper =
      section(
        center,
        'getObservationCenterStudents',
        4000
      );

    assert.match(
      helper,
      /allStudents/
    );

    assert.match(
      helper,
      /allGoals/
    );

    assert.match(
      helper,
      /student_code/
    );
  }
);

test(
  'Center provides one searchable student combobox backed by a listbox',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        30000
      );

    assert.match(
      center,
      /obs-center-student-combobox/
    );

    assert.match(
      center,
      /aria-autocomplete/
    );

    assert.match(
      center,
      /obs-center-student-listbox/
    );

    assert.doesNotMatch(
      center,
      /obs-center-student-search/
    );

    assert.doesNotMatch(
      center,
      /obs-center-student-select/
    );
  }
);

test(
  'Student mode is not blocked by the global class-period gate',
  () => {
    const workspace =
      section(
        observation,
        'const renderWorkspace',
        15000
      );

    assert.match(
      workspace,
      /selectedBrowseMode\s*===\s*['"]period['"][\s\S]{0,500}!\s*selectedPeriod/
    );

    assert.doesNotMatch(
      workspace,
      /if\s*\(\s*!\s*selectedPeriod\s*\)\s*\{[\s\S]{0,500}Select a class period to begin/
    );
  }
);

test(
  'Student mode filters observation goals directly by selected student',
  () => {
    const workspace =
      section(
        observation,
        'const renderWorkspace',
        15000
      );

    assert.match(
      workspace,
      /goal\.student_code\s*===\s*selectedStudentCode/
    );
  }
);

test(
  'Class Period mode retains the existing configured-period filter',
  () => {
    const workspace =
      section(
        observation,
        'const renderWorkspace',
        15000
      );

    assert.match(
      workspace,
      /selectedBrowseMode\s*===\s*['"]period['"]/
    );

    assert.match(
      workspace,
      /getConfiguredClassPeriods\s*\([\s\S]{0,300}\)\.includes\s*\(\s*selectedPeriod\s*\)/
    );
  }
);

test(
  'Student-mode goal cards expose their configured observation period context',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter'
      );

    assert.match(
      center,
      /obs-center-goal-period/
    );

    assert.match(
      center,
      /getConfiguredClassPeriods/
    );
  }
);


test(
  'Class Period options include the loaded bell schedule as a fallback source',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter'
      );

    const periods =
      section(
        center,
        'const configuredPeriods',
        5000
      );

    assert.match(
      periods,
      /currentSchedule\?*\.periods|currentSchedule\.periods/
    );

    assert.match(
      periods,
      /isPlanning|planning/
    );

    assert.match(
      periods,
      /period\?*\.label|period\.label/
    );
  }
);

test(
  'Center has a useful empty state when no students have observation goals',
  () => {
    const center =
      section(
        observation,
        'function initObservationCenter',
        50000
      );

    const picker =
      section(
        center,
        'const refreshStudentOptions',
        12000
      );

    assert.match(
      picker,
      /No students.*observation goals|No students with observation goals/i
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-7 student-first contract is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-7 student-first Observation Center contract passed'
);
