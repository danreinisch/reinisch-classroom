'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'Running auto-scored objective evidence writer helper tests...\n'
);

const helperPath = path.join(
  __dirname,
  '..',
  'netlify',
  'functions',
  '_lib',
  'objective-auto-evidence-writer.js'
);

assert.ok(
  fs.existsSync(helperPath),
  'Slice 5B1 objective auto-evidence writer helper must exist'
);

const {
  getObjectiveCandidateItemIds,
  fetchAssignmentItemObjectiveMappings,
  buildAutoObjectiveEvidenceRows,
  reconcileAssignmentObjectiveDataPoints,
} = require(helperPath);

assert.strictEqual(
  typeof getObjectiveCandidateItemIds,
  'function',
  'getObjectiveCandidateItemIds must be exported'
);

assert.strictEqual(
  typeof fetchAssignmentItemObjectiveMappings,
  'function',
  'fetchAssignmentItemObjectiveMappings must be exported'
);

assert.strictEqual(
  typeof buildAutoObjectiveEvidenceRows,
  'function',
  'buildAutoObjectiveEvidenceRows must be exported'
);

assert.strictEqual(
  typeof reconcileAssignmentObjectiveDataPoints,
  'function',
  'reconcileAssignmentObjectiveDataPoints must be exported'
);

