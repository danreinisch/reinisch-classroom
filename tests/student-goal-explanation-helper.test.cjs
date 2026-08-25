'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const helperPath = path.join(
  ROOT,
  'netlify/functions/_lib/student-goal-explanation.js'
);

assert.ok(
  fs.existsSync(helperPath),
  '5C3A RED: student-goal-explanation helper does not exist yet'
);

const {
  buildStudentGoalExplanationBundle,
} = require(helperPath);

assert.strictEqual(
  typeof buildStudentGoalExplanationBundle,
  'function',
  '5C3A helper must expose buildStudentGoalExplanationBundle'
);

const Q1 = {
  quarter: 'Q1',
  start: '2026-08-16',
  end: '2026-10-17',
};

function goal(code, extra = {}) {
  return {
    id: `uuid-${code}`,
    code,
    measurement_type: 'Percent',
    ...extra,
  };
}

function progress({
  goalCode,
  goalId,
  date,
  value,
  source = 'assignment',
  instanceId = null,
  createdAt = `${date}T12:00:00.000Z`,
}) {
  return {
    id: `progress-${goalCode}-${date}-${value}`,
    goal_id: goalId,
    goal_code: goalCode,
    assignment_instance_id: instanceId,
    date,
    value,
    source,
    created_at: createdAt,
    notes: 'PRIVATE PROGRESS NOTE',
    collected_by: 'PRIVATE COLLECTOR',
    student_id: 'PRIVATE STUDENT UUID',
    class_id: 'PRIVATE CLASS UUID',
  };
}

function point({
  id,
  goalId,
  date,
  instanceId,
  itemId,
  question,
  studentAnswer,
  correctAnswer,
  isCorrect,
  score = null,
  createdAt,
}) {
  return {
    id,
    goal_id: goalId,
    student_id: 'PRIVATE STUDENT UUID',
    assignment_instance_id: instanceId,
    item_id: itemId,
    date,
    source: 'assignment',
    question_text: question,
    choices: [
      'A) First choice',
      'B) Second choice',
      'C) Third choice',
    ],
    student_answer: studentAnswer,
    correct_answer: correctAnswer,
    is_correct: isCorrect,
    score,
    created_at: createdAt,
    notes: 'PRIVATE DATA-POINT NOTE',
  };
}

const ordinaryId = 'goal-ordinary';
const zeroId = 'goal-zero';
const objectiveId = 'goal-objective';
const fallbackId = 'goal-fallback';

