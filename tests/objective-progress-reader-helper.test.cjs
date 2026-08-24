'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root =
  path.resolve(__dirname, '..');

const helperPath =
  path.join(
    root,
    'netlify/functions/_lib/objective-progress-reader.js'
  );

assert(
  fs.existsSync(helperPath),
  '5C1 RED: objective-progress-reader.js must be implemented'
);

const {
  getLatestParentPercentage,
  buildObjectiveProgressBundle,
  readObjectiveProgress,
} = require(helperPath);

assert.strictEqual(
  typeof getLatestParentPercentage,
  'function',
  'reader must export getLatestParentPercentage'
);

assert.strictEqual(
  typeof buildObjectiveProgressBundle,
  'function',
  'reader must export buildObjectiveProgressBundle'
);

assert.strictEqual(
  typeof readObjectiveProgress,
  'function',
  'reader must export readObjectiveProgress'
);

const parentId =
  '11111111-1111-4111-8111-111111111111';

const studentId =
  '22222222-2222-4222-8222-222222222222';

const objectiveIds = [
  '33333333-3333-4333-8333-333333333331',
  '33333333-3333-4333-8333-333333333332',
  '33333333-3333-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333334',
];

const Q1_RANGE = {
  quarter: 'Q1',
  start: '2026-08-16',
  end: '2026-10-17',
};

const Q2_RANGE = {
  quarter: 'Q2',
  start: '2026-10-18',
  end: '2026-12-19',
};

const parentGoals = [{
  id: parentId,
  student_id: studentId,
  student_code: 'S053',
  code: 'S053.CG2',
}];

const registryRows =
  objectiveIds.map(
    (id, index) => ({
      id,
      student_id: studentId,
      parent_goal_id: parentId,
      student_code: 'S053',
      parent_goal_code: 'S053.CG2',
      code: `S053.CG2.O${index + 1}`,
      objective_number: index + 1,
      active: true,
    })
  );

const parentProgressRows = [
  {
    goal_id: parentId,
    student_id: studentId,
    date: '2026-08-20',
    value: 70,
    created_at: '2026-08-20T12:00:00.000Z',
  },
  {
    goal_id: parentId,
    student_id: studentId,
    date: '2026-08-23',
    value: 88,
    created_at: '2026-08-23T12:00:00.000Z',
  },
];

assert.strictEqual(
  getLatestParentPercentage(
    parentProgressRows,
    parentId
  ),
  88,
  'parent fallback must use latest valid numeric parent progress'
);

assert.strictEqual(
  getLatestParentPercentage(
    [
      ...parentProgressRows,
      {
        goal_id: parentId,
        student_id: studentId,
        date: '2026-08-24',
        value: '',
        created_at:
          '2026-08-24T12:00:00.000Z',
      },
    ],
    parentId
  ),
  88,
  'invalid latest parent values must not become zero'
);

