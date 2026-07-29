'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(
    __dirname,
    '..'
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}

const gradebook =
  read(
    'site/web/tc-gradebook.js'
  );

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const saveStart =
  gradebook.indexOf(
    '  async function saveScore('
  );

const saveEnd =
  gradebook.indexOf(
    '  // Make a score cell editable',
    saveStart
  );

assert.ok(
  saveStart >= 0 &&
  saveEnd > saveStart,
  'canonical saveScore block must exist'
);

const saveScore =
  gradebook.slice(
    saveStart,
    saveEnd
  );

assert.ok(
  saveScore.includes(
    'db.saveGradebookScore({'
  ),
  'remote Gradebook save must use signed boundary adapter'
);

assert.equal(
  saveScore.includes(
    'db.upsertAssignmentInstance('
  ),
  false,
  'normal saveScore must not write assignment_instances through generic browser adapter'
);

assert.equal(
  saveScore.includes(
    'db.addSubmission('
  ),
  false,
  'normal saveScore must not write submissions through generic browser adapter'
);

assert.equal(
  saveScore.includes(
    'addSubmission acts as upsert'
  ),
  false,
  'false legacy upsert assumption must be retired from canonical saveScore'
);

const manualStart =
  gradebook.indexOf(
    '  async function openManualAssignmentModal('
  );

assert.ok(
  manualStart >= 0,
  'MANUAL_* workflow must still exist'
);

const manualRegion =
  gradebook.slice(
    manualStart
  );

assert.ok(
  manualRegion.includes(
    "const assignmentId = 'MANUAL_' + uid;"
  ),
  'D1C2 must not rewrite MANUAL_* workflow'
);

assert.ok(
  manualRegion.includes(
    'db.upsertAssignmentInstance({'
  ),
  'MANUAL_* instance writer must remain untouched'
);

assert.ok(
  manualRegion.includes(
    'db.addSubmission({'
  ),
  'MANUAL_* submission writer must remain untouched'
);

const remoteStart =
  adapter.indexOf(
    'const remote = {'
  );

assert.ok(
  remoteStart >= 0,
  'remote adapter object must exist'
);

const remote =
  adapter.slice(
    remoteStart
  );

const gradebookMethodStart =
  remote.indexOf(
    '  async saveGradebookScore('
  );

const nextMethodStart =
  remote.indexOf(
    '\n  async upsertAssignmentInstance(',
    gradebookMethodStart
  );

assert.ok(
  gradebookMethodStart >= 0 &&
  nextMethodStart > gradebookMethodStart,
  'remote saveGradebookScore method must exist before legacy upsert method'
);

const gradebookMethod =
  remote.slice(
    gradebookMethodStart,
    nextMethodStart
  );

assert.ok(
  gradebookMethod.includes(
    '/.netlify/functions/teacher-gradebook-save-score'
  ),
  'remote adapter must POST to signed Gradebook endpoint'
);

assert.equal(
  gradebookMethod.includes(
    ".from('submissions')"
  ),
  false
);

assert.equal(
  gradebookMethod.includes(
    ".from('assignment_instances')"
  ),
  false
);

assert.ok(
  remote.includes(
    '  async upsertAssignmentInstance('
  ),
  'legacy generic instance writer must remain for later Library/Hub slices'
);

assert.ok(
  remote.includes(
    '  async addSubmission('
  ),
  'legacy generic submission writer must remain for later Library/Hub slices'
);

console.log(
  'PASS: normal Gradebook score save uses signed canonical boundary'
);

console.log(
  'PASS: MANUAL_*, Library/Hub generic mutation bridge remains outside D1C2'
);