const bundle =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG9', {
        id: ordinaryId,
      }),

      goal('S001.CG8', {
        id: zeroId,
      }),

      goal('S001.CG1', {
        id: objectiveId,
        objectives: [
          {
            objective_number: 1,
            objective_text: 'Objective one',
          },
          {
            objective_number: 2,
            objective_text: 'Objective two',
          },
        ],
      }),

      goal('S001.CG2', {
        id: fallbackId,
        objectives: [
          {
            objective_number: 1,
            objective_text: 'Fallback objective one',
          },
          {
            objective_number: 2,
            objective_text: 'Fallback objective two',
          },
        ],
      }),
    ],

    parentProgressRows: [
      // Ordinary goal: exact active-quarter mean is
      // (80 + 60 + 61) / 3 = 67.
      progress({
        goalCode: 'S001.CG9',
        goalId: ordinaryId,
        date: '2026-08-20',
        value: 80,
        instanceId: 'instance-reviewed',
      }),
      progress({
        goalCode: 'S001.CG9',
        goalId: ordinaryId,
        date: '2026-09-01',
        value: 60,
        source: 'manual',
      }),
      progress({
        goalCode: 'S001.CG9',
        goalId: ordinaryId,
        date: '2026-09-10',
        value: 61,
        instanceId: 'instance-submitted',
      }),

      // Must not participate: prior quarter.
      progress({
        goalCode: 'S001.CG9',
        goalId: ordinaryId,
        date: '2026-05-10',
        value: 100,
        instanceId: 'instance-prior',
      }),

      // Must not participate: explicitly non-instructional.
      progress({
        goalCode: 'S001.CG9',
        goalId: ordinaryId,
        date: '2026-09-15',
        value: 100,
        instanceId: 'instance-non-instructional',
      }),

      // Measured 0% is real evidence.
      progress({
        goalCode: 'S001.CG8',
        goalId: zeroId,
        date: '2026-08-22',
        value: 0,
        instanceId: 'instance-zero-a',
      }),
      progress({
        goalCode: 'S001.CG8',
        goalId: zeroId,
        date: '2026-08-29',
        value: 100,
        instanceId: 'instance-zero-b',
      }),

      // Objective-aware parent fallback:
      // latest SAME-QUARTER checkpoint is 64.
      progress({
        goalCode: 'S001.CG2',
        goalId: fallbackId,
        date: '2026-08-21',
        value: 55,
        instanceId: 'instance-fallback-old',
      }),
      progress({
        goalCode: 'S001.CG2',
        goalId: fallbackId,
        date: '2026-09-12',
        value: 64,
        instanceId: 'instance-fallback-new',
      }),
      progress({
        goalCode: 'S001.CG2',
        goalId: fallbackId,
        date: '2026-05-01',
        value: 88,
        instanceId: 'instance-fallback-prior',
      }),
    ],

    parentDataPointRows: [
      // Duplicate assignment evidence identity:
      // newest created_at must win.
      point({
        id: 'point-old',
        goalId: ordinaryId,
        date: '2026-08-20',
        instanceId: 'instance-reviewed',
        itemId: 101,
        question: 'OLD DUPLICATE — MUST DISAPPEAR',
        studentAnswer: 'A',
        correctAnswer: 'B',
        isCorrect: false,
        createdAt: '2026-08-20T10:00:00.000Z',
      }),
      point({
        id: 'point-new',
        goalId: ordinaryId,
        date: '2026-08-20',
        instanceId: 'instance-reviewed',
        itemId: 101,
        question: 'Reviewed question',
        studentAnswer: 'A',
        correctAnswer: 'B',
        isCorrect: false,
        createdAt: '2026-08-20T11:00:00.000Z',
      }),

      // Submitted evidence may explain participation,
      // but answer-review fields must remain withheld.
      point({
        id: 'point-submitted',
        goalId: ordinaryId,
        date: '2026-09-10',
        instanceId: 'instance-submitted',
        itemId: 102,
        question: 'Submitted question',
        studentAnswer: 'C',
        correctAnswer: 'A',
        isCorrect: false,
        score: 40,
        createdAt: '2026-09-10T11:00:00.000Z',
      }),

      // Explicitly non-instructional evidence must disappear.
      point({
        id: 'point-non-instructional',
        goalId: ordinaryId,
        date: '2026-09-15',
        instanceId: 'instance-non-instructional',
        itemId: 103,
        question: 'NON-INSTRUCTIONAL — MUST DISAPPEAR',
        studentAnswer: 'A',
        correctAnswer: 'A',
        isCorrect: true,
        createdAt: '2026-09-15T11:00:00.000Z',
      }),
    ],

    assignmentInstances: [
      {
        id: 'instance-reviewed',
        status: 'Reviewed',
        settings: {},
      },
      {
        id: 'instance-submitted',
        status: 'Submitted',
        settings: {},
      },
      {
        id: 'instance-non-instructional',
        status: 'Reviewed',
        settings: {
          non_instructional: true,
        },
      },
      {
        id: 'instance-zero-a',
        status: 'Reviewed',
        settings: {},
      },
      {
        id: 'instance-zero-b',
        status: 'Graded',
        settings: {},
      },
      {
        id: 'instance-fallback-old',
        status: 'Reviewed',
        settings: {},
      },
      {
        id: 'instance-fallback-new',
        status: 'Reviewed',
        settings: {},
      },
    ],

    objectiveProgress: {
      available: true,
      parents: [
        {
          parent_goal_code: 'S001.CG1',
          percentage: 50,
          source: 'objective_rollup',
          coverage: {
            with_data: 1,
            total: 2,
          },
          objectives: [
            {
              objective_number: 1,
              objective_text: 'Objective one',
              earned: 1,
              max: 2,
              percentage: 50,
              evidence_count: 1,
              evidence: [
                {
                  date: '2026-08-25',
                  source: 'assignment',
                  objective_earned: 1,
                  objective_max: 2,
                  question_text: 'Objective evidence question',
                  choices: ['A', 'B', 'C'],
                  student_answer: 'B',
                  correct_answer: null,
                  is_correct: null,
                  component_label: null,
                  support_level: null,
                  evidence_type: null,
                },
              ],
            },
            {
              objective_number: 2,
              objective_text: 'Objective two',
              earned: 0,
              max: 0,
              percentage: null,
              evidence_count: 0,
              evidence: [],
            },
          ],
        },

        {
          parent_goal_code: 'S001.CG2',
          percentage: 64,
          source: 'existing_parent',
          coverage: {
            with_data: 0,
            total: 2,
          },
          objectives: [
            {
              objective_number: 1,
              objective_text: 'Fallback objective one',
              percentage: null,
              evidence_count: 0,
              evidence: [],
            },
            {
              objective_number: 2,
              objective_text: 'Fallback objective two',
              percentage: null,
              evidence_count: 0,
              evidence: [],
            },
          ],
        },
      ],
    },
  });

