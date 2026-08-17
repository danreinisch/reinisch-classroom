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

function occurrences(
  source,
  needle
) {
  return (
    source.split(needle).length - 1
  );
}

const migration =
  read(
    'supabase/migrations/' +
    '20260816230000_goal_criterion_conflict.sql'
  );

const adapter =
  read(
    'site/web/data-adapter.js'
  );

const students =
  read(
    'site/web/tc-students.js'
  );

const packageSource =
  read(
    'package.json'
  );

console.log(
  'Running criterion-conflict persistence contract tests...\n'
);


// ------------------------------------------------------------------
// Additive schema contract
// ------------------------------------------------------------------

assert.match(
  migration,
  /ADD COLUMN IF NOT EXISTS\s+criterion_conflict boolean NOT NULL DEFAULT false/i,
  'goals must receive an additive false-defaulted conflict flag'
);

assert.match(
  migration,
  /COMMENT ON COLUMN public\.goals\.criterion_conflict/i,
  'criterion-conflict source semantics must be documented'
);

assert.strictEqual(
  occurrences(
    migration,
    '\n    criterion_conflict,\n'
  ),
  3,
  'all three canonical goal INSERT statements must include the flag'
);

assert.strictEqual(
  occurrences(
    migration,
    "nullif(g->>'criterion_conflict', '')::boolean"
  ),
  2,
  'both JSON batch-creation RPCs must read the explicit flag'
);

assert.ok(
  migration.includes(
    'v_old.criterion_conflict'
  ),
  'goal-version replacement must preserve the old flag unless overridden'
);

assert.ok(
  !/UPDATE\s+public\.goals\s+SET\s+criterion_conflict\s*=\s*true/i.test(
    migration
  ),
  'the migration must not guess or backfill any conflict as true'
);


// ------------------------------------------------------------------
// Browser/local writer contract
// ------------------------------------------------------------------

assert.strictEqual(
  occurrences(
    adapter,
    'criterion_conflict = undefined'
  ),
  2,
  'local and remote goal writers must accept the explicit flag'
);

assert.strictEqual(
  occurrences(
    adapter,
    "typeof criterion_conflict === 'boolean'"
  ),
  2,
  'local and remote payloads must include only an explicit boolean'
);

assert.ok(
  adapter.includes(
    'goal.criterion_conflict = criterion_conflict'
  ),
  'local goal storage must persist the flag'
);

assert.ok(
  adapter.includes(
    'fullPayload.criterion_conflict = criterion_conflict'
  ),
  'remote goal storage must persist the flag'
);

assert.ok(
  adapter.includes(
    'criterion-conflict-schema-unavailable'
  ),
  'an explicit true flag must fail closed if the schema is unavailable'
);


// ------------------------------------------------------------------
// Teacher Students edit/version preservation contract
// ------------------------------------------------------------------

assert.ok(
  students.includes(
    'criterion_conflict: goal.criterion_conflict === true'
  ),
  'editing an existing goal must preserve its source-audited flag'
);

assert.ok(
  students.includes(
    'criterion_conflict: oldGoal.criterion_conflict === true'
  ),
  'replacing a goal version must preserve the source-audited flag'
);

assert.ok(
  !students.includes(
    'criterion_conflict: true,'
  ),
  'ordinary teacher-created goals must never be automatically flagged'
);


// ------------------------------------------------------------------
// CI wiring contract
// ------------------------------------------------------------------

const testName =
  'tests/criterion-conflict-persistence-contract.test.cjs';

assert.strictEqual(
  occurrences(
    packageSource,
    testName
  ),
  1,
  'the persistence contract must be wired exactly once'
);

assert.ok(
  packageSource.indexOf(
    testName
  ) <
  packageSource.indexOf(
    'tests/tc-library-helpers.test.cjs'
  ),
  'the contract must run before the known local tc-library stop'
);

console.log(
  '✓ additive criterion-conflict schema contract prepared'
);

console.log(
  '✓ all three canonical RPC writers carry the explicit flag'
);

console.log(
  '✓ local and production adapters preserve explicit booleans'
);

console.log(
  '✓ a true flag cannot disappear through schema fallback'
);

console.log(
  '✓ goal edits and replacements preserve source-audited conflicts'
);

console.log(
  '✓ ordinary goals are not inferred or auto-flagged'
);

console.log(
  '\nCRITERION-CONFLICT PERSISTENCE CONTRACT: PASS'
);