const evidenceRows = [
  {
    id:
      '44444444-4444-4444-8444-444444444441',
    objective_id: objectiveIds[0],
    student_id: studentId,
    assignment_instance_id:
      '55555555-5555-4555-8555-555555555551',
    item_id: 101,
    objective_earned: 1,
    objective_max: 1,
    question_text:
      'Write one compound sentence.',
    choices: null,
    student_answer:
      'I read the chapter, and I took notes.',
    correct_answer: null,
    is_correct: null,
    component_label:
      'Compound sentence',
    support_level: null,
    evidence_type:
      'written_component',
    source: 'assignment',
    notes:
      'Teacher-only note must not leak from shared projection.',
    date: '2026-08-21',
    school_year: '2026',
    created_at:
      '2026-08-21T12:00:00.000Z',
  },
  {
    id:
      '44444444-4444-4444-8444-444444444442',
    objective_id: objectiveIds[0],
    student_id: studentId,
    assignment_instance_id:
      '55555555-5555-4555-8555-555555555552',
    item_id: 102,
    objective_earned: 2,
    objective_max: 3,
    question_text:
      'Revise the sentence.',
    choices: null,
    student_answer:
      'The class ended, but I kept working.',
    correct_answer: null,
    is_correct: null,
    component_label:
      'Compound sentence',
    support_level: null,
    evidence_type:
      'written_component',
    source: 'assignment',
    notes: null,
    date: '2026-08-22',
    school_year: '2026',
    created_at:
      '2026-08-22T12:00:00.000Z',
  },
  {
    id:
      '44444444-4444-4444-8444-444444444443',
    objective_id: objectiveIds[1],
    student_id: studentId,
    assignment_instance_id:
      '55555555-5555-4555-8555-555555555553',
    item_id: 103,
    objective_earned: 0,
    objective_max: 1,
    question_text:
      'Use a transition word.',
    choices: null,
    student_answer:
      'The next point is important.',
    correct_answer: null,
    is_correct: null,
    component_label:
      'Transition word',
    support_level: null,
    evidence_type:
      'written_component',
    source: 'assignment',
    notes: null,
    date: '2026-08-22',
    school_year: '2026',
    created_at:
      '2026-08-22T12:01:00.000Z',
  },
  {
    id:
      '44444444-4444-4444-8444-444444444444',
    objective_id: objectiveIds[3],
    student_id: studentId,
    assignment_instance_id:
      '55555555-5555-4555-8555-555555555554',
    item_id: 104,
    objective_earned: 1,
    objective_max: 2,
    question_text:
      'Add descriptive adjectives.',
    choices: [
      {
        key: 'A',
        text: 'plain sentence',
      },
      {
        key: 'B',
        text: 'descriptive sentence',
      },
    ],
    student_answer: 'B',
    correct_answer: 'B',
    is_correct: true,
    component_label:
      'Adjective use',
    support_level: null,
    evidence_type: 'question',
    source: 'assignment',
    notes: null,
    date: '2026-08-23',
    school_year: '2026',
    created_at:
      '2026-08-23T12:00:00.000Z',
  },
];

const bundle =
  buildObjectiveProgressBundle({
    parentGoals,
    registryRows,
    evidenceRows,
    parentProgressRows,
  });

assert.strictEqual(
  bundle.available,
  true
);

assert.strictEqual(
  bundle.parents.length,
  1
);

const parent =
  bundle.parents[0];

assert.strictEqual(
  parent.parent_goal_code,
  'S053.CG2'
);

assert.strictEqual(
  parent.percentage,
  41.67,
  'parent must equal-weight measured child percentages: (75 + 0 + 50) / 3'
);

assert.strictEqual(
  parent.source,
  'objective_rollup'
);

assert.deepStrictEqual(
  parent.coverage,
  {
    objectives_with_data: 3,
    total_objectives: 4,
  },
  'coverage must explicitly distinguish measured children from total children'
);

assert.strictEqual(
  parent.objectives.length,
  4
);

assert.deepStrictEqual(
  parent.objectives.map(
    objective => ({
      code: objective.code,
      percentage: objective.percentage,
      evidence_count:
        objective.evidence_count,
    })
  ),
  [
    {
      code: 'S053.CG2.O1',
      percentage: 75,
      evidence_count: 2,
    },
    {
      code: 'S053.CG2.O2',
      percentage: 0,
      evidence_count: 1,
    },
    {
      code: 'S053.CG2.O3',
      percentage: null,
      evidence_count: 0,
    },
    {
      code: 'S053.CG2.O4',
      percentage: 50,
      evidence_count: 1,
    },
  ],
  'No Data child must be excluded while measured zero remains real data'
);

assert.strictEqual(
  parent.objectives[0].earned,
  3
);

assert.strictEqual(
  parent.objectives[0].max,
  4
);

const projectedEvidence =
  parent.objectives[0].evidence[0];

for (
  const forbiddenKey of [
    'id',
    'objective_id',
    'student_id',
    'assignment_instance_id',
    'item_id',
    'created_at',
    'school_year',
    'notes',
  ]
) {
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      projectedEvidence,
      forbiddenKey
    ),
    false,
    `shared evidence projection must not expose ${forbiddenKey}`
  );
}

