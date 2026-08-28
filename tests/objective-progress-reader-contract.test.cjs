'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

const helperRelative =
  'netlify/functions/_lib/objective-progress-reader.js';

const helperPath =
  path.join(root, helperRelative);

assert(
  fs.existsSync(helperPath),
  '5C1 RED: shared objective progress reader helper must exist'
);

const helper =
  read(helperRelative);

const packageJson =
  JSON.parse(
    read('package.json')
  );

assert(
  helper.includes(
    "require('./objective-progress')"
  ),
  '5C1 reader must reuse Slice 5A objective progress math'
);

assert(
  helper.includes(
    "require('./goal-objective-registry-reader')"
  ),
  'shared objective progress reader must derive objective definitions from the live server-only registry reader'
);

assert(
  !helper.includes(
    "require('./goal-objective-catalog')"
  ),
  'shared objective progress reader must no longer depend on the stale 35-row static catalog'
);

assert(
  helper.includes(
    'REGISTRY_SELECT_FIELDS'
  ),
  'shared reader must request the complete browser-safe objective definition fields from goal_objectives'
);

assert(
  helper.includes(
    'normalizeObjectiveRegistryRows'
  ),
  'shared reader must fail loudly on malformed live objective identity'
);

assert(
  helper.includes(
    '/rest/v1/goal_objectives'
  ),
  '5C1 reader must resolve server-owned objective UUID identity through normalized registry'
);

assert(
  helper.includes(
    '/rest/v1/objective_data_points'
  ),
  '5C1 reader must own normalized objective evidence reads'
);

assert(
  !helper.includes(
    'registry_not_activated'
  ),
  'live registry readers must no longer treat an empty parent-specific result as an unactivated global registry'
);

assert(
  helper.includes(
    'registry_mismatch'
  ),
  'malformed or parent/student-mismatched live registry identity must fail closed'
);

assert(
  helper.includes(
    'schema_unavailable'
  ),
  'missing dormant objective schema must be explicit'
);

assert(
  helper.includes(
    'quarter_range_required'
  ),
  'objective-aware runtime reads must require an explicit quarter calculation window'
);

assert(
  helper.includes(
    'normalizeQuarterRange'
  ),
  'reader must normalize one explicit quarter date range'
);

assert(
  helper.includes(
    'filterRowsToQuarter'
  ),
  'reader must scope both parent fallback rows and child evidence rows to the quarter'
);

assert(
  !helper.includes(
    'sync_goal_objective_registry('
  ),
  'reader must never activate objective registry'
);

for (
  const method of [
    'POST',
    'PATCH',
    'PUT',
    'DELETE',
  ]
) {
  assert(
    !new RegExp(
      `method\\s*:\\s*['"]${method}['"]`,
      'i'
    ).test(helper),
    `5C1 reader must not perform ${method} writes`
  );
}

assert(
  !helper.includes(
    '/rest/v1/goal_progress'
  ),
  '5C1 helper must not replace or independently re-read canonical parent progress; caller supplies existing parent rows'
);

assert(
  !helper.includes(
    '/rest/v1/goal_data_points'
  ),
  '5C1 helper must not repurpose legacy parent item evidence as child evidence'
);

assert(
  packageJson.scripts['test:unit'].includes(
    'tests/objective-progress-reader-helper.test.cjs'
  ),
  '5C1 helper test must be permanently registered'
);

assert(
  packageJson.scripts['test:unit'].includes(
    'tests/objective-progress-reader-contract.test.cjs'
  ),
  '5C1 architecture contract must be permanently registered'
);

console.log(
  '✓ objective progress reader architecture contract'
);