assert.deepStrictEqual(
  bundle.quarter,
  Q1,
  'bundle must preserve the explicit authorized quarter range'
);

assert.ok(
  Array.isArray(bundle.goals),
  'bundle must expose a goals array'
);

const byCode =
  new Map(
    bundle.goals.map(
      row => [row.goal_code, row]
    )
  );

const ordinary = byCode.get('S001.CG9');

assert.ok(
  ordinary,
  'ordinary single-level goal must be explainable'
);

assert.strictEqual(
  ordinary.percentage,
  67,
  'ordinary goal percentage must equal the same-quarter mean of parent checkpoints'
);

assert.strictEqual(
  ordinary.source,
  'ordinary_quarter_average'
);

assert.strictEqual(
  ordinary.calculation.kind,
  'quarter_checkpoint_mean'
);

assert.strictEqual(
  ordinary.calculation.checkpoint_count,
  3,
  'prior-quarter and non-instructional checkpoints must not participate'
);

assert.deepStrictEqual(
  ordinary.calculation.inputs
    .map(row => Number(row.value))
    .sort((a, b) => a - b),
  [60, 61, 80],
  '67% must be explainable from the exact three participating checkpoint values'
);

const ordinaryText = JSON.stringify(ordinary);

assert.ok(
  ordinaryText.includes('Reviewed question'),
  'released assignment evidence must remain visible'
);

assert.ok(
  !ordinaryText.includes('OLD DUPLICATE'),
  'stale duplicate assignment evidence must collapse'
);

assert.ok(
  !ordinaryText.includes('NON-INSTRUCTIONAL'),
  'non-instructional evidence must not appear'
);

const reviewedEvidence =
  ordinary.calculation.inputs
    .flatMap(row => row.evidence || [])
    .find(
      row =>
        row.question_text ===
        'Reviewed question'
    );

assert.ok(
  reviewedEvidence,
  'Reviewed evidence must be attached to its participating checkpoint'
);

assert.strictEqual(
  reviewedEvidence.answer_review_available,
  true,
  'Reviewed assignment evidence may expose answer review'
);

assert.strictEqual(
  reviewedEvidence.correct_answer,
  'B',
  'Reviewed evidence may expose the correct answer'
);

assert.strictEqual(
  reviewedEvidence.is_correct,
  false
);

const submittedEvidence =
  ordinary.calculation.inputs
    .flatMap(row => row.evidence || [])
    .find(
      row =>
        row.question_text ===
        'Submitted question'
    );

