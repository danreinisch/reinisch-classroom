'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running objective auto-evidence recall safety contract...\n'
);

const repoRoot =
  path.join(__dirname, '..');

const migration =
  fs.readFileSync(
    path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260823230500_objective_data_points.sql'
    ),
    'utf8'
  );

const recall =
  fs.readFileSync(
    path.join(
      repoRoot,
      'netlify',
      'functions',
      'teacher-recall-assignment.js'
    ),
    'utf8'
  );

assert.match(
  migration,
  /assignment_instance_id[\s\S]*REFERENCES public\.assignment_instances\s*\(\s*id\s*\)[\s\S]*ON DELETE CASCADE/i,
  'objective evidence must cascade when its assignment instance is recalled'
);

assert.match(
  migration,
  /item_id[\s\S]*REFERENCES public\.assignment_items\s*\(\s*id\s*\)[\s\S]*ON DELETE CASCADE/i,
  'objective evidence must also cascade with source item deletion'
);

const deleteSubmissionsIndex =
  recall.indexOf(
    'Deleting submissions'
  );

const deleteInstancesIndex =
  recall.indexOf(
    'Deleting assignment instances'
  );

assert.ok(
  deleteSubmissionsIndex >= 0,
  'recall must retain its existing submission deletion path'
);

assert.ok(
  deleteInstancesIndex >= 0,
  'recall must delete the recalled assignment instances'
);

assert.ok(
  deleteInstancesIndex >
    deleteSubmissionsIndex,
  'recall must preserve existing foreign-key deletion order'
);

/*
 * No extra objective_data_points DELETE is required in 5B1:
 * assignment_instance deletion owns orphan prevention through FK cascade.
 *
 * This avoids making ordinary recall depend on the dormant objective table
 * before objective migrations are deliberately activated.
 */
assert.ok(
  !recall.includes(
    '/rest/v1/objective_data_points'
  ),
  '5B1 recall should rely on the locked FK cascade rather than add a dormant-table runtime dependency'
);

console.log(
  '✓ assignment-instance recall owns objective evidence cleanup by FK cascade'
);
console.log(
  '✓ source-item deletion also cascades objective evidence'
);
console.log(
  '✓ existing recall foreign-key order is preserved'
);
console.log(
  '✓ ordinary recall gains no dormant objective-table dependency'
);
console.log('');
console.log(
  'OBJECTIVE AUTO-EVIDENCE RECALL SAFETY: PASS'
);
