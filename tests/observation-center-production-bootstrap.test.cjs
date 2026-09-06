'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(__dirname, '..');

const read =
  relativePath =>
    fs.readFileSync(
      path.join(root, relativePath),
      'utf8'
    );

const observations =
  read(
    'site/teacher/observations/index.html'
  );

const students =
  read(
    'site/teacher/students/index.html'
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
  '--- OBS-8A Observation Center production bootstrap ---'
);

test(
  'Students page establishes the existing production Supabase bootstrap precedent',
  () => {
    assert.match(
      students,
      /\/web\/supabase-config\.js\?v=[^"']+/
    );
  }
);

test(
  'Observation Center loads the existing production Supabase bootstrap',
  () => {
    assert.match(
      observations,
      /\/web\/supabase-config\.js\?v=[^"']+/
    );
  }
);

test(
  'Observation Center loads Supabase bootstrap before tc-observation runtime',
  () => {
    const configIndex =
      observations.indexOf(
        '/web/supabase-config.js'
      );

    const observationIndex =
      observations.indexOf(
        '/web/tc-observation.js'
      );

    assert.notEqual(
      configIndex,
      -1,
      'Supabase bootstrap must exist'
    );

    assert.notEqual(
      observationIndex,
      -1,
      'tc-observation runtime must exist'
    );

    assert.ok(
      configIndex < observationIndex,
      'Supabase bootstrap must execute before tc-observation imports data-adapter'
    );
  }
);

test(
  'Observation Center keeps the signed Teacher observation runtime',
  () => {
    const observationRuntime =
      observations.match(
        /\/web\/tc-observation\.js\?v=([^"']+)/
      );

    const studentsRuntime =
      students.match(
        /\/web\/tc-observation\.js\?v=([^"']+)/
      );

    assert.ok(
      observationRuntime,
      'Observation Center must load a versioned tc-observation runtime'
    );

    assert.ok(
      studentsRuntime,
      'Students page must load a versioned tc-observation runtime'
    );

    assert.equal(
      observationRuntime[1],
      studentsRuntime[1],
      'Teacher pages must load the same tc-observation runtime version'
    );
  }
);

console.log();
console.log(
  `${passed + failed} tests: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.error();
  console.error(
    '❌ OBS-8A production-bootstrap contract RED as expected'
  );
  process.exit(1);
}

console.log();
console.log(
  '✅ OBS-8A production-bootstrap contract passed'
);