assert.ok(
  submittedEvidence,
  'Submitted evidence may still explain that a checkpoint participated'
);

assert.strictEqual(
  submittedEvidence.answer_review_available,
  false,
  'Submitted-but-not-reviewed evidence must not expose answer review'
);

assert.strictEqual(
  submittedEvidence.correct_answer,
  null,
  'Submitted evidence must withhold the correct answer'
);

assert.strictEqual(
  submittedEvidence.is_correct,
  null,
  'Submitted evidence must withhold item correctness'
);

assert.strictEqual(
  submittedEvidence.score,
  null,
  'Submitted evidence must withhold reviewed per-item scoring'
);

const zeroGoal = byCode.get('S001.CG8');

assert.strictEqual(
  zeroGoal.percentage,
  50,
  'measured 0% must participate as real evidence: mean(0,100)=50'
);

assert.ok(
  zeroGoal.calculation.inputs.some(
    row => Number(row.value) === 0
  ),
  'measured 0% must never be mistaken for No Data'
);

const objectiveGoal =
  byCode.get('S001.CG1');

assert.strictEqual(
  objectiveGoal.percentage,
  50
);

assert.strictEqual(
  objectiveGoal.source,
  'objective_rollup'
);

assert.strictEqual(
  objectiveGoal.calculation.kind,
  'objective_equal_weight_mean'
);

assert.deepStrictEqual(
  objectiveGoal.coverage,
  {
    with_data: 1,
    total: 2,
  },
  'objective coverage must remain explicit'
);

assert.strictEqual(
  objectiveGoal.objectives[0].percentage,
  50
);

assert.strictEqual(
  objectiveGoal.objectives[1].percentage,
  null,
  'unmeasured child objective must remain No Data'
);

const fallbackGoal =
  byCode.get('S001.CG2');

assert.strictEqual(
  fallbackGoal.percentage,
  64,
  'zero child data must use the 5C1 same-quarter parent fallback'
);

assert.strictEqual(
  fallbackGoal.source,
  'existing_parent'
);

assert.strictEqual(
  fallbackGoal.calculation.kind,
  'same_quarter_parent_fallback'
);

assert.deepStrictEqual(
  fallbackGoal.calculation.inputs.map(
    row => Number(row.value)
  ),
  [64],
  'fallback explanation must show the one latest same-quarter parent checkpoint, not a new average'
);


/*
 * Canonical parent-checkpoint identity.
 *
 * Existing historical duplicates must not cause one assignment artifact
 * to count twice toward the explained percentage.
 */
const canonicalDuplicateBundle =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG6', {
        id: 'goal-canonical',
      }),
    ],

    parentProgressRows: [
      {
        id: 'checkpoint-old',
        goal_id: 'goal-canonical',
        assignment_instance_id:
          'instance-canonical',
        date: '2026-08-20',
        value: 40,
        source: 'assignment',
        created_at:
          '2026-08-20T10:00:00.000Z',
      },
      {
        id: 'checkpoint-new',
        goal_id: 'goal-canonical',
        assignment_instance_id:
          'instance-canonical',
        date: '2026-08-20',
        value: 80,
        source: 'assignment',
        created_at:
          '2026-08-20T11:00:00.000Z',
      },
      {
        id: 'checkpoint-manual',
        goal_id: 'goal-canonical',
        assignment_instance_id: null,
        date: '2026-09-01',
        value: 60,
        source: 'manual',
        created_at:
          '2026-09-01T11:00:00.000Z',
      },
    ],

    parentDataPointRows: [],

    assignmentInstances: [
      {
        id: 'instance-canonical',
        status: 'Reviewed',
        settings: {},
      },
    ],

    objectiveProgress: {
      available: true,
      parents: [],
    },
  });

const canonicalGoal =
  canonicalDuplicateBundle.goals[0];

assert.strictEqual(
  canonicalGoal.percentage,
  70,
  'one assignment instance + parent goal must contribute one canonical checkpoint: mean(80,60)=70'
);

