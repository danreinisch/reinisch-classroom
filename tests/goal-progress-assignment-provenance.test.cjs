'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running goal-progress assignment provenance contract tests...\n'
);

const repoRoot = path.join(
  __dirname,
  '..'
);

const recallSource = fs.readFileSync(
  path.join(
    repoRoot,
    'netlify',
    'functions',
    'teacher-recall-assignment.js'
  ),
  'utf8'
);

assert.ok(
  recallSource.includes(
    '/rest/v1/goal_data_points?assignment_instance_id=in.(${quotedIds})'
  ),
  'Recall must delete item-level evidence by exact assignment instance IDs'
);

assert.ok(
  recallSource.includes(
    '/rest/v1/goal_progress?assignment_instance_id=in.(${quotedIds})'
  ),
  'Recall must delete summary progress by exact assignment instance IDs'
);

console.log(
  '✓ recall deletes both evidence layers by exact instance provenance'
);

const progressDeleteStart =
  recallSource.indexOf(
    'const deleteGoalProgressUrl'
  );

const progressDeleteEnd =
  recallSource.indexOf(
    'const deleteGoalProgressResponse',
    progressDeleteStart
  );

assert.ok(
  progressDeleteStart >= 0 &&
  progressDeleteEnd > progressDeleteStart
);

const progressDeleteBlock =
  recallSource.slice(
    progressDeleteStart,
    progressDeleteEnd
  );

assert.ok(
  progressDeleteBlock.includes(
    'assignment_instance_id=in.(${quotedIds})'
  )
);

assert.ok(
  !progressDeleteBlock.includes('student_id=')
);

assert.ok(
  !progressDeleteBlock.includes('goal_id=')
);

assert.ok(
  !progressDeleteBlock.includes('date=')
);

console.log(
  '✓ recall avoids unsafe broad student/goal/date deletion'
);

const migrationsDir = path.join(
  repoRoot,
  'supabase',
  'migrations'
);

const migrationFiles = fs.readdirSync(
  migrationsDir
).filter(
  name =>
    name.endsWith(
      '_restore_goal_progress_assignment_provenance.sql'
    )
);

assert.strictEqual(
  migrationFiles.length,
  1,
  'Expected exactly one provenance repair migration'
);

const migrationSource = fs.readFileSync(
  path.join(
    migrationsDir,
    migrationFiles[0]
  ),
  'utf8'
);

assert.match(
  migrationSource,
  /ADD COLUMN IF NOT EXISTS assignment_instance_id uuid/i
);

assert.match(
  migrationSource,
  /FOREIGN KEY \(assignment_instance_id\)/i
);

assert.match(
  migrationSource,
  /REFERENCES public\.assignment_instances\(id\)/i
);

assert.match(
  migrationSource,
  /ON DELETE SET NULL/i
);

assert.match(
  migrationSource,
  /idx_goal_progress_assignment_instance/i
);

assert.doesNotMatch(
  migrationSource,
  /\bUPDATE\s+public\.goal_progress\b/i,
  'Provenance repair migration must not mutate historical goal_progress rows'
);

assert.doesNotMatch(
  migrationSource,
  /candidate_provenance/i,
  'Provenance repair migration must not infer historical assignment provenance'
);

assert.doesNotMatch(
  migrationSource,
  /JOIN\s+public\.goal_data_points/i,
  'Schema repair must not derive historical provenance from goal_data_points'
);

console.log(
  '✓ migration restores column, FK, and index without historical backfill'
);

console.log('');
console.log(
  'GOAL_PROGRESS ASSIGNMENT PROVENANCE: PASS'
);