async function main() {

/* -------------------------------------------------------------------------- */
/* Exact no-IO preflight                                                      */
/* -------------------------------------------------------------------------- */

{
  const ids = getObjectiveCandidateItemIds([
    {
      id: 101,
      goal_codes: ['S009.CG1'],
      meta: {
        text: 'Parent-only goal question',
      },
    },
    {
      id: 102,
      goal_codes: [],
      meta: {},
    },
  ]);

  assert.deepStrictEqual(
    ids,
    [],
    'IG-only items must not become objective-query candidates'
  );

  console.log(
    '✓ IG-only / no-IO items produce zero objective candidates'
  );
}

{
  const ids = getObjectiveCandidateItemIds([
    {
      id: 101,
      meta: {
        objective_components: [
          {
            code: 'S009.CG1.O1',
            max: 1,
            order: 1,
          },
        ],
      },
    },
    {
      id: 102,
      meta: {},
    },
  ]);

  assert.deepStrictEqual(
    ids,
    [101]
  );

  console.log(
    '✓ only explicit IO metadata marks an item as an objective candidate'
  );
}


{
  let fetchCalls = 0;

  const mappings =
    await fetchAssignmentItemObjectiveMappings({
      itemIds: [],
      supabaseUrl:
        'https://example.supabase.co',
      serviceRoleKey:
        'test-key',
      fetchImpl:
        async () => {
          fetchCalls++;
          throw new Error(
            'fetch must not run'
          );
        },
    });

  assert.deepStrictEqual(
    mappings,
    []
  );

  assert.strictEqual(
    fetchCalls,
    0,
    'empty objective candidate list must perform zero network requests'
  );

  console.log(
    '✓ no-IO preflight performs zero objective mapping requests'
  );
}


{
  const calls = [];

  const mappings =
    await fetchAssignmentItemObjectiveMappings({
      itemIds: [101, 103, 101],
      supabaseUrl:
        'https://example.supabase.co',
      serviceRoleKey:
        'test-key',
      fetchImpl:
        async (url, options = {}) => {
          calls.push({
            url,
            method:
              options.method || 'GET',
          });

          return {
            ok: true,
            status: 200,
            async json() {
              return [
                {
                  item_id: 101,
                  objective_id:
                    'objective-uuid-1',
                  component_label:
                    null,
                  objective_max: 3,
                  component_order: 1,
                },
                {
                  item_id: 103,
                  objective_id:
                    'objective-uuid-2',
                  component_label:
                    null,
                  objective_max: 1,
                  component_order: 1,
                },
              ];
            },
          };
        },
    });

  assert.strictEqual(
    calls.length,
    1,
    'objective mapping lookup should use one server request'
  );

  assert.strictEqual(
    calls[0].method,
    'GET'
  );

  assert.match(
    calls[0].url,
    /\/rest\/v1\/assignment_item_objectives\?/
  );

  assert.match(
    calls[0].url,
    /item_id=in\.\(101,103\)/,
    'mapping lookup must query only unique explicit candidate item IDs'
  );

  assert.ok(
    !calls[0].url.includes('102'),
    'non-objective item IDs must never enter the mapping query'
  );

  assert.strictEqual(
    mappings.length,
    2
  );

  console.log(
    '✓ normalized mapping lookup is limited to explicit objective candidate items'
  );
}

/* -------------------------------------------------------------------------- */
/* No normalized mapping = no evidence                                        */
/* -------------------------------------------------------------------------- */

{
  const rows = buildAutoObjectiveEvidenceRows({
    items: [
      {
        id: 101,
        answer_type: 'mcq',
        points: 1,
        meta: {
          text: 'What happened?',
          choices: ['A', 'B'],
          correct: 'A',
          objective_components: [
            {
              code: 'S009.CG1.O1',
              max: 3,
              order: 1,
            },
          ],
        },
      },
    ],
    submissionAnswers: [
      {
        assignment_item_id: 101,
        raw_answer: {
          value: 'A',
        },
        earned_points: 1,
        max_points: 1,
        is_correct: true,
      },
    ],
    mappings: [],
    studentId: 'student-uuid-1',
    assignmentInstanceId: 'instance-uuid-1',
    date: '2026-08-23',
    schoolYear: '2026-2027',
  });

  assert.deepStrictEqual(
    rows,
    [],
    'parsed metadata alone must never create objective evidence'
  );

  console.log(
    '✓ normalized mapping is required before objective evidence can exist'
  );
}

/* -------------------------------------------------------------------------- */
/* Performance-ratio transfer                                                 */
/* -------------------------------------------------------------------------- */

function baseItem(overrides = {}) {
  return {
    id: 101,
    item_ref: '1_1',
    answer_type: 'mcq',
    points: 1,
    meta: {
      text: 'Which answer is correct?',
      choices: ['A', 'B', 'C'],
      correct: 'A',
      objective_components: [
        {
          code: 'S009.CG1.O1',
          max: 3,
          order: 1,
        },
      ],
    },
    ...overrides,
  };
}

function baseMapping(overrides = {}) {
  return {
    item_id: 101,
    objective_id: 'objective-uuid-1',
    component_label: null,
    objective_max: 3,
    component_order: 1,
    ...overrides,
  };
}

function buildOne({
  item = baseItem(),
  answer,
  mapping = baseMapping(),
} = {}) {
  return buildAutoObjectiveEvidenceRows({
    items: [item],
    submissionAnswers: [answer],
    mappings: [mapping],
    studentId: 'student-uuid-1',
    assignmentInstanceId: 'instance-uuid-1',
    date: '2026-08-23',
    schoolYear: '2026-2027',
  });
}

{
  const rows = buildOne({
    answer: {
      assignment_item_id: 101,
      raw_answer: {
        value: 'A',
      },
      earned_points: 1,
      max_points: 1,
      is_correct: true,
    },
  });

  assert.strictEqual(rows.length, 1);

  assert.deepStrictEqual(
    rows[0],
    {
      objective_id:
        'objective-uuid-1',
      student_id:
        'student-uuid-1',
      assignment_instance_id:
        'instance-uuid-1',
      item_id:
        101,
      objective_earned:
        3,
      objective_max:
        3,
      question_text:
        'Which answer is correct?',
      choices:
        ['A', 'B', 'C'],
      student_answer:
        'A',
      correct_answer:
        'A',
      is_correct:
        true,
      component_label:
        null,
      support_level:
        null,
      evidence_type:
        'question',
      source:
        'assignment',
      notes:
        null,
      date:
        '2026-08-23',
      school_year:
        '2026-2027',
    }
  );

  console.log(
    '✓ academic 1/1 transfers as objective 3/3 with full provenance'
  );
}

{
  const rows = buildOne({
    answer: {
      assignment_item_id: 101,
      raw_answer: {
        value: 'B',
      },
      earned_points: 0,
      max_points: 1,
      is_correct: false,
    },
  });

  assert.strictEqual(rows.length, 1);
  assert.strictEqual(
    rows[0].objective_earned,
    0
  );
  assert.strictEqual(
    rows[0].objective_max,
    3
  );

  console.log(
    '✓ measured academic 0% remains real objective evidence 0/3'
  );
}

{
  const item = baseItem({
    points: 6,
    answer_type: 'constructed',
  });

  const rows = buildOne({
    item,
    mapping: baseMapping({
      objective_max: 4,
    }),
    answer: {
      assignment_item_id: 101,
      raw_answer: {
        value: 'partial answer',
      },
      earned_points: 2,
      max_points: 6,
      is_correct: false,
    },
  });

  assert.strictEqual(rows.length, 1);

  assert.strictEqual(
    rows[0].objective_earned,
    1.33,
    '2/6 performance applied to Objective Max 4 must become 1.33/4'
  );

  assert.strictEqual(
    rows[0].objective_max,
    4
  );

  console.log(
    '✓ partial credit transfers by ratio rather than copying academic points'
  );
}

/* -------------------------------------------------------------------------- */
/* No score = no child evidence                                               */
/* -------------------------------------------------------------------------- */

{
  const rows = buildOne({
    item: baseItem({
      answer_type: 'written_response',
      points: 5,
    }),
    answer: {
      assignment_item_id: 101,
      raw_answer: {
        value: 'Student paragraph',
      },
      earned_points: null,
      max_points: 5,
      is_correct: null,
    },
  });

  assert.deepStrictEqual(
    rows,
    [],
    'unscored writing belongs to 5B2 and must not create 5B1 evidence'
  );

  console.log(
    '✓ unscored written response remains outside 5B1'
  );
}

/* -------------------------------------------------------------------------- */
/* Never clone one item score into several objectives                         */
/* -------------------------------------------------------------------------- */

{
  assert.throws(
    () =>
      buildAutoObjectiveEvidenceRows({
        items: [
          baseItem(),
        ],
        submissionAnswers: [
          {
            assignment_item_id: 101,
            raw_answer: {
              value: 'A',
            },
            earned_points: 1,
            max_points: 1,
            is_correct: true,
          },
        ],
        mappings: [
          baseMapping(),
          baseMapping({
            objective_id:
              'objective-uuid-2',
            component_label:
              'Second component',
            component_order:
              2,
          }),
        ],
        studentId:
          'student-uuid-1',
        assignmentInstanceId:
          'instance-uuid-1',
        date:
          '2026-08-23',
        schoolYear:
          '2026-2027',
      }),
    /exactly one objective mapping/i,
    '5B1 must refuse to clone one whole item score across multiple objectives'
  );

  console.log(
    '✓ one auto-scored item cannot be copied into multiple objective rows'
  );
}

/* -------------------------------------------------------------------------- */
/* Reconciliation identity                                                    */
/* -------------------------------------------------------------------------- */

function response({
  status = 200,
  data = [],
} = {}) {
  return {
    ok:
      status >= 200 &&
      status < 300,
    status,
    async json() {
      return data;
    },
  };
}

{
  const calls = [];

  const fetchImpl =
    async (url, options = {}) => {
      calls.push({
        url,
        method:
          options.method || 'GET',
        body:
          options.body
            ? JSON.parse(options.body)
            : null,
      });

      if (
        (options.method || 'GET') ===
        'GET'
      ) {
        return response({
          data: [
            {
              id:
                'existing-evidence-id',
              created_at:
                '2026-08-23T20:00:00Z',
            },
          ],
        });
      }

      if (
        options.method === 'PATCH'
      ) {
        return response({
          data: [
            {
              id:
                'existing-evidence-id',
            },
          ],
        });
      }

      throw new Error(
        'Unexpected fetch call'
      );
    };

  await reconcileAssignmentObjectiveDataPoints({
    rows: [
      {
        objective_id:
          'objective-uuid-1',
        student_id:
          'student-uuid-1',
        assignment_instance_id:
          'instance-uuid-1',
        item_id:
          101,
        objective_earned:
          3,
        objective_max:
          3,
        source:
          'assignment',
        date:
          '2026-08-23',
      },
    ],
    supabaseUrl:
      'https://example.supabase.co',
    serviceRoleKey:
      'test-key',
    fetchImpl,
  });

  assert.strictEqual(
    calls.length,
    2
  );

  assert.strictEqual(
    calls[0].method,
    'GET'
  );

  assert.match(
    calls[0].url,
    /\/rest\/v1\/objective_data_points\?/
  );

  assert.match(
    calls[0].url,
    /assignment_instance_id=eq/
  );

  assert.match(
    calls[0].url,
    /item_id=eq/
  );

  assert.match(
    calls[0].url,
    /objective_id=eq/
  );

  assert.match(
    calls[0].url,
    /source=eq\.assignment/
  );

  assert.strictEqual(
    calls[1].method,
    'PATCH',
    'rescore must PATCH the canonical existing identity'
  );

  assert.match(
    calls[1].url,
    /id=eq\.existing-evidence-id/
  );

  assert.ok(
    !calls.some(
      call =>
        call.method === 'POST'
    ),
    'rescore must not append a second current row'
  );

  console.log(
    '✓ rescore reconciles instance + item + objective instead of appending'
  );
}


{
  const calls = [];

  const fetchImpl =
    async (url, options = {}) => {
      calls.push({
        url,
        method:
          options.method || 'GET',
        body:
          options.body
            ? JSON.parse(options.body)
            : null,
      });

      if (
        (options.method || 'GET') ===
        'GET'
      ) {
        return response({
          data: [],
        });
      }

      if (
        options.method === 'POST'
      ) {
        return response({
          status: 201,
          data: [
            {
              id:
                'new-objective-evidence-id',
            },
          ],
        });
      }

      throw new Error(
        'Unexpected fetch call'
      );
    };

  const results =
    await reconcileAssignmentObjectiveDataPoints({
      rows: [
        {
          objective_id:
            'objective-uuid-1',
          student_id:
            'student-uuid-1',
          assignment_instance_id:
            'instance-uuid-1',
          item_id:
            101,
          objective_earned:
            1.5,
          objective_max:
            3,
          source:
            'assignment',
          date:
            '2026-08-23',
        },
      ],
      supabaseUrl:
        'https://example.supabase.co',
      serviceRoleKey:
        'test-key',
      fetchImpl,
    });

  assert.strictEqual(
    calls.length,
    2
  );

  assert.strictEqual(
    calls[0].method,
    'GET'
  );

  assert.strictEqual(
    calls[1].method,
    'POST',
    'first-ever objective evidence must INSERT when identity does not yet exist'
  );

  assert.match(
    calls[1].url,
    /\/rest\/v1\/objective_data_points$/
  );

  assert.strictEqual(
    calls[1].body.objective_id,
    'objective-uuid-1'
  );

  assert.strictEqual(
    calls[1].body.assignment_instance_id,
    'instance-uuid-1'
  );

  assert.strictEqual(
    calls[1].body.item_id,
    101
  );

  assert.strictEqual(
    results[0].action,
    'inserted'
  );

  assert.ok(
    !calls.some(
      call =>
        call.method === 'PATCH'
    ),
    'new objective evidence must not PATCH a nonexistent identity'
  );

  console.log(
    '✓ first objective result inserts exactly one current assignment identity'
  );
}

console.log('');
console.log(
  'OBJECTIVE AUTO-EVIDENCE WRITER HELPER: PASS'
);

}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