assert.strictEqual(
  canonicalGoal
    .calculation
    .checkpoint_count,
  2,
  'historical duplicate parent checkpoint must collapse to one event'
);

assert.deepStrictEqual(
  canonicalGoal
    .calculation
    .inputs
    .map(row => Number(row.value))
    .sort((a, b) => a - b),
  [60, 80],
  'newest canonical assignment checkpoint must replace the stale duplicate'
);


/*
 * Manual/unlinked provenance.
 *
 * Two manual checkpoints can legitimately occur on the same day.
 * Same goal + same date is therefore not a valid causal identity.
 */
const manualSameDayBundle =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG7', {
        id: 'goal-manual',
      }),
    ],

    parentProgressRows: [
      {
        id: 'manual-checkpoint-a',
        goal_id: 'goal-manual',
        assignment_instance_id: null,
        date: '2026-09-02',
        value: 40,
        source: 'manual',
        created_at:
          '2026-09-02T09:00:00.000Z',
      },
      {
        id: 'manual-checkpoint-b',
        goal_id: 'goal-manual',
        assignment_instance_id: null,
        date: '2026-09-02',
        value: 80,
        source: 'manual',
        created_at:
          '2026-09-02T14:00:00.000Z',
      },
    ],

    parentDataPointRows: [
      {
        id: 'manual-evidence-a',
        goal_id: 'goal-manual',
        assignment_instance_id: null,
        item_id: null,
        date: '2026-09-02',
        source: 'manual',
        question_text:
          'Manual evidence A',
        student_answer:
          'Response A',
        created_at:
          '2026-09-02T09:01:00.000Z',
      },
      {
        id: 'manual-evidence-b',
        goal_id: 'goal-manual',
        assignment_instance_id: null,
        item_id: null,
        date: '2026-09-02',
        source: 'manual',
        question_text:
          'Manual evidence B',
        student_answer:
          'Response B',
        created_at:
          '2026-09-02T14:01:00.000Z',
      },
    ],

    assignmentInstances: [],

    objectiveProgress: {
      available: true,
      parents: [],
    },
  });

const manualGoal =
  manualSameDayBundle.goals[0];

assert.strictEqual(
  manualGoal.percentage,
  60,
  'both legitimate manual checkpoints must still participate in the quarter mean'
);

assert.strictEqual(
  manualGoal
    .calculation
    .checkpoint_count,
  2,
  'manual checkpoints must remain separate legitimate events'
);

assert.ok(
  manualGoal
    .calculation
    .inputs
    .every(
      checkpoint =>
        Array.isArray(
          checkpoint.evidence
        ) &&
        checkpoint.evidence.length === 0
    ),
  'manual/unlinked question evidence must not be guessed onto a checkpoint from date alone'
);

const manualJson =
  JSON.stringify(manualGoal);

assert.ok(
  !manualJson.includes(
    'Manual evidence A'
  ) &&
  !manualJson.includes(
    'Manual evidence B'
  ),
  'unprovable manual evidence must not appear as causal checkpoint evidence'
);


/*
 * Canonical ordering must use created_at before instructional date.
 */
const createdAtCanonicalBundle =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG5', {
        id: 'goal-created-order',
      }),
    ],

    parentProgressRows: [
      {
        id: 'aaaaaaaa',
        goal_id: 'goal-created-order',
        assignment_instance_id:
          'instance-created-order',
        date: '2026-09-15',
        value: 40,
        source: 'assignment',
        created_at:
          '2026-09-01T09:00:00.000Z',
      },
      {
        id: 'bbbbbbbb',
        goal_id: 'goal-created-order',
        assignment_instance_id:
          'instance-created-order',
        date: '2026-09-10',
        value: 80,
        source: 'assignment',
        created_at:
          '2026-09-20T09:00:00.000Z',
      },
      {
        id: 'manual-created-order',
        goal_id: 'goal-created-order',
        assignment_instance_id: null,
        date: '2026-09-25',
        value: 60,
        source: 'manual',
        created_at:
          '2026-09-25T09:00:00.000Z',
      },
    ],

    parentDataPointRows: [],

    assignmentInstances: [
      {
        id: 'instance-created-order',
        status: 'Reviewed',
        settings: {},
      },
    ],

    objectiveProgress: {
      available: true,
      parents: [],
    },
  });

