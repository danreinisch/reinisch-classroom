'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const observationPath = path.join(
  __dirname,
  '..',
  'site',
  'web',
  'tc-observation.js'
);

const source = fs.readFileSync(
  observationPath,
  'utf8'
);

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

console.log(
  '\n--- OBS-4 Observation attendance side-effect contract ---'
);

test(
  'observation save still queues locally',
  () => {
    assert.ok(
      source.includes(
        'replaceOrPushToQueue(queueEntry)'
      ),
      'saveObservation must retain the local observation queue path'
    );
  }
);

test(
  'observation save still uses teacher-sync-observations',
  () => {
    assert.ok(
      source.includes(
        '/.netlify/functions/teacher-sync-observations'
      ),
      'saveObservation must retain the canonical observation sync endpoint'
    );
  }
);

test(
  'Observation Tray does not write attendance',
  () => {
    assert.ok(
      !source.includes(
        'db.upsertAttendance('
      ),
      'tc-observation.js must not call db.upsertAttendance()'
    );
  }
);

test(
  'Observation Tray no longer uses observation_auto attendance source',
  () => {
    assert.ok(
      !source.includes(
        "source: 'observation_auto'"
      ),
      'tc-observation.js must not create observation_auto attendance rows'
    );
  }
);

test(
  'Observation Tray contains no automatic attendance behavior',
  () => {
    assert.ok(
      !source.includes(
        'Auto-record attendance'
      ),
      'automatic attendance block must be removed'
    );

    assert.ok(
      !source.includes(
        'Attendance auto-recorded'
      ),
      'automatic attendance success logging must be removed'
    );

    assert.ok(
      !source.includes(
        'Attendance auto-record failed'
      ),
      'automatic attendance failure logging must be removed'
    );
  }
);

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.error(
    '\n❌ OBS-4 contract is RED as expected before implementation.'
  );
  process.exit(1);
}

console.log(
  '\n✅ OBS-4 Observation attendance side-effect contract passed'
);
