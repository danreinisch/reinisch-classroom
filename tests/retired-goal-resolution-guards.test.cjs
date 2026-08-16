'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log(
  'Running retired-goal resolution guard tests...\n'
);

const repoRoot = path.join(
  __dirname,
  '..'
);

const activeFilter =
  '&active=eq.true';

const retiredStatusFilter =
  '&or=(status.is.null,status.not.in.(closed,archived,Closed,Archived))';

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(
      repoRoot,
      relativePath
    ),
    'utf8'
  );
}

function sliceBetween(
  source,
  startMarker,
  endMarker,
  label
) {
  const start =
    source.indexOf(
      startMarker
    );

  assert.ok(
    start >= 0,
    `${label}: start marker was not found`
  );

  const end =
    source.indexOf(
      endMarker,
      start
    );

  assert.ok(
    end > start,
    `${label}: end marker was not found`
  );

  return source.slice(
    start,
    end
  );
}

const studentSubmitSource =
  readSource(
    'netlify/functions/student-submit-answer.js'
  );

const studentGoalLookup =
  sliceBetween(
    studentSubmitSource,
    '// Resolve only active, non-retired goals.',
    'let goalIdMap = {};',
    'student submission goal lookup'
  );

assert.ok(
  studentGoalLookup.includes(
    activeFilter
  ),
  'student submissions must require goals.active=true'
);

assert.ok(
  studentGoalLookup.includes(
    retiredStatusFilter
  ),
  'student submissions must reject closed and archived goals'
);

assert.ok(
  studentGoalLookup.includes(
    '&select=id,code'
  ),
  'student submission goal lookup must remain minimum-field'
);

const dataEntrySource =
  readSource(
    'netlify/functions/data-entry-access.js'
  );

const tokenGoalLookup =
  sliceBetween(
    dataEntrySource,
    'const goalResponse =',
    'const goal =',
    'external token goal lookup'
  );

assert.ok(
  tokenGoalLookup.includes(
    activeFilter
  ),
  'external token access must require goals.active=true'
);

assert.ok(
  tokenGoalLookup.includes(
    retiredStatusFilter
  ),
  'external token access must reject closed and archived goals'
);

assert.ok(
  tokenGoalLookup.includes(
    '&limit=1'
  ),
  'external token goal lookup must remain single-row scoped'
);

console.log(
  '✓ student assignment submissions reject retired goals'
);

console.log(
  '✓ external data-entry tokens reject retired goals'
);

console.log(
  '\nRETIRED GOAL RESOLUTION GUARDS: PASS'
);