const createdAtCanonicalGoal =
  createdAtCanonicalBundle.goals[0];

assert.strictEqual(
  createdAtCanonicalGoal.percentage,
  70,
  'canonical checkpoint must use newer created_at even when its instructional date is earlier'
);

assert.deepStrictEqual(
  createdAtCanonicalGoal
    .calculation
    .inputs
    .map(row => Number(row.value))
    .sort((a, b) => a - b),
  [60, 80],
  'created_at ordering must choose the canonical 80 checkpoint'
);


/*
 * created_at ties must use id DESC deterministically.
 */
const idTieCanonicalBundle =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG4', {
        id: 'goal-id-tie',
      }),
    ],

    parentProgressRows: [
      {
        id: 'aaaaaaaa',
        goal_id: 'goal-id-tie',
        assignment_instance_id:
          'instance-id-tie',
        date: '2026-09-15',
        value: 40,
        source: 'assignment',
        created_at:
          '2026-09-20T09:00:00.000Z',
      },
      {
        id: 'bbbbbbbb',
        goal_id: 'goal-id-tie',
        assignment_instance_id:
          'instance-id-tie',
        date: '2026-09-10',
        value: 80,
        source: 'assignment',
        created_at:
          '2026-09-20T09:00:00.000Z',
      },
      {
        id: 'manual-id-tie',
        goal_id: 'goal-id-tie',
        assignment_instance_id: null,
        date: '2026-09-25',
        value: 60,
        source: 'manual',
        created_at:
          '2026-09-25T09:00:00.000Z',
      },
    ],

    parentDataPointRows: [],

    assignmentInstances: [
      {
        id: 'instance-id-tie',
        status: 'Reviewed',
        settings: {},
      },
    ],

    objectiveProgress: {
      available: true,
      parents: [],
    },
  });

assert.strictEqual(
  idTieCanonicalBundle.goals[0].percentage,
  70,
  'created_at tie must choose lexically newer id as canonical checkpoint'
);


/*
 * Question-level assignment evidence uses the same canonical ordering.
 */
const dataPointCanonicalBundle =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG3', {
        id: 'goal-point-order',
      }),
    ],

    parentProgressRows: [
      {
        id: 'checkpoint-point-order',
        goal_id: 'goal-point-order',
        assignment_instance_id:
          'instance-point-order',
        date: '2026-09-20',
        value: 75,
        source: 'assignment',
        created_at:
          '2026-09-20T12:00:00.000Z',
      },
    ],

    parentDataPointRows: [
      {
        id: 'aaaaaaaa',
        goal_id: 'goal-point-order',
        assignment_instance_id:
          'instance-point-order',
        item_id: 101,
        date: '2026-09-20',
        source: 'assignment',
        question_text:
          'OLDER CREATED ROW',
        student_answer: 'A',
        correct_answer: 'B',
        is_correct: false,
        created_at:
          '2026-09-21T09:00:00.000Z',
      },
      {
        id: 'bbbbbbbb',
        goal_id: 'goal-point-order',
        assignment_instance_id:
          'instance-point-order',
        item_id: 101,
        date: '2026-09-19',
        source: 'assignment',
        question_text:
          'NEWER CREATED ROW',
        student_answer: 'B',
        correct_answer: 'B',
        is_correct: true,
        created_at:
          '2026-09-22T09:00:00.000Z',
      },
    ],

    assignmentInstances: [
      {
        id: 'instance-point-order',
        status: 'Reviewed',
        settings: {},
      },
    ],

    objectiveProgress: {
      available: true,
      parents: [],
    },
  });

