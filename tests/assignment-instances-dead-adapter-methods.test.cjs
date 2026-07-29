'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(__dirname, '..', relativePath),
    'utf8'
  );
}

const adapter =
  read('site/web/data-adapter.js');

const students =
  read('site/web/tc-students.js');

const rootShim =
  read('web/data-adapter.js');

for (const retired of [
  'patchAssignmentInstance',
  'importResponsesFromCSV',
  'mergeSettingsObjects',
]) {
  assert.ok(
    !adapter.includes(retired),
    `${retired} must remain retired from the canonical adapter`
  );
}

assert.ok(
  rootShim.includes(
    "export { db, isRemote, localStore } from '/site/web/data-adapter.js';"
  ),
  'root adapter shim must continue to re-export the canonical site adapter'
);

assert.ok(
  adapter.includes(
    'async function filterInstructionalEvidenceRows'
  ),
  'instructional evidence marker reader must remain present'
);

assert.ok(
  adapter.includes(
    'async upsertAssignmentInstance(x)'
  ),
  'live assignment-instance upsert workflow must remain present'
);

assert.ok(
  adapter.includes(
    'async addSubmission(payload)'
  ),
  'live submission workflow must remain present'
);

assert.ok(
  students.includes(
    'async function filterInstructionalProgressRows'
  ),
  'Students instructional marker reader must remain present'
);

function directInstanceHits(text) {
  return (
    (text.match(/\.from\('assignment_instances'\)/g) || []).length +
    (text.match(/\.from\("assignment_instances"\)/g) || []).length
  );
}

const adapterHits =
  directInstanceHits(adapter);

const studentsHits =
  directInstanceHits(students);

assert.strictEqual(
  adapterHits,
  3,
  'canonical adapter must contain only the three known surviving direct assignment_instances accesses'
);

assert.strictEqual(
  studentsHits,
  1,
  'tc-students must contain only its one known surviving direct assignment_instances access'
);

assert.strictEqual(
  adapterHits + studentsHits,
  4,
  'browser assignment_instances dependency count must remain reduced from nine to four'
);

console.log(
  '✓ dead patchAssignmentInstance API remains retired'
);

console.log(
  '✓ dead importResponsesFromCSV API remains retired'
);

console.log(
  '✓ canonical root adapter shim remains intact'
);

console.log(
  '✓ surviving live/marker workflows remain present'
);

console.log(
  '✓ direct browser assignment_instances hits reduced from 9 to 4'
);

console.log();
console.log(
  'RC-SEC-01I-D1A dead adapter retirement tests PASS'
);
