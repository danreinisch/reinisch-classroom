'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running goal-objective registry contract test...\n');

const repoRoot = path.join(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

const EXPECTED_CODES = [
  'S008.CG2.O1',
  'S008.CG2.O2',

  'S009.CG1.O1',
  'S009.CG1.O2',
  'S009.CG2.O1',
  'S009.CG2.O2',
  'S009.CG4.O1',
  'S009.CG4.O2',
  'S009.CG4.O3',

  'S015.CG1.O1',
  'S015.CG1.O2',
  'S015.CG1.O3',
  'S015.CG2.O1',
  'S015.CG2.O2',
  'S015.CG4.O1',
  'S015.CG4.O2',

  'S049.CG3.O1',
  'S049.CG3.O2',

  'S051.CG4.O1',
  'S051.CG4.O2',

  'S052.CG2.O1',
  'S052.CG2.O2',
  'S052.CG2.O3',

  'S053.CG2.O1',
  'S053.CG2.O2',
  'S053.CG2.O3',
  'S053.CG2.O4',

  'S059.CG3.O1',
  'S059.CG3.O2',

  'S065.CG1.O1',
  'S065.CG1.O2',
  'S065.CG1.O3',
  'S065.CG2.O1',
  'S065.CG2.O2',
  'S065.CG2.O3',
];

const EXPECTED_PARENTS = [
  'S008.CG2',

  'S009.CG1',
  'S009.CG2',
  'S009.CG4',

  'S015.CG1',
  'S015.CG2',
  'S015.CG4',

  'S049.CG3',
  'S051.CG4',
  'S052.CG2',
  'S053.CG2',
  'S059.CG3',

  'S065.CG1',
  'S065.CG2',
];

assert.strictEqual(
  EXPECTED_CODES.length,
  35,
  'Canonical registry must contain exactly 35 objectives'
);

assert.strictEqual(
  EXPECTED_PARENTS.length,
  14,
  'Canonical registry must contain exactly 14 parent goals'
);

for (const code of EXPECTED_CODES) {
  assert.match(
    code,
    /^S\d{3}\.CG\d+\.O\d+$/,
    `Invalid objective code format: ${code}`
  );

  const studentCode = code.split('.')[0];
  const parentCode = code.replace(/\.O\d+$/, '');

  assert.ok(
    EXPECTED_PARENTS.includes(parentCode),
    `${code} references unexpected parent ${parentCode}`
  );

  assert.ok(
    parentCode.startsWith(`${studentCode}.`),
    `${code} student prefix must match parent`
  );
}

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter(name => /_goal_objective_registry\.sql$/.test(name));

assert.strictEqual(
  migrationFiles.length,
  1,
  'Expected exactly one objective registry migration'
);

const migrationPath = path.join(
  migrationsDir,
  migrationFiles[0]
);

const migration = fs.readFileSync(
  migrationPath,
  'utf8'
);

console.log(`Migration: ${migrationFiles[0]}`);

/* -------------------------------------------------------------------------- */
/* Schema contract                                                            */
/* -------------------------------------------------------------------------- */

assert.match(
  migration,
  /CREATE TABLE IF NOT EXISTS public\.goal_objectives/i,
  'Migration must create public.goal_objectives additively'
);

const REQUIRED_COLUMNS = [
  'id',
  'student_id',
  'parent_goal_id',
  'student_code',
  'parent_goal_code',
  'code',
  'goal_area',
  'objective_number',
  'objective_text',
  'baseline',
  'objective_wording_criterion',
  'mastery_field',
  'parent_goal_criterion',
  'measurement_method',
  'progress_reporting',
  'dan_monitoring_role',
  'assignment_evidence_mode',
  'rc_objective_status',
  'source_qa_notes',
  'active',
  'created_at',
];

for (const column of REQUIRED_COLUMNS) {
  assert.match(
    migration,
    new RegExp(`\\b${column}\\b`, 'i'),
    `goal_objectives migration must include ${column}`
  );
}

assert.match(
  migration,
  /parent_goal_id[\s\S]*REFERENCES public\.goals\s*\(\s*id\s*\)/i,
  'parent_goal_id must reference public.goals(id)'
);

assert.match(
  migration,
  /student_id[\s\S]*REFERENCES public\.students\s*\(\s*id\s*\)/i,
  'student_id must reference public.students(id)'
);

assert.match(
  migration,
  /UNIQUE\s*\(\s*code\s*\)/i,
  'Objective code must be unique'
);

assert.match(
  migration,
  /active\s+boolean\s+NOT NULL\s+DEFAULT\s+true/i,
  'Objectives must have an explicit active flag defaulting true'
);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION\s+public\.sync_goal_objective_registry\(\)/i,
  'Migration must expose the canonical import as an explicit function'
);

