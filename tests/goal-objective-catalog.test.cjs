'use strict';

const assert = require('assert');

const {
  GOAL_OBJECTIVE_COUNT,
  PARENT_GOAL_COUNT,
  getObjectivesForParentGoal,
} = require(
  '../netlify/functions/_lib/goal-objective-catalog'
);

console.log(
  'Running canonical goal-objective catalog tests...\n'
);

assert.strictEqual(
  GOAL_OBJECTIVE_COUNT,
  35,
  'catalog must contain exactly 35 official objectives'
);

assert.strictEqual(
  PARENT_GOAL_COUNT,
  14,
  'catalog must contain exactly 14 controlling parent goals'
);

console.log(
  '✓ canonical objective and parent counts are locked'
);

const s008 =
  getObjectivesForParentGoal(
    'S008.CG2',
    'S008'
  );

assert.deepStrictEqual(
  s008.map(row => row.code),
  [
    'S008.CG2.O1',
    'S008.CG2.O2',
  ],
  'S008.CG2 children must remain in official objective order'
);

assert.strictEqual(
  s008[0].objective_text,
  'At least three key details to support the main idea'
);

assert.strictEqual(
  s008[1].objective_text,
  'Correct sequence'
);

console.log(
  '✓ exact parent returns its ordered official child objectives'
);

assert.deepStrictEqual(
  getObjectivesForParentGoal(
    'S008.CG2',
    'S009'
  ),
  [],
  'wrong student must never receive another student objective'
);

assert.deepStrictEqual(
  getObjectivesForParentGoal(
    'S009.CG1',
    'S008'
  ),
  [],
  'parent identity alone must not cross student boundary'
);

assert.deepStrictEqual(
  getObjectivesForParentGoal(
    'S999.CG1',
    'S999'
  ),
  [],
  'unknown parent must remain a harmless empty result'
);

console.log(
  '✓ objective lookup is jointly scoped by student and parent'
);

const firstRead =
  getObjectivesForParentGoal(
    'S008.CG2',
    'S008'
  );

firstRead[0].objective_text =
  'MUTATED TEST VALUE';

const secondRead =
  getObjectivesForParentGoal(
    'S008.CG2',
    'S008'
  );

assert.strictEqual(
  secondRead[0].objective_text,
  'At least three key details to support the main idea',
  'callers must receive copies and cannot mutate canonical catalog rows'
);

console.log(
  '✓ returned objective rows cannot mutate canonical source data'
);

for (const row of secondRead) {
  for (const forbidden of [
    'dan_monitoring_role',
    'assignment_evidence_mode',
    'rc_objective_status',
    'source_qa_notes',
  ]) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(
        row,
        forbidden
      ),
      `browser transport projection must exclude ${forbidden}`
    );
  }
}

console.log(
  '✓ internal monitoring and QA fields are excluded from transport projection'
);

console.log('');
console.log(
  'CANONICAL GOAL OBJECTIVE CATALOG: PASS'
);

