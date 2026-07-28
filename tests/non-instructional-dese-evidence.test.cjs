'use strict';

const assert = require('assert');
const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `missing section start: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `missing section end: ${endMarker}`);
  return source.slice(start, end);
}

console.log('Running non-instructional DESE evidence contract test...\n');

const migration = read(
  'supabase/migrations/20260725233500_exclude_non_instructional_dese_evidence.sql'
);
const students = read('site/web/tc-students.js');

const sqlPredicate =
  "ai.settings->'non_instructional' IS DISTINCT FROM 'true'::jsonb";

assert.ok(
  migration.includes(
    'CREATE OR REPLACE FUNCTION public.student_dese_rollups('
  ),
  'migration must replace student_dese_rollups'
);

assert.ok(
  migration.includes(
    'CREATE OR REPLACE FUNCTION public.all_students_dese_rollups('
  ),
  'migration must replace all_students_dese_rollups'
);

assert.strictEqual(
  migration.split(sqlPredicate).length - 1,
  2,
  'both DESE RPCs must exclude only explicit JSON boolean true'
);

const evidence = section(
  students,
  '  async function fetchAllEvidenceForStudent(student) {',
  '  async function fetchDeseEvidenceItems(student, deseCode) {'
);

assert.ok(
  evidence.includes('settings,'),
  'DESE evidence-card query must fetch assignment-instance settings'
);

assert.ok(
  evidence.includes(
    'if (instance?.settings?.non_instructional === true) continue;'
  ),
  'DESE evidence-card reader must exclude explicit non-instructional instances'
);

assert.ok(
  !students.includes('fetchDeseRollupsFallback'),
  'obsolete browser DESE rollup fallback must remain removed'
);

assert.ok(
  !students.includes("supabase.rpc('student_dese_rollups'"),
  'Teacher Center must not call student_dese_rollups directly from the browser'
);

assert.ok(
  students.includes(
    '/.netlify/functions/teacher-dese-rollups'
  ),
  'Teacher Center DESE rollups must use the authenticated server boundary'
);

console.log('✓ student_dese_rollups migration excludes explicit non-instructional instances');
console.log('✓ historical all_students_dese_rollups migration excludes explicit non-instructional instances');
console.log('✓ Teacher Center DESE evidence cards exclude marked instances');
console.log('✓ obsolete browser DESE rollup fallback remains removed');
console.log('✓ Teacher Center DESE rollups use the authenticated server boundary');
console.log('\nNON-INSTRUCTIONAL DESE EVIDENCE: PASS');