assert.doesNotMatch(
  migration,
  /SELECT\s+(?:public\.)?sync_goal_objective_registry\s*\(|PERFORM\s+(?:public\.)?sync_goal_objective_registry\s*\(/i,
  'Fresh migration replay must not auto-run the production-data-dependent objective import'
);

assert.match(
  migration,
  /GRANT EXECUTE[\s\S]*ON FUNCTION public\.sync_goal_objective_registry\(\)[\s\S]*TO service_role/i,
  'Canonical objective import must remain server-only'
);

/* -------------------------------------------------------------------------- */
/* Canonical identity                                                         */
/* -------------------------------------------------------------------------- */

const objectiveCodes = Array.from(
  new Set(
    migration.match(/S\d{3}\.CG\d+\.O\d+/g) || []
  )
).sort();

assert.deepStrictEqual(
  objectiveCodes,
  [...EXPECTED_CODES].sort(),
  'Migration objective-code set must exactly match the 35 canonical child codes'
);

const parentCodes = Array.from(
  new Set(
    migration.match(/S\d{3}\.CG\d+(?!\.O\d+)/g) || []
  )
).sort();

assert.deepStrictEqual(
  parentCodes,
  [...EXPECTED_PARENTS].sort(),
  'Migration parent-code set must exactly match the 14 canonical parents'
);

/* -------------------------------------------------------------------------- */
/* Parent/student resolution safety                                            */
/* -------------------------------------------------------------------------- */

assert.match(
  migration,
  /(?:FROM|JOIN)\s+public\.students/i,
  'Migration must resolve students from public.students'
);

assert.match(
  migration,
  /JOIN\s+public\.goals/i,
  'Migration must resolve the existing parent row from public.goals'
);

assert.match(
  migration,
  /g\.student_id\s*=\s*s(?:tudent)?\.id|g\.student_id\s*=\s*st\.id/i,
  'Parent-goal lookup must be scoped to the resolved student'
);

assert.match(
  migration,
  /g\.code\s*=\s*[^;\n]*parent_goal_code/i,
  'Parent-goal lookup must use the exact parent goal code'
);

assert.match(
  migration,
  /RAISE EXCEPTION/i,
  'Missing or mismatched canonical parents must fail loudly'
);

assert.match(
  migration,
  /active\s*=\s*true|g\.active/i,
  'Canonical parent resolution must account for active goal identity'
);

/* -------------------------------------------------------------------------- */
/* Idempotence                                                                */
/* -------------------------------------------------------------------------- */

assert.match(
  migration,
  /ON CONFLICT\s*\(\s*code\s*\)\s*DO UPDATE/i,
  'Registry import must be idempotent by objective code'
);

/* -------------------------------------------------------------------------- */
/* Exact-source preservation guardrails                                       */
/* -------------------------------------------------------------------------- */

const REQUIRED_SOURCE_STRINGS = [
  'At least three key details to support the main idea',
  'Correct sequence',
  'Prefix',
  'Suffix',
  'Topic/Claim',
  'Three supporting details',
  'Conclusion',
  '5 of 7 opportunities',
  '5 of 6 opportunities',
  'Currently writing 1 sentence',
  'Use a period when appropriate instead of the word "and"',
  'Correct punctuation (ending commas in compound sentences)',
  'Use Transitional words independently',
  'Write 5 sentences on a topic with moderate prompting',
  'Identify the authors purpose',
  'Source preserves both objective wording criterion (65%) and separate Mastery field (70%); do not reconcile by guess.',
  'Source wording is preserved as written; do not silently normalize the punctuation phrase.',
];

for (const sourceText of REQUIRED_SOURCE_STRINGS) {
  assert.ok(
    migration.includes(sourceText),
    `Migration must preserve canonical source text exactly: ${sourceText}`
  );
}

/* -------------------------------------------------------------------------- */
/* Parent-goal / existing-evidence immutability                               */
/* -------------------------------------------------------------------------- */

assert.doesNotMatch(
  migration,
  /\bUPDATE\s+public\.goals\b/i,
  'Objective registry migration must not mutate parent goals'
);

assert.doesNotMatch(
  migration,
  /\bDELETE\s+FROM\s+public\.goals\b/i,
  'Objective registry migration must not delete parent goals'
);

assert.doesNotMatch(
  migration,
  /\bINSERT\s+INTO\s+public\.goals\b/i,
  'Objective registry migration must not manufacture parent goals'
);

assert.doesNotMatch(
  migration,
  /\bUPDATE\s+public\.goal_progress\b|\bDELETE\s+FROM\s+public\.goal_progress\b|\bINSERT\s+INTO\s+public\.goal_progress\b/i,
  'Objective registry migration must not touch parent progress evidence'
);

assert.doesNotMatch(
  migration,
  /objective_data_points|assignment_item_objectives/i,
  'Slice 1 must not introduce objective scoring/evidence tables'
);

console.log('✓ exactly 35 canonical objective identities');
console.log('✓ exactly 14 canonical parent identities');
console.log('✓ child identity remains separate from parent goal identity');
console.log('✓ parent resolution is student-scoped and fail-loud');
console.log('✓ objective registry import is idempotent');
console.log('✓ source wording/criteria guardrails are present');
console.log('✓ existing parent goals and progress remain untouched');
console.log('');
console.log('GOAL OBJECTIVE REGISTRY CONTRACT: PASS');
