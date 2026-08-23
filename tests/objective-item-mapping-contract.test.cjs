'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running objective item-mapping contract test...\n');

const repoRoot = path.join(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

const serverBuilderPath = path.join(
  repoRoot,
  'netlify',
  'functions',
  '_lib',
  'build-items.js'
);

const browserBuilderPath = path.join(
  repoRoot,
  'site',
  'web',
  'shared-build-items.js'
);

const issueDraftPath = path.join(
  repoRoot,
  'netlify',
  'functions',
  'teacher-issue-draft.js'
);

const objectiveHelperPath = path.join(
  repoRoot,
  'netlify',
  'functions',
  '_lib',
  'objective-item-mapping.js'
);

/* -------------------------------------------------------------------------- */
/* Slice boundary                                                             */
/* -------------------------------------------------------------------------- */

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter(name => /_assignment_item_objectives\.sql$/.test(name));

assert.strictEqual(
  migrationFiles.length,
  1,
  'Expected exactly one assignment_item_objectives migration'
);

const migrationPath = path.join(
  migrationsDir,
  migrationFiles[0]
);

const migration = fs.readFileSync(migrationPath, 'utf8');

console.log(`Migration: ${migrationFiles[0]}`);

/* -------------------------------------------------------------------------- */
/* Normalized mapping schema                                                  */
/* -------------------------------------------------------------------------- */

assert.match(
  migration,
  /CREATE TABLE IF NOT EXISTS public\.assignment_item_objectives/i,
  'Slice 2 must create public.assignment_item_objectives additively'
);

const REQUIRED_COLUMNS = [
  'id',
  'item_id',
  'objective_id',
  'component_label',
  'objective_max',
  'component_order',
  'created_at',
];

for (const column of REQUIRED_COLUMNS) {
  assert.match(
    migration,
    new RegExp(`\\b${column}\\b`, 'i'),
    `assignment_item_objectives must include ${column}`
  );
}

assert.match(
  migration,
  /item_id\s+bigint\s+NOT NULL[\s\S]*REFERENCES public\.assignment_items\s*\(\s*id\s*\)[\s\S]*ON DELETE CASCADE/i,
  'item objective mappings must cascade when their assignment item is deleted'
);

assert.match(
  migration,
  /objective_id[\s\S]*REFERENCES public\.goal_objectives\s*\(\s*id\s*\)[\s\S]*ON DELETE RESTRICT/i,
  'objective mappings must resolve to normalized official goal_objectives rows'
);

assert.match(
  migration,
  /UNIQUE\s*\(\s*item_id\s*,\s*objective_id\s*\)/i,
  'one assignment item may map to an objective only once'
);

assert.match(
  migration,
  /objective_max\s+numeric\s+NOT NULL/i,
  'objective_max must be stored independently from academic assignment points'
);

assert.match(
  migration,
  /CHECK\s*\(\s*objective_max\s*>\s*0\s*\)/i,
  'objective_max must be positive'
);

assert.match(
  migration,
  /component_order\s+integer\s+NOT NULL/i,
  'component ordering must be deterministic'
);

assert.doesNotMatch(
  migration,
  /\bitem_id\s+uuid\b|\bp_item_id\s+uuid\b/i,
  'assignment-item objective identity must never regress to UUID; production assignment_items.id is bigint'
);

/* -------------------------------------------------------------------------- */
/* Server-only data boundary                                                  */
/* -------------------------------------------------------------------------- */

assert.match(
  migration,
  /ALTER TABLE public\.assignment_item_objectives ENABLE ROW LEVEL SECURITY/i,
  'new mapping table must enable RLS'
);

assert.match(
  migration,
  /FROM PUBLIC/i,
  'PUBLIC privileges must be revoked'
);

assert.match(
  migration,
  /FROM anon/i,
  'anon privileges must be revoked'
);

assert.match(
  migration,
  /FROM authenticated/i,
  'authenticated browser privileges must be revoked'
);

assert.match(
  migration,
  /TO service_role/i,
  'server service role must retain access'
);

/* -------------------------------------------------------------------------- */
/* Atomic mapping replacement                                                 */
/* -------------------------------------------------------------------------- */

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.replace_assignment_item_objectives\s*\(\s*p_item_id\s+bigint\s*,\s*p_mappings\s+jsonb/i,
  'atomic replacement RPC must exist'
);

assert.match(
  migration,
  /DELETE FROM public\.assignment_item_objectives[\s\S]*INSERT INTO public\.assignment_item_objectives/i,
  'atomic replacement RPC must perform delete and insert in one database function call'
);

assert.match(
  migration,
  /ON FUNCTION public\.replace_assignment_item_objectives\s*\(\s*bigint\s*,\s*jsonb\s*\)[\s\S]*TO service_role/i,
  'atomic replacement RPC must be executable by service_role'
);

assert.match(
  migration,
  /ON FUNCTION public\.replace_assignment_item_objectives\s*\(\s*bigint\s*,\s*jsonb\s*\)[\s\S]*FROM authenticated/i,
  'authenticated browser role must not execute the objective replacement RPC'
);

/* -------------------------------------------------------------------------- */
/* Slice 2 must remain mapping-only                                           */
/* -------------------------------------------------------------------------- */

assert.doesNotMatch(
  migration,
  /\bobjective_data_points\b|\bgoal_progress\b|\bgoal_data_points\b/i,
  'Slice 2 migration must not introduce or modify progress/evidence storage'
);

assert.doesNotMatch(
  migration,
  /\bearned_points\b|\bis_correct\b|\bstudent_answer\b|\braw_answer\b/i,
  'Slice 2 mapping table must not store student scoring/evidence'
);

assert.doesNotMatch(
  migration,
  /\bALTER TABLE\s+public\.assignment_items\b[\s\S]*\bADD COLUMN\b[\s\S]*objective/i,
  'objective mappings must remain normalized instead of adding objective arrays to assignment_items'
);

assert.doesNotMatch(
  migration,
  /\bALTER TABLE\s+public\.assignment_item_mappings\b[\s\S]*\bADD COLUMN\b[\s\S]*objective/i,
  'existing parent/DESE mapping table must remain unchanged'
);

/* -------------------------------------------------------------------------- */
/* Parser/build pipeline contract                                             */
/* -------------------------------------------------------------------------- */

for (const requiredPath of [
  serverBuilderPath,
  browserBuilderPath,
  issueDraftPath,
]) {
  assert.ok(
    fs.existsSync(requiredPath),
    `Required existing pipeline file missing: ${requiredPath}`
  );
}

assert.ok(
  fs.existsSync(objectiveHelperPath),
  'Slice 2 must isolate objective mapping validation/persistence in _lib/objective-item-mapping.js'
);

const serverBuilder = fs.readFileSync(serverBuilderPath, 'utf8');
const browserBuilder = fs.readFileSync(browserBuilderPath, 'utf8');
const issueDraft = fs.readFileSync(issueDraftPath, 'utf8');
const objectiveHelper = fs.readFileSync(objectiveHelperPath, 'utf8');

assert.match(
  objectiveHelper,
  /\/rest\/v1\/rpc\/replace_assignment_item_objectives/,
  'server helper must use the atomic objective replacement RPC'
);


assert.match(
  issueDraft,
  /\[IO:/,
  'TXT parser must recognize inline [IO: S###.CG#.O#] tags'
);

assert.match(
  issueDraft,
  /Objective\\s\+Max:/i,
  'TXT parser must recognize Objective Max metadata'
);

assert.match(
  issueDraft,
  /Objective\\s\+Components/i,
  'TXT parser must recognize multi-component writing blocks'
);

assert.match(
  issueDraft,
  /objective_components/,
  'parsed TXT metadata must carry normalized objective_components'
);

assert.match(
  serverBuilder,
  /objective_components/,
  'server build-items pipeline must preserve objective component metadata'
);

assert.match(
  browserBuilder,
  /objective_components/,
  'browser build-items twin must preserve objective component metadata'
);

/* -------------------------------------------------------------------------- */
/* Validation contract                                                        */
/* -------------------------------------------------------------------------- */

assert.match(
  objectiveHelper,
  /goal_objectives/,
  'objective validation must resolve against the official goal_objectives registry'
);

assert.match(
  objectiveHelper,
  /assignment_item_objectives/,
  'objective mapping helper must persist normalized item/objective rows'
);

const REQUIRED_BLOCKING_CODES = [
  'OBJECTIVE_CODE_NOT_FOUND',
  'OBJECTIVE_INACTIVE',
  'OBJECTIVE_STUDENT_MISMATCH',
  'OBJECTIVE_PARENT_MISMATCH',
  'OBJECTIVE_COMPONENT_AMBIGUOUS',
  'OBJECTIVE_MAX_INVALID',
];

for (const code of REQUIRED_BLOCKING_CODES) {
  assert.ok(
    objectiveHelper.includes(code),
    `objective mapping validation must expose blocking condition ${code}`
  );
}

assert.match(
  objectiveHelper,
  /statusCode\s*[:=]\s*422|statusCode\s*=\s*422/,
  'invalid IO mappings must block issuance with HTTP 422 semantics'
);

/* -------------------------------------------------------------------------- */
/* Backward compatibility and scoring separation                              */
/* -------------------------------------------------------------------------- */

assert.match(
  objectiveHelper,
  /objective_components/,
  'helper must operate only when objective component metadata is present'
);

assert.doesNotMatch(
  objectiveHelper,
  /\bobjective_data_points\b|\bgoal_progress\b|\bgoal_data_points\b/i,
  'objective mapping helper must not create objective or parent progress evidence'
);

assert.doesNotMatch(
  objectiveHelper,
  /\bearned_points\b|\bis_correct\b|\bstudent_answer\b/i,
  'objective mapping helper must not score student work'
);

assert.match(
  issueDraft,
  /assignment_item_mappings/,
  'existing parent-goal and DESE assignment mapping path must remain present'
);


/* -------------------------------------------------------------------------- */
/* Actual issuance integration                                                */
/* -------------------------------------------------------------------------- */

assert.match(
  issueDraft,
  /require\(['"]\.\/_lib\/objective-item-mapping['"]\)/,
  'teacher-issue-draft must import the objective item-mapping helper'
);

assert.match(
  issueDraft,
  /await\s+preflightObjectiveItemMappings\s*\(/,
  'teacher-issue-draft must preflight objective mappings before assignment-item persistence'
);

assert.match(
  issueDraft,
  /await\s+replaceAssignmentItemObjectives\s*\(/,
  'teacher-issue-draft must persist normalized assignment_item_objectives rows'
);

assert.match(
  issueDraft,
  /objective_components/,
  'teacher-issue-draft issuance must carry parsed objective components to validation'
);

assert.match(
  issueDraft,
  /studentCode/,
  'objective validation must receive the targeted student identity'
);

assert.match(
  issueDraft,
  /goal_codes/,
  'objective validation must receive the item controlling parent goal codes'
);

assert.match(
  issueDraft,
  /objective_components_explicit/,
  'issuance must distinguish explicit multi-component artifacts from ordinary single-objective items'
);


assert.match(
  issueDraft,
  /hasObjectiveMetadataInAssignmentMeta/,
  're-issue must detect prior objective-aware assignment metadata'
);

assert.match(
  issueDraft,
  /objectiveMappingCleanupRequired/,
  're-issue must explicitly track stale objective-mapping cleanup'
);

console.log('✓ normalized assignment_item_objectives schema');
console.log('✓ objective maximum remains separate from academic points');
console.log('✓ server-only mapping boundary');
console.log('✓ [IO:] / Objective Max / Objective Components parser contract');
console.log('✓ official registry validation is fail-loud');
console.log('✓ existing parent/DESE mapping path remains intact');
console.log('✓ Slice 2 creates no objective scoring or evidence');
console.log('');

/* -------------------------------------------------------------------------- */
/* Student-specific assignment identity for objective-aware work              */
/* -------------------------------------------------------------------------- */

assert.doesNotMatch(
  migration,
  /\bstudent_(?:id|code)\b/i,
  'assignment_item_objectives must remain item/objective scoped; student ownership belongs to objective-aware assignment identity'
);

assert.match(
  issueDraft,
  /objective_assignment_student_code/,
  'objective-aware assignment meta must persist its target student internally without changing the visible assignment title'
);

assert.match(
  issueDraft,
  /selectAssignmentReuseCandidate/,
  'duplicate assignment reuse must be student-aware for objective-mapped work'
);

console.log('OBJECTIVE ITEM-MAPPING CONTRACT: PASS');