const canonicalPointEvidence =
  dataPointCanonicalBundle
    .goals[0]
    .calculation
    .inputs[0]
    .evidence;

assert.strictEqual(
  canonicalPointEvidence.length,
  1
);

assert.strictEqual(
  canonicalPointEvidence[0]
    .question_text,
  'NEWER CREATED ROW',
  'question evidence canonicalization must use created_at before instructional date'
);


/*
 * Question evidence also uses id DESC after a created_at tie.
 */
const dataPointIdTieBundle =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG10', {
        id: 'goal-point-id-tie',
      }),
    ],

    parentProgressRows: [
      {
        id: 'checkpoint-point-id-tie',
        goal_id: 'goal-point-id-tie',
        assignment_instance_id:
          'instance-point-id-tie',
        date: '2026-09-20',
        value: 75,
        source: 'assignment',
        created_at:
          '2026-09-20T12:00:00.000Z',
      },
    ],

    parentDataPointRows: [
      {
        id: 'aaaaaaaa',
        goal_id: 'goal-point-id-tie',
        assignment_instance_id:
          'instance-point-id-tie',
        item_id: 101,
        date: '2026-09-20',
        source: 'assignment',
        question_text:
          'LOWER ID ROW',
        student_answer: 'A',
        created_at:
          '2026-09-22T09:00:00.000Z',
      },
      {
        id: 'bbbbbbbb',
        goal_id: 'goal-point-id-tie',
        assignment_instance_id:
          'instance-point-id-tie',
        item_id: 101,
        date: '2026-09-19',
        source: 'assignment',
        question_text:
          'HIGHER ID ROW',
        student_answer: 'B',
        created_at:
          '2026-09-22T09:00:00.000Z',
      },
    ],

    assignmentInstances: [
      {
        id: 'instance-point-id-tie',
        status: 'Reviewed',
        settings: {},
      },
    ],

    objectiveProgress: {
      available: true,
      parents: [],
    },
  });

assert.strictEqual(
  dataPointIdTieBundle
    .goals[0]
    .calculation
    .inputs[0]
    .evidence[0]
    .question_text,
  'HIGHER ID ROW',
  'question evidence created_at tie must use id DESC'
);

const forbiddenKeys = new Set([
  'id',
  'goal_id',
  'student_id',
  'student_code',
  'class_id',
  'assignment_instance_id',
  'item_id',
  'objective_id',
  'created_at',
  'notes',
  'collected_by',
]);

function inspect(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(inspect);
    return;
  }

  if (
    typeof value !== 'object'
  ) {
    return;
  }

  for (
    const [key, child] of
    Object.entries(value)
  ) {
    assert.ok(
      !forbiddenKeys.has(key),
      `browser-safe explanation bundle leaked forbidden field: ${key}`
    );

    inspect(child);
  }
}

inspect(bundle);

const dormant =
  buildStudentGoalExplanationBundle({
    quarterRange: Q1,

    goals: [
      goal('S001.CG1', {
        id: objectiveId,
        objectives: [
          {
            objective_number: 1,
            objective_text: 'Objective one',
          },
        ],
      }),
    ],

    parentProgressRows: [
      progress({
        goalCode: 'S001.CG1',
        goalId: objectiveId,
        date: '2026-08-30',
        value: 70,
        source: 'manual',
      }),
    ],

    parentDataPointRows: [],

    assignmentInstances: [],

    objectiveProgress: {
      available: false,
      reason: 'schema_unavailable',
      parents: [],
    },
  });

const dormantGoal =
  dormant.goals[0];

assert.strictEqual(
  dormantGoal.percentage,
  70,
  'dormant objective tables must not erase valid ordinary parent progress'
);

assert.deepStrictEqual(
  dormantGoal.objective_status,
  {
    available: false,
    reason: 'schema_unavailable',
  },
  'objective unavailable must remain distinct from No Data'
);

console.log(
  '✓ Student Goal Explanation pure bundle contract'
);