for (
  const requiredKey of [
    'date',
    'source',
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
  ]
) {
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      projectedEvidence,
      requiredKey
    ),
    true,
    `shared evidence projection must include ${requiredKey}`
  );
}

const noChildEvidenceBundle =
  buildObjectiveProgressBundle({
    parentGoals,
    registryRows,
    evidenceRows: [],
    parentProgressRows,
  });

assert.strictEqual(
  noChildEvidenceBundle.parents[0].percentage,
  88,
  'zero child evidence must preserve latest existing parent percentage'
);

assert.strictEqual(
  noChildEvidenceBundle.parents[0].source,
  'existing_parent'
);

assert.deepStrictEqual(
  noChildEvidenceBundle.parents[0].coverage,
  {
    objectives_with_data: 0,
    total_objectives: 4,
  }
);

assert(
  noChildEvidenceBundle.parents[0]
    .objectives.every(
      objective =>
        objective.percentage === null &&
        objective.evidence_count === 0
    ),
  'zero child evidence must remain No Data, never inferred from parent'
);

const noParentFallbackBundle =
  buildObjectiveProgressBundle({
    parentGoals,
    registryRows,
    evidenceRows: [],
    parentProgressRows: [],
  });

assert.strictEqual(
  noParentFallbackBundle.parents[0].percentage,
  null
);

assert.strictEqual(
  noParentFallbackBundle.parents[0].source,
  'existing_parent'
);


/*
 * Quarter reset contract.
 *
 * Historical rows remain stored, but only rows in the supplied
 * calculation window can affect the live objective-aware percentage.
 */
const q2ResetBundle =
  buildObjectiveProgressBundle({
    parentGoals,
    registryRows,
    evidenceRows,
    parentProgressRows,
    quarterRange: Q2_RANGE,
  });

assert.strictEqual(
  q2ResetBundle.parents[0].percentage,
  null,
  'new quarter must not inherit a prior-quarter child or parent percentage'
);

assert.strictEqual(
  q2ResetBundle.parents[0].source,
  'existing_parent'
);

assert.deepStrictEqual(
  q2ResetBundle.parents[0].coverage,
  {
    objectives_with_data: 0,
    total_objectives: 4,
  },
  'new-quarter coverage must begin at 0 of all objectives'
);

assert(
  q2ResetBundle.parents[0]
    .objectives.every(
      objective =>
        objective.percentage === null &&
        objective.evidence_count === 0
    ),
  'every child objective must begin the new quarter as No Data'
);

const q2ParentRows = [
  ...parentProgressRows,
  {
    goal_id: parentId,
    student_id: studentId,
    date: '2026-10-19',
    value: 64,
    created_at:
      '2026-10-19T12:00:00.000Z',
  },
];

const q2ParentFallback =
  buildObjectiveProgressBundle({
    parentGoals,
    registryRows,
    evidenceRows,
    parentProgressRows: q2ParentRows,
    quarterRange: Q2_RANGE,
  });

assert.strictEqual(
  q2ParentFallback.parents[0].percentage,
  64,
  'zero child evidence may fall back only to a parent value from the same quarter'
);

assert.strictEqual(
  q2ParentFallback.parents[0].source,
  'existing_parent'
);

const q2EvidenceRows = [
  ...evidenceRows,
  {
    id:
      '44444444-4444-4444-8444-444444444499',
    objective_id: objectiveIds[0],
    student_id: studentId,
    assignment_instance_id:
      '55555555-5555-4555-8555-555555555599',
    item_id: 199,
    objective_earned: 1,
    objective_max: 2,
    question_text:
      'Write a compound sentence in Q2.',
    choices: null,
    student_answer:
      'I finished my work, and I checked it.',
    correct_answer: null,
    is_correct: null,
    component_label:
      'Compound sentence',
    support_level: null,
    evidence_type:
      'written_component',
    source: 'assignment',
    notes: null,
    date: '2026-10-20',
    school_year: '2026-2027',
    created_at:
      '2026-10-20T12:00:00.000Z',
  },
];

