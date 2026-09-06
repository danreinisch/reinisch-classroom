const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root =
  path.resolve(__dirname, '..');

const observation =
  fs.readFileSync(
    path.join(
      root,
      'site/web/tc-observation.js'
    ),
    'utf8'
  );

function section(
  source,
  marker,
  length = 30000
) {
  const start =
    source.indexOf(marker);

  assert.notEqual(
    start,
    -1,
    `missing source marker: ${marker}`
  );

  return source.slice(
    start,
    start + length
  );
}

const center =
  section(
    observation,
    'async function initObservationCenter',
    70000
  );

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
    console.log(
      `    ${error.message}`
    );
  }
}

console.log(
  '\n--- OBS-9A student navigation rail contract ---'
);

test(
  'Student mode uses a persistent rail layout rather than a popup student picker',
  () => {
    assert.match(
      center,
      /obs-center-student-layout/
    );

    assert.match(
      center,
      /obs-center-student-rail/
    );

    assert.match(
      center,
      /obs-center-student-workspace/
    );
  }
);

test(
  'rail provides an always-available student search field',
  () => {
    assert.match(
      center,
      /obs-center-student-rail-search/
    );

    assert.match(
      center,
      /Search students/i
    );
  }
);

test(
  'rail renders one directly clickable item per observation student',
  () => {
    assert.match(
      center,
      /obs-center-student-rail-item/
    );

    assert.match(
      center,
      /getObservationCenterStudents\s*\(\s*\)/
    );

    assert.match(
      center,
      /dataset\.studentCode|data-student-code/
    );
  }
);

test(
  'rail selection remains backed by selectedStudentCode',
  () => {
    assert.match(
      center,
      /selectedStudentCode/
    );

    assert.match(
      center,
      /selectedStudentCode\s*=\s*student\.code|selectedStudentCode\s*=\s*[^;]*studentCode/
    );

    assert.match(
      center,
      /renderWorkspace\s*\(\s*\)/
    );
  }
);

test(
  'selected rail student has an explicit active accessibility state',
  () => {
    assert.match(
      center,
      /aria-selected|aria-current/
    );

    assert.match(
      center,
      /selectedStudentCode/
    );
  }
);

test(
  'student search filters the persistent rail in place',
  () => {
    assert.match(
      center,
      /studentRailSearch|railSearch/
    );

    assert.match(
      center,
      /\.filter\s*\(/
    );

    assert.match(
      center,
      /toLowerCase\s*\(\s*\)/
    );
  }
);

test(
  'legacy popup combobox and popup listbox are retired from Student mode',
  () => {
    assert.doesNotMatch(
      center,
      /obs-center-student-combobox/
    );

    assert.doesNotMatch(
      center,
      /obs-center-student-listbox/
    );
  }
);

test(
  'Class Period remains an explicit alternate browse mode',
  () => {
    assert.match(
      center,
      /obs-center-mode-period/
    );

    assert.match(
      center,
      /Class Period/
    );

    assert.match(
      center,
      /selectedBrowseMode/
    );
  }
);

test(
  'student workspace still filters goals by selected student identity',
  () => {
    assert.match(
      center,
      /goal\.student_code\s*===\s*selectedStudentCode/
    );
  }
);

test(
  'historical Student capture still requires explicit period identity',
  () => {
    assert.match(
      center,
      /historical/i
    );

    assert.match(
      center,
      /selectedPeriod/
    );

    assert.match(
      center,
      /Choose the observation period|Select a class period|historical capture requires/i
    );
  }
);

test(
  'OBS-9A remains inside the existing Observation Center runtime',
  () => {
    assert.match(
      observation,
      /async function initObservationCenter/
    );

    assert.doesNotMatch(
      center,
      /db\.listStudents\s*\(/
    );

    assert.doesNotMatch(
      center,
      /db\.listGoalsAll\s*\(/
    );

    assert.doesNotMatch(
      center,
      /fetch\s*\(/
    );
  }
);

test(
  'student rail exposes compact due-state cues from the existing due-state helper',
  () => {
    assert.match(
      center,
      /getStudentRailStatus/
    );

    assert.match(
      center,
      /getGoalDueState/
    );

    assert.match(
      center,
      /obs-center-student-rail-status/
    );

    assert.match(
      center,
      /Urgent/
    );

    assert.match(
      center,
      /Due/
    );
  }
);

test(
  'Student mode suppresses the duplicate inner student heading while Class Period can retain it',
  () => {
    assert.match(
      center,
      /showStudentName\s*=\s*true/
    );

    assert.match(
      center,
      /obs-center-student-heading/
    );

    assert.match(
      center,
      /renderStudentSection\([\s\S]*?selectedStudentCode[\s\S]*?false/
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-9A student rail contract is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-9A student navigation rail contract passed'
);

childProcess.execFileSync(
  process.execPath,
  [
    path.join(
      root,
      'tests/observation-center-goal-quick-capture.test.cjs'
    ),
  ],
  {
    cwd: root,
    stdio: 'inherit',
  }
);
