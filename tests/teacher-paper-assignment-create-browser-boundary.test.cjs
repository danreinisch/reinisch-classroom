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

const library =
  read(
    'site/web/tc-library.js'
  );

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const uploadStart =
  library.indexOf(
    '  async function uploadPaperAssignment('
  );

const successStart =
  library.indexOf(
    '      // Success',
    uploadStart
  );

assert.ok(
  uploadStart >= 0 &&
  successStart > uploadStart,
  'paper upload workflow must exist'
);

const uploadRegion =
  library.slice(
    uploadStart,
    successStart
  );

const remoteStart =
  uploadRegion.indexOf(
    '      if (isRemote) {'
  );

const localStart =
  uploadRegion.indexOf(
    '      } else {',
    remoteStart
  );

assert.ok(
  remoteStart >= 0 &&
  localStart > remoteStart,
  'remote/local paper branches must remain distinct'
);

const remoteRegion =
  uploadRegion.slice(
    remoteStart,
    localStart
  );

const localRegion =
  uploadRegion.slice(
    localStart
  );

assert.ok(
  remoteRegion.includes(
    'newAssignment = await db.createPaperAssignment({'
  ),
  'remote paper path must use signed paper create boundary'
);

assert.equal(
  remoteRegion.includes(
    'db.createAssignment({'
  ),
  false,
  'remote paper path must not directly create assignments'
);

assert.ok(
  localRegion.includes(
    'const newAssignment = await db.createAssignment({'
  ),
  'local paper path must retain existing local createAssignment behavior'
);

assert.ok(
  localRegion.includes(
    "type: 'paper'"
  ),
  'local paper assignment type must remain unchanged'
);

assert.ok(
  library.includes(
    'classSelect.required = Boolean(isRemote);'
  ),
  'remote paper class picker must be required'
);

assert.ok(
  uploadRegion.includes(
    'if (isRemote && !className) {'
  ),
  'remote paper submit must fail before upload when class is missing'
);

assert.ok(
  uploadRegion.includes(
    "showInlineError('Class is required for paper assignments.');"
  ),
  'remote missing-class failure must be visible to teacher'
);

const adapterRemoteStart =
  adapter.indexOf(
    'const remote = {'
  );

assert.ok(
  adapterRemoteStart >= 0,
  'remote adapter object must exist'
);

const adapterRemote =
  adapter.slice(
    adapterRemoteStart
  );

const paperMethodStart =
  adapterRemote.indexOf(
    '  async createPaperAssignment('
  );

const paperMethodEnd =
  adapterRemote.indexOf(
    '\n  async uploadPaperFile(',
    paperMethodStart
  );

assert.ok(
  paperMethodStart >= 0 &&
  paperMethodEnd > paperMethodStart,
  'remote createPaperAssignment adapter method must exist'
);

const paperMethod =
  adapterRemote.slice(
    paperMethodStart,
    paperMethodEnd
  );

assert.ok(
  paperMethod.includes(
    '/.netlify/functions/teacher-paper-assignment-create'
  ),
  'paper adapter must call signed server endpoint'
);

assert.ok(
  paperMethod.includes(
    "credentials: 'include'"
  ),
  'paper adapter must send teacher session cookie'
);

assert.equal(
  paperMethod.includes(
    ".from('assignments')"
  ),
  false,
  'paper adapter method must not directly write assignments table'
);

const genericCreateCalls =
  (
    library.match(
      /db\.createAssignment\s*\(/g
    ) || []
  ).length;

assert.equal(
  genericCreateCalls,
  3,
  'only local paper + existing clone/general createAssignment callers should remain'
);

assert.ok(
  library.includes(
    'newAssignment = await db.createAssignment(newAssignmentPayload);'
  ),
  'clone/general Library creation must remain untouched'
);

assert.ok(
  adapterRemote.includes(
    '  async createAssignment('
  ),
  'generic remote createAssignment must remain for later scoped work'
);

console.log(
  'PASS: remote Library paper creation uses signed canonical boundary'
);

console.log(
  'PASS: local paper workflow and clone/general Library creation remain untouched'
);