const q2ObjectiveBundle =
  buildObjectiveProgressBundle({
    parentGoals,
    registryRows,
    evidenceRows: q2EvidenceRows,
    parentProgressRows: q2ParentRows,
    quarterRange: Q2_RANGE,
  });

assert.strictEqual(
  q2ObjectiveBundle.parents[0].percentage,
  50,
  'Q2 child evidence must ignore all Q1 evidence when calculating Q2 percentage'
);

assert.strictEqual(
  q2ObjectiveBundle.parents[0].source,
  'objective_rollup'
);

assert.deepStrictEqual(
  q2ObjectiveBundle.parents[0].coverage,
  {
    objectives_with_data: 1,
    total_objectives: 4,
  }
);

assert.deepStrictEqual(
  q2ObjectiveBundle.parents[0]
    .objectives.map(
      objective =>
        objective.percentage
    ),
  [50, null, null, null],
  'only objectives measured in the new quarter may carry a live percentage'
);

async function runReaderTests() {
  let calls = [];

  const noCandidateResult =
    await readObjectiveProgress({
      parentGoals: [{
        id:
          '66666666-6666-4666-8666-666666666666',
        student_id: studentId,
        student_code: 'S001',
        code: 'S001.CG99',
      }],
      parentProgressRows: [],
      quarterRange: Q1_RANGE,
      fetchImpl: async (...args) => {
        calls.push(args);
        throw new Error(
          'No objective table request expected'
        );
      },
    });

  assert.deepStrictEqual(
    noCandidateResult,
    {
      available: true,
      parents: [],
    },
    'parents with no canonical child objectives require zero objective DB reads'
  );

  assert.strictEqual(
    calls.length,
    0
  );

  calls = [];

  const schemaMissing =
    await readObjectiveProgress({
      parentGoals,
      parentProgressRows,
      quarterRange: Q1_RANGE,
      fetchImpl: async (url) => {
        calls.push(String(url));

        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: 'PGRST205',
              message:
                "Could not find the table 'public.goal_objectives' in the schema cache",
            });
          },
        };
      },
    });

  assert.deepStrictEqual(
    schemaMissing,
    {
      available: false,
      reason: 'schema_unavailable',
      parents: [],
    }
  );

  assert.strictEqual(
    calls.some(
      url =>
        url.includes(
          '/rest/v1/objective_data_points'
        )
    ),
    false,
    'reader must not touch evidence table when registry schema is unavailable'
  );

  calls = [];

  const registryNotActivated =
    await readObjectiveProgress({
      parentGoals,
      parentProgressRows,
      quarterRange: Q1_RANGE,
      fetchImpl: async (url) => {
        calls.push(String(url));

        if (
          String(url).includes(
            '/rest/v1/goal_objectives?'
          )
        ) {
          return {
            ok: true,
            status: 200,
            async text() {
              return '[]';
            },
          };
        }

        throw new Error(
          `Unexpected URL: ${url}`
        );
      },
    });

  assert.deepStrictEqual(
    registryNotActivated,
    {
      available: false,
      reason: 'registry_not_activated',
      parents: [],
    },
    'empty canonical registry must not masquerade as No Data'
  );

  assert.strictEqual(
    calls.some(
      url =>
        url.includes(
          '/rest/v1/objective_data_points'
        )
    ),
    false
  );

  calls = [];

  const partialRegistry =
    await readObjectiveProgress({
      parentGoals,
      parentProgressRows,
      quarterRange: Q1_RANGE,
      fetchImpl: async (url) => {
        calls.push(String(url));

        if (
          String(url).includes(
            '/rest/v1/goal_objectives?'
          )
        ) {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify(
                registryRows.slice(0, 3)
              );
            },
          };
        }

        throw new Error(
          `Unexpected URL: ${url}`
        );
      },
    });

  assert.deepStrictEqual(
    partialRegistry,
    {
      available: false,
      reason: 'registry_mismatch',
      parents: [],
    },
    'partial registry must fail closed'
  );

  calls = [];

  const evidenceSchemaMissing =
    await readObjectiveProgress({
      parentGoals,
      parentProgressRows,
      quarterRange: Q1_RANGE,
      fetchImpl: async (url) => {
        const target = String(url);
        calls.push(target);

        if (
          target.includes(
            '/rest/v1/goal_objectives?'
          )
        ) {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify(
                registryRows
              );
            },
          };
        }

        if (
          target.includes(
            '/rest/v1/objective_data_points?'
          )
        ) {
          return {
            ok: false,
            status: 404,
            async text() {
              return JSON.stringify({
                code: 'PGRST205',
                message:
                  "Could not find the table 'public.objective_data_points' in the schema cache",
              });
            },
          };
        }

        throw new Error(
          `Unexpected URL: ${target}`
        );
      },
    });

  assert.deepStrictEqual(
    evidenceSchemaMissing,
    {
      available: false,
      reason: 'schema_unavailable',
      parents: [],
    }
  );

  calls = [];

  const liveNoEvidence =
    await readObjectiveProgress({
      parentGoals,
      parentProgressRows,
      quarterRange: Q1_RANGE,
      fetchImpl: async (url) => {
        const target = String(url);
        calls.push(target);

        if (
          target.includes(
            '/rest/v1/goal_objectives?'
          )
        ) {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify(
                registryRows
              );
            },
          };
        }

        if (
          target.includes(
            '/rest/v1/objective_data_points?'
          )
        ) {
          return {
            ok: true,
            status: 200,
            async text() {
              return '[]';
            },
          };
        }

        throw new Error(
          `Unexpected URL: ${target}`
        );
      },
    });

  assert.strictEqual(
    liveNoEvidence.available,
    true
  );

  assert.strictEqual(
    liveNoEvidence.parents[0].percentage,
    88
  );

  assert.strictEqual(
    liveNoEvidence.parents[0].source,
    'existing_parent'
  );

  assert(
    calls.some(
      url =>
        url.includes(
          '/rest/v1/objective_data_points?'
        ) &&
        url.includes(
          'date=gte.2026-08-16'
        ) &&
        url.includes(
          'date=lte.2026-10-17'
        )
    ),
    'objective evidence query must be scoped to the supplied quarter date range'
  );

  calls = [];

  const liveEvidence =
    await readObjectiveProgress({
      parentGoals,
      parentProgressRows,
      quarterRange: Q1_RANGE,
      fetchImpl: async (url) => {
        const target = String(url);
        calls.push(target);

        if (
          target.includes(
            '/rest/v1/goal_objectives?'
          )
        ) {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify(
                registryRows
              );
            },
          };
        }

        if (
          target.includes(
            '/rest/v1/objective_data_points?'
          )
        ) {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify(
                evidenceRows
              );
            },
          };
        }

        throw new Error(
          `Unexpected URL: ${target}`
        );
      },
    });

  assert.strictEqual(
    liveEvidence.available,
    true
  );

  assert.strictEqual(
    liveEvidence.parents[0].percentage,
    41.67
  );

  assert.strictEqual(
    liveEvidence.parents[0].source,
    'objective_rollup'
  );

  assert.deepStrictEqual(
    liveEvidence.parents[0].coverage,
    {
      objectives_with_data: 3,
      total_objectives: 4,
    }
  );

  const serialized =
    JSON.stringify(liveEvidence);

  for (
    const forbidden of [
      '"objective_id"',
      '"student_id"',
      '"parent_goal_id"',
      '"assignment_instance_id"',
      '"item_id"',
      '"created_at"',
    ]
  ) {
    assert.strictEqual(
      serialized.includes(forbidden),
      false,
      `browser-safe bundle must exclude ${forbidden}`
    );
  }

  console.log(
    '✓ objective progress reader helper contract'
  );
}

runReaderTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
