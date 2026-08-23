'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(root, rel),
    'utf8'
  );
}

function extractNamedFunction(
  source,
  name
) {
  const marker =
    `function ${name}(`;

  const start =
    source.indexOf(marker);

  assert.ok(
    start >= 0,
    `${name} must exist`
  );

  const braceStart =
    source.indexOf('{', start);

  assert.ok(
    braceStart >= 0,
    `${name} opening brace not found`
  );

  let depth = 0;
  let end = -1;

  for (
    let i = braceStart;
    i < source.length;
    i += 1
  ) {
    const ch = source[i];

    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;

      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  assert.ok(
    end > braceStart,
    `${name} closing brace not found`
  );

  return source.slice(
    start,
    end
  );
}

function loadFunction(
  source,
  name
) {
  const functionSource =
    extractNamedFunction(
      source,
      name
    );

  return {
    functionSource,
    fn: vm.runInNewContext(
      `(${functionSource})`
    ),
  };
}

console.log(
  'Running assignment evidence read-dedup behavior tests...\n'
);

const studentSource =
  read(
    'netlify/functions/student-goal-data-points.js'
  );

const teacherSource =
  read(
    'site/web/data-adapter.js'
  );

const studentLoaded =
  loadFunction(
    studentSource,
    'dedupeAssignmentGoalDataPoints'
  );

const teacherLoaded =
  loadFunction(
    teacherSource,
    'dedupeAssignmentGoalDataPoints'
  );

assert.strictEqual(
  studentLoaded.functionSource,
  teacherLoaded.functionSource,
  'student and teacher readers must use the same canonical assignment-item dedup logic'
);

console.log(
  '✓ student and teacher readers share identical dedup semantics'
);

for (
  const [label, dedupe] of [
    [
      'student',
      studentLoaded.fn,
    ],
    [
      'teacher',
      teacherLoaded.fn,
    ],
  ]
) {
  const rows = [
    {
      id: 'manual-1',
      goal_id: 'goal-a',
      assignment_instance_id: null,
      item_id: null,
      score: 40,
      created_at:
        '2026-08-01T09:00:00.000Z',
    },
    {
      id: 'old-assignment',
      goal_id: 'goal-a',
      assignment_instance_id:
        'instance-1',
      item_id: 101,
      score: 25,
      created_at:
        '2026-08-10T09:00:00.000Z',
    },
    {
      id: 'other-goal',
      goal_id: 'goal-b',
      assignment_instance_id:
        'instance-1',
      item_id: 101,
      score: 60,
      created_at:
        '2026-08-10T10:00:00.000Z',
    },
    {
      id: 'new-assignment',
      goal_id: 'goal-a',
      assignment_instance_id:
        'instance-1',
      item_id: 101,
      score: 90,
      created_at:
        '2026-08-10T11:00:00.000Z',
    },
    {
      id: 'other-item',
      goal_id: 'goal-a',
      assignment_instance_id:
        'instance-1',
      item_id: 102,
      score: 80,
      created_at:
        '2026-08-10T12:00:00.000Z',
    },
    {
      id: 'manual-2',
      goal_id: 'goal-a',
      assignment_instance_id: null,
      item_id: null,
      score: 70,
      created_at:
        '2026-08-11T09:00:00.000Z',
    },
  ];

  const result =
    dedupe(rows);

  assert.strictEqual(
    result.length,
    5,
    `${label}: one duplicate assignment identity must collapse to one row`
  );

  assert.strictEqual(
    result.some(
      row =>
        row.id ===
        'old-assignment'
    ),
    false,
    `${label}: stale assignment row must be hidden`
  );

  const canonical =
    result.find(
      row =>
        row.goal_id === 'goal-a' &&
        row.assignment_instance_id ===
          'instance-1' &&
        row.item_id === 101
    );

  assert.ok(
    canonical,
    `${label}: canonical assignment row must remain`
  );

  assert.strictEqual(
    canonical.id,
    'new-assignment',
    `${label}: latest created_at row must win`
  );

  assert.strictEqual(
    canonical.score,
    90,
    `${label}: latest score must be surfaced`
  );

  assert.ok(
    result.some(
      row =>
        row.id === 'other-goal'
    ),
    `${label}: same item mapped to another parent goal must remain a separate identity`
  );

  assert.ok(
    result.some(
      row =>
        row.id === 'other-item'
    ),
    `${label}: another item under the same parent goal must remain separate`
  );

  assert.strictEqual(
    result.filter(
      row =>
        row.assignment_instance_id ===
        null
    ).length,
    2,
    `${label}: manual/unlinked rows must remain separate legitimate events`
  );

  console.log(
    `✓ ${label} reader collapses only exact assignment item identities`
  );

  const tieRows = [
    {
      id: 'aaaaaaaa',
      goal_id: 'goal-tie',
      assignment_instance_id:
        'instance-tie',
      item_id: 201,
      created_at:
        '2026-08-12T10:00:00.000Z',
      score: 10,
    },
    {
      id: 'bbbbbbbb',
      goal_id: 'goal-tie',
      assignment_instance_id:
        'instance-tie',
      item_id: 201,
      created_at:
        '2026-08-12T10:00:00.000Z',
      score: 20,
    },
  ];

  const tieResult =
    dedupe(tieRows);

  assert.strictEqual(
    tieResult.length,
    1,
    `${label}: timestamp tie must still deduplicate deterministically`
  );

  assert.strictEqual(
    tieResult[0].id,
    'bbbbbbbb',
    `${label}: id must provide deterministic tie-break after created_at`
  );

  console.log(
    `✓ ${label} reader uses deterministic latest-row tie breaking`
  );

  const incompleteIdentity = [
    {
      id: 'incomplete-1',
      goal_id: 'goal-a',
      assignment_instance_id:
        'instance-incomplete',
      item_id: null,
      created_at:
        '2026-08-13T09:00:00.000Z',
    },
    {
      id: 'incomplete-2',
      goal_id: 'goal-a',
      assignment_instance_id:
        'instance-incomplete',
      item_id: null,
      created_at:
        '2026-08-13T10:00:00.000Z',
    },
  ];

  assert.strictEqual(
    dedupe(
      incompleteIdentity
    ).length,
    2,
    `${label}: incomplete historical provenance must not be guessed into one identity`
  );

  assert.deepStrictEqual(
    Array.from(dedupe([])),
    [],
    `${label}: empty input must remain empty`
  );

  assert.deepStrictEqual(
    Array.from(dedupe(null)),
    [],
    `${label}: invalid input must safely normalize to empty`
  );

  console.log(
    `✓ ${label} reader never guesses incomplete historical identity`
  );
}

console.log('');
console.log(
  'ASSIGNMENT EVIDENCE READ DEDUP: PASS'
);
