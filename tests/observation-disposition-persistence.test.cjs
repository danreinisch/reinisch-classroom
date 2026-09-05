'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const observationPath = path.join(
  root,
  'site',
  'web',
  'tc-observation.js'
);

const utilsPath = path.join(
  root,
  'site',
  'web',
  'obs-utils.js'
);

const dueStatePath = path.join(
  root,
  'site',
  'web',
  'observation-due-state.js'
);

const endpointPath = path.join(
  root,
  'netlify',
  'functions',
  'teacher-sync-observations.js'
);

const observationSource =
  fs.readFileSync(observationPath, 'utf8');

const utilsSource =
  fs.readFileSync(utilsPath, 'utf8');

const dueStateSource =
  fs.readFileSync(dueStatePath, 'utf8');

const endpointSource =
  fs.readFileSync(endpointPath, 'utf8');

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

function functionSection(source, name, length = 5000) {
  const start = source.indexOf(
    `function ${name}`
  );

  if (start === -1) return '';

  return source.slice(
    start,
    start + length
  );
}

console.log(
  '\n--- OBS-5 Observation disposition persistence contract ---'
);

test(
  'observation notes utility owns disposition serialization and parsing',
  () => {
    assert.match(
      utilsSource,
      /export function buildObservationDispositionNotes\s*\(/
    );

    assert.match(
      utilsSource,
      /export function parseObservationDispositionNotes\s*\(/
    );
  }
);

test(
  'disposition serialization preserves both disposition and class-period identity',
  () => {
    const builder =
      functionSection(
        utilsSource,
        'buildObservationDispositionNotes',
        3000
      );

    assert.ok(
      builder,
      'buildObservationDispositionNotes() must exist'
    );

    assert.match(
      builder,
      /classPeriod/,
      'disposition notes must preserve the observation opportunity period'
    );

    assert.match(
      builder,
      /absent/,
      'Absent must be an explicit supported disposition'
    );

    assert.match(
      builder,
      /no_opportunity/,
      'No Opportunity must be an explicit supported disposition'
    );

    assert.match(
      builder,
      /\[obs:disposition:/,
      'disposition event must remain inside the canonical [obs:...] notes family'
    );
  }
);

test(
  'Observation Tray exposes explicit Absent and No Opportunity actions',
  () => {
    assert.match(
      observationSource,
      /Absent/,
      'Observation Tray must expose an Absent action'
    );

    assert.match(
      observationSource,
      /No Opportunity/,
      'Observation Tray must expose a No Opportunity action'
    );

    assert.match(
      observationSource,
      /no_opportunity/,
      'No Opportunity must have a stable machine disposition value'
    );
  }
);

test(
  'Observation Tray has a dedicated disposition save path',
  () => {
    const saveSection =
      functionSection(
        observationSource,
        'saveObservationDisposition',
        6000
      );

    assert.ok(
      saveSection,
      'saveObservationDisposition() must exist'
    );

    assert.match(
      saveSection,
      /replaceOrPushToQueue/,
      'dispositions must retain the established offline queue'
    );

    assert.match(
      saveSection,
      /value:\s*null/,
      'dispositions must enter the queue as non-evaluable null events'
    );

    assert.match(
      saveSection,
      /classPeriod/,
      'the saved disposition must carry the current observation opportunity period'
    );

    assert.match(
      saveSection,
      /teacher-sync-observations/,
      'dispositions must reuse the established signed observation persistence boundary'
    );
  }
);

test(
  'dispositions are never added to the numeric evidence map',
  () => {
    const saveSection =
      functionSection(
        observationSource,
        'saveObservationDisposition',
        6000
      );

    assert.ok(
      saveSection,
      'saveObservationDisposition() must exist'
    );

    assert.doesNotMatch(
      saveSection,
      /observationEvidenceByDate/,
      'a disposition must never be projected as evaluable evidence'
    );
  }
);

test(
  'signed observation endpoint retains POST sync and adds narrow GET read mode',
  () => {
    assert.match(
      endpointSource,
      /event\.httpMethod\s*!==\s*['"]POST['"]|event\.httpMethod\s*===\s*['"]POST['"]/,
      'existing POST observation sync must remain'
    );

    assert.match(
      endpointSource,
      /event\.httpMethod\s*===\s*['"]GET['"]|event\.httpMethod\s*!==\s*['"]GET['"]/,
      'OBS-5 must add a signed GET disposition reader'
    );

    assert.match(
      endpointSource,
      /requireTeacher/,
      'disposition reads must remain behind teacher authentication'
    );
  }
);

test(
  'disposition reader is limited to null Observation Tray event rows',
  () => {
    assert.match(
      endpointSource,
      /progress_entries/,
      'reader must use the existing event-only progress_entries storage'
    );

    assert.match(
      endpointSource,
      /observation_tray/,
      'reader must limit results to Observation Tray events'
    );

    assert.match(
      endpointSource,
      /is\.null/,
      'reader must limit disposition candidates to null/non-evaluable events'
    );
  }
);

test(
  'disposition reader returns due-state identity rather than raw database identity',
  () => {
    for (
      const token
      of [
        'student_code',
        'goal_code',
        'date',
        'disposition',
        'classPeriod',
      ]
    ) {
      assert.ok(
        endpointSource.includes(token),
        `signed disposition reader must return ${token}`
      );
    }
  }
);

test(
  'Observation Tray reloads persisted dispositions for the selected week',
  () => {
    assert.match(
      observationSource,
      /function loadObservationDispositionsForWeek\s*\(/,
      'tray must have a dedicated persisted-disposition loader'
    );

    const loader =
      functionSection(
        observationSource,
        'loadObservationDispositionsForWeek',
        7000
      );

    assert.match(
      loader,
      /teacher-sync-observations/,
      'disposition reload must use the signed observation endpoint'
    );

    assert.match(
      loader,
      /kind:\s*['"]disposition['"]/,
      'persisted rows must be projected into due-state disposition entries'
    );

    assert.match(
      loader,
      /classPeriod/,
      'persisted disposition projection must preserve period identity'
    );
  }
);

test(
  'weekly due-state still counts only observation evidence',
  () => {
    assert.match(
      dueStateSource,
      /entry\.kind\s*===\s*['"]observation['"]/,
      'weekly collected count must remain restricted to observation evidence'
    );

    assert.match(
      dueStateSource,
      /entry\.kind\s*===\s*['"]disposition['"]/,
      'due-state must continue recognizing disposition events separately'
    );

    assert.match(
      dueStateSource,
      /no_opportunity/,
      'No Opportunity must remain an excusing disposition'
    );

    assert.match(
      dueStateSource,
      /absent/,
      'Absent must remain an excusing disposition'
    );
  }
);

test(
  'Observation Tray still contains no attendance write',
  () => {
    assert.doesNotMatch(
      observationSource,
      /db\.upsertAttendance/
    );

    assert.doesNotMatch(
      observationSource,
      /observation_auto/
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.log(
    '\n✗ OBS-5 disposition persistence contract is RED as expected'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-5 Observation disposition persistence contract passed'
);
