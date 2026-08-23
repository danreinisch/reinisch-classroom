'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running objective evidence foundation contract tests...\n');

const repoRoot = path.join(__dirname, '..');
const migrationsDir = path.join(
  repoRoot,
  'supabase',
  'migrations'
);

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter(name =>
    /_objective_data_points\.sql$/.test(name)
  );

assert.strictEqual(
  migrationFiles.length,
  1,
  'Slice 5A must add exactly one objective_data_points migration'
);

const migration = fs.readFileSync(
  path.join(migrationsDir, migrationFiles[0]),
  'utf8'
);

assert.match(
  migration,
  /CREATE TABLE IF NOT EXISTS public\.objective_data_points/i,
  'Slice 5A must create objective_data_points additively'
);

const requiredColumns = [
  'id',
  'objective_id',
  'student_id',
  'assignment_instance_id',
  'item_id',
  'objective_earned',
  'objective_max',
  'question_text',
  'choices',
  'student_answer',
  'correct_answer',
  'is_correct',
  'component_label',
  'support_level',
  'evidence_type',
  'source',
  'notes',
  'date',
  'school_year',
  'created_at',
];

for (const column of requiredColumns) {
  assert.match(
    migration,
    new RegExp(`\\b${column}\\b`, 'i'),
    `objective_data_points must include ${column}`
  );
}

assert.match(
  migration,
  /objective_id[\s\S]*REFERENCES public\.goal_objectives\s*\(\s*id\s*\)[\s\S]*ON DELETE RESTRICT/i,
  'objective evidence must resolve to an official child objective'
);

assert.match(
  migration,
  /student_id[\s\S]*REFERENCES public\.students\s*\(\s*id\s*\)/i,
  'objective evidence must preserve canonical student ownership'
);

assert.match(
  migration,
  /assignment_instance_id[\s\S]*REFERENCES public\.assignment_instances\s*\(\s*id\s*\)[\s\S]*ON DELETE CASCADE/i,
  'assignment-linked objective evidence must not survive deleted assignment instances'
);

assert.match(
  migration,
  /item_id[\s\S]*REFERENCES public\.assignment_items\s*\(\s*id\s*\)[\s\S]*ON DELETE CASCADE/i,
  'assignment-linked objective evidence must cascade when its source item is deleted'
);

assert.match(
  migration,
  /objective_max\s+numeric\s+NOT NULL/i,
  'objective denominator must be independent from academic item points'
);

assert.match(
  migration,
  /objective_earned\s+numeric\s+NOT NULL/i,
  'objective numerator must be stored independently'
);

assert.match(
  migration,
  /CHECK\s*\(\s*objective_max\s*>\s*0\s*\)/i,
  'objective denominator must be positive'
);

assert.match(
  migration,
  /CHECK\s*\(\s*objective_earned\s*>=\s*0\s*\)/i,
  'objective numerator must not be negative'
);

assert.match(
  migration,
  /CHECK\s*\(\s*objective_earned\s*<=\s*objective_max\s*\)/i,
  'objective numerator must not exceed its denominator'
);

assert.match(
  migration,
  /source\s+text\s+NOT NULL[\s\S]*CHECK\s*\(\s*source\s+IN\s*\(\s*'assignment'\s*,\s*'manual'\s*\)\s*\)/i,
  'objective evidence source must be explicitly constrained to assignment or manual'
);

assert.doesNotMatch(
  migration,
  /source\s+text\s+NOT NULL\s+DEFAULT/i,
  'objective evidence source must not silently default to assignment'
);

assert.match(
  migration,
  /source\s*=\s*'assignment'[\s\S]*assignment_instance_id\s+IS NOT NULL[\s\S]*item_id\s+IS NOT NULL[\s\S]*OR[\s\S]*source\s*=\s*'manual'[\s\S]*assignment_instance_id\s+IS NULL[\s\S]*item_id\s+IS NULL/i,
  'assignment evidence must carry exact assignment/item provenance while manual evidence must remain unlinked'
);

assert.match(
  migration,
  /CREATE UNIQUE INDEX[\s\S]*objective_data_points[\s\S]*assignment_instance_id[\s\S]*item_id[\s\S]*objective_id[\s\S]*WHERE[\s\S]*assignment_instance_id\s+IS NOT NULL[\s\S]*item_id\s+IS NOT NULL/i,
  'assignment objective evidence identity must be one current row per instance + item + objective'
);

assert.match(
  migration,
  /ALTER\s+TABLE\s+public\.objective_data_points\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
  'objective evidence must enable RLS'
);

for (const role of [
  'PUBLIC',
  'anon',
  'authenticated',
]) {
  assert.match(
    migration,
    new RegExp(
      `REVOKE ALL PRIVILEGES[\\s\\S]*?ON TABLE public\\.objective_data_points[\\s\\S]*?FROM ${role}`,
      'i'
    ),
    `objective evidence must be server-only for ${role}`
  );
}

assert.match(
  migration,
  /GRANT\s+SELECT\s*,?\s*INSERT\s*,?\s*UPDATE\s*,?\s*DELETE[\s\S]*ON TABLE public\.objective_data_points[\s\S]*TO service_role/i,
  'service role must own canonical objective evidence access'
);

/*
 * Question-level meaning is a first-class requirement.
 * Student-facing readers can later project these fields without having to
 * reconstruct old submissions or infer the answer history.
 */
for (const evidenceField of [
  'question_text',
  'choices',
  'student_answer',
  'correct_answer',
  'is_correct',
]) {
  assert.match(
    migration,
    new RegExp(`\\b${evidenceField}\\b`, 'i'),
    `objective evidence must preserve ${evidenceField}`
  );
}

/*
 * Manual / binder evidence is valid objective evidence too.
 * It has no assignment provenance and must be able to describe prompting,
 * evidence type, and teacher context.
 */
for (const manualField of [
  'support_level',
  'evidence_type',
  'notes',
]) {
  assert.match(
    migration,
    new RegExp(`\\b${manualField}\\b`, 'i'),
    `manual objective evidence must preserve ${manualField}`
  );
}

/*
 * Additive only. Slice 5A does not rewrite either existing parent layer.
 */
assert.doesNotMatch(
  migration,
  /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+public\.goal_progress\b/i,
  'Slice 5A migration must not mutate parent goal_progress'
);

assert.doesNotMatch(
  migration,
  /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+public\.goal_data_points\b/i,
  'Slice 5A migration must not mutate historical parent question evidence'
);

assert.doesNotMatch(
  migration,
  /sync_goal_objective_registry\s*\(\s*\)\s*;/i,
  'Slice 5A migration must not activate the objective registry'
);

console.log('✓ normalized objective evidence identity');
console.log('✓ independent objective numerator / denominator');
console.log('✓ question / answer provenance is first-class');
console.log('✓ manual / binder evidence metadata is first-class');
console.log('✓ assignment evidence has deterministic reconciliation identity');
console.log('✓ objective evidence remains server-only');
console.log('✓ existing parent evidence remains untouched');
console.log('');
console.log('OBJECTIVE EVIDENCE FOUNDATION CONTRACT: PASS');