/* -------------------------------------------------------------------------- */
/* Exact dormant-migration ↔ read-only-catalog parity                         */
/* -------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');

function splitSqlTuples(text) {
  const rows = [];
  let depth = 0;
  let inString = false;
  let start = -1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (ch === "'") {
        if (text[i + 1] === "'") {
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      continue;
    }

    if (ch === '(') {
      if (depth === 0) {
        start = i + 1;
      }
      depth += 1;
      continue;
    }

    if (ch === ')') {
      depth -= 1;

      assert.ok(
        depth >= 0,
        'migration objective fixture tuple nesting must remain valid'
      );

      if (depth === 0) {
        assert.ok(
          start >= 0,
          'migration objective fixture tuple start must be known'
        );

        rows.push(
          text.slice(start, i)
        );

        start = -1;
      }
    }
  }

  assert.strictEqual(
    inString,
    false,
    'migration objective fixture must not end inside a SQL string'
  );

  assert.strictEqual(
    depth,
    0,
    'migration objective fixture tuples must close cleanly'
  );

  return rows;
}

function splitSqlFields(row) {
  const fields = [];
  let buffer = '';
  let inString = false;

  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];

    if (inString) {
      buffer += ch;

      if (ch === "'") {
        if (row[i + 1] === "'") {
          buffer += row[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }

      continue;
    }

    if (ch === "'") {
      inString = true;
      buffer += ch;
      continue;
    }

    if (ch === ',') {
      fields.push(
        buffer.trim()
      );
      buffer = '';
      continue;
    }

    buffer += ch;
  }

  fields.push(
    buffer.trim()
  );

  return fields;
}

function parseSqlScalar(token) {
  const value =
    String(token || '').trim();

  if (/^NULL$/i.test(value)) {
    return null;
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  if (
    value.length >= 2 &&
    value.startsWith("'") &&
    value.endsWith("'")
  ) {
    return value
      .slice(1, -1)
      .replace(/''/g, "'");
  }

  assert.fail(
    `Unsupported canonical objective SQL scalar: ${value}`
  );
}

function readMigrationFixture() {
  const migrationPath =
    path.join(
      __dirname,
      '..',
      'supabase',
      'migrations',
      '20260823012500_goal_objective_registry.sql'
    );

  const migration =
    fs.readFileSync(
      migrationPath,
      'utf8'
    );

  const insertMatch =
    migration.match(
      /INSERT INTO _goal_objective_seed\s*\(([\s\S]*?)\)\s*VALUES\s*/i
    );

  assert.ok(
    insertMatch,
    'canonical objective migration INSERT fixture must remain discoverable'
  );

  const columns =
    insertMatch[1]
      .split(',')
      .map(value => value.trim());

  const valuesStart =
    insertMatch.index +
    insertMatch[0].length;

  const integrityMarker =
    migration.indexOf(
      '-- Seed integrity and parent-resolution blockers',
      valuesStart
    );

  assert.ok(
    integrityMarker > valuesStart,
    'canonical objective fixture end marker must remain discoverable'
  );

  let valuesBlock =
    migration
      .slice(
        valuesStart,
        integrityMarker
      )
      .trim();

  const statementEnd =
    valuesBlock.lastIndexOf(';');

  assert.ok(
    statementEnd >= 0,
    'canonical objective VALUES fixture must contain its terminating semicolon'
  );

  const trailingAfterStatement =
    valuesBlock
      .slice(statementEnd + 1)
      .trim();

  const trailingLines =
    trailingAfterStatement
      ? trailingAfterStatement.split(/\\r?\\n/)
      : [];

  assert.ok(
    trailingLines.every(
      line => {
        const trimmed = line.trim();
        return (
          trimmed === '' ||
          trimmed.startsWith('--')
        );
      }
    ),
    'only SQL comments/whitespace may follow the canonical objective VALUES statement'
  );

  valuesBlock =
    valuesBlock
      .slice(0, statementEnd)
      .trim();

  return splitSqlTuples(
    valuesBlock
  ).map(tupleText => {
    const fields =
      splitSqlFields(
        tupleText
      );

    assert.strictEqual(
      fields.length,
      columns.length,
      'each migration objective row must match its declared column count'
    );

    return Object.fromEntries(
      columns.map(
        (column, index) => [
          column,
          parseSqlScalar(
            fields[index]
          ),
        ]
      )
    );
  });
}

const migrationFixture =
  readMigrationFixture();

assert.strictEqual(
  migrationFixture.length,
  35,
  'migration fixture must still contain exactly 35 canonical objectives'
);

const parityFields = [
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
];

const expectedByParent =
  new Map();

for (const row of migrationFixture) {
  const key =
    `${row.student_code}|${row.parent_goal_code}`;

  if (!expectedByParent.has(key)) {
    expectedByParent.set(
      key,
      []
    );
  }

  expectedByParent
    .get(key)
    .push(
      Object.fromEntries(
        parityFields.map(
          field => [
            field,
            row[field],
          ]
        )
      )
    );
}

let catalogParityCount = 0;

for (const [key, expectedRows] of expectedByParent) {
  const [
    studentCode,
    parentGoalCode,
  ] = key.split('|');

  expectedRows.sort(
    (a, b) =>
      a.objective_number - b.objective_number ||
      a.code.localeCompare(b.code)
  );

  const actualRows =
    getObjectivesForParentGoal(
      parentGoalCode,
      studentCode
    ).map(
      row =>
        Object.fromEntries(
          parityFields.map(
            field => [
              field,
              row[field],
            ]
          )
        )
    );

  assert.deepStrictEqual(
    actualRows,
    expectedRows,
    `server catalog must exactly match dormant migration fixture for ${key}`
  );

  catalogParityCount +=
    actualRows.length;
}

assert.strictEqual(
  catalogParityCount,
  35,
  'catalog parity sweep must account for all 35 objectives exactly once'
);

console.log(
  '✓ migration fixture and server catalog are exactly equivalent'
);
