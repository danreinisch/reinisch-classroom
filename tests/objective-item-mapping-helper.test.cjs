'use strict';

const assert = require('assert');

const {
  BLOCKING_CODES,
  normalizeObjectiveComponents,
  validateObjectiveComponents,
  preflightObjectiveItemMappings,
  clearAssignmentObjectiveMappings,
  replaceAssignmentItemObjectives,
  hasObjectiveMetadataInAssignmentMeta,
} = require('../netlify/functions/_lib/objective-item-mapping');

console.log('Running objective item-mapping helper tests...\n');


assert.strictEqual(
  typeof hasObjectiveMetadataInAssignmentMeta,
  'function',
  'stale objective cleanup detector must be exported'
);


assert.strictEqual(
  hasObjectiveMetadataInAssignmentMeta({
    days: [
      {
        type: 'questions',
        questions: [
          {
            text: 'Legacy item',
          },
        ],
      },
    ],
  }),
  false,
  'ordinary legacy assignment meta must not be treated as objective-aware'
);

assert.strictEqual(
  hasObjectiveMetadataInAssignmentMeta({
    days: [
      {
        type: 'questions',
        questions: [
          {
            objective_components: [
              {
                code: 'S009.CG1.O1',
                max: 1,
                order: 1,
              },
            ],
          },
        ],
      },
    ],
  }),
  true,
  'stored objective component metadata must be detected'
);

console.log(
  '✓ stored assignment objective metadata is detected without inference'
);

function makeResponse({
  ok = true,
  status = 200,
  json = [],
  text = '',
} = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    },
    async text() {
      return text;
    },
  };
}

function registryRow({
  id,
  code,
  student = 'S009',
  parent = 'S009.CG1',
  active = true,
}) {
  return {
    id: id || `id-${code}`,
    code,
    student_code: student,
    parent_goal_code: parent,
    active,
  };
}

async function expectBlockingCode(
  expectedCode,
  fn,
  label
) {
  let caught = null;

  try {
    await fn();
  } catch (err) {
    caught = err;
  }

  assert.ok(
    caught,
    `${label}: expected a blocking error`
  );

  assert.strictEqual(
    caught.code,
    expectedCode,
    `${label}: wrong blocking code`
  );

  assert.strictEqual(
    caught.statusCode,
    422,
    `${label}: blocking error must use 422 semantics`
  );

  console.log(`✓ ${label}`);
}

/* -------------------------------------------------------------------------- */
/* No-IO backward compatibility                                              */
/* -------------------------------------------------------------------------- */

(async () => {
  {
    let fetchCalls = 0;

    const result =
      await preflightObjectiveItemMappings({
        fetchFn: async () => {
          fetchCalls += 1;
          throw new Error(
            'fetch must not run for no-IO assignment'
          );
        },
        supabaseUrl: 'https://example.supabase.co',
        serviceRoleKey: 'test-key',
        studentCode: 'S009',
        items: [
          {
            item_ref: '1_1',
            goal_codes: ['S009.CG1'],
            points: 1,
            meta: {
              text: 'Legacy item',
            },
          },
        ],
      });

    assert.deepStrictEqual(
      result,
      {
        engaged: false,
        student_code: null,
        by_item_ref: {},
      }
    );

    assert.strictEqual(
      fetchCalls,
      0,
      'no-IO assignments must never query goal_objectives'
    );

    console.log(
      '✓ no-IO assignment is an exact registry-query no-op'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Simple valid objective                                                   */
  /* ------------------------------------------------------------------------ */

  {
    const rows = [
      registryRow({
        code: 'S009.CG1.O1',
      }),
    ];

    const fetchCalls = [];

    const result =
      await preflightObjectiveItemMappings({
        fetchFn: async (url, options) => {
          fetchCalls.push({
            url,
            options,
          });

          return makeResponse({
            json: rows,
          });
        },
        supabaseUrl: 'https://example.supabase.co',
        serviceRoleKey: 'test-key',
        studentCode: 'S009',
        items: [
          {
            item_ref: '1_1',
            goal_codes: ['S009.CG1'],
            points: 1,
            meta: {
              objective_components: [
                {
                  code: 'S009.CG1.O1',
                  label: null,
                  max: 1,
                  order: 1,
                },
              ],
            },
          },
        ],
      });

    assert.strictEqual(
      fetchCalls.length,
      1,
      'valid IO assignment should query registry exactly once'
    );

    assert.strictEqual(
      result.engaged,
      true
    );

    assert.strictEqual(
      result.student_code,
      'S009'
    );

    assert.deepStrictEqual(
      result.by_item_ref['1_1'],
      [
        {
          objective_id: 'id-S009.CG1.O1',
          objective_code: 'S009.CG1.O1',
          component_label: null,
          objective_max: 1,
          component_order: 1,
        },
      ]
    );

    console.log(
      '✓ valid simple IO resolves to normalized objective ID'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Objective Max remains independent                                       */
  /* ------------------------------------------------------------------------ */

  {
    const resolved =
      validateObjectiveComponents({
        objective_components: [
          {
            code: 'S008.CG2.O1',
            label: null,
            max: 3,
            order: 1,
          },
        ],
        registryRows: [
          registryRow({
            code: 'S008.CG2.O1',
            student: 'S008',
            parent: 'S008.CG2',
          }),
        ],
        studentCode: 'S008',
        parentGoalCodes: ['S008.CG2'],
      });

    assert.strictEqual(
      resolved[0].objective_max,
      3
    );

    console.log(
      '✓ Objective Max 3 survives independently from academic points'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Unknown objective                                                        */
  /* ------------------------------------------------------------------------ */

  await expectBlockingCode(
    BLOCKING_CODES.NOT_FOUND,
    async () => {
      await preflightObjectiveItemMappings({
        fetchFn: async () =>
          makeResponse({
            json: [],
          }),
        supabaseUrl: 'https://example.supabase.co',
        serviceRoleKey: 'test-key',
        studentCode: 'S009',
        items: [
          {
            item_ref: '1_1',
            goal_codes: ['S009.CG1'],
            meta: {
              objective_components: [
                {
                  code: 'S009.CG1.O99',
                  max: 1,
                  order: 1,
                },
              ],
            },
          },
        ],
      });
    },
    'unknown objective blocks issuance'
  );

  /* ------------------------------------------------------------------------ */
  /* Inactive objective                                                       */
  /* ------------------------------------------------------------------------ */

  await expectBlockingCode(
    BLOCKING_CODES.INACTIVE,
    async () => {
      validateObjectiveComponents({
        objective_components: [
          {
            code: 'S009.CG1.O1',
            max: 1,
            order: 1,
          },
        ],
        registryRows: [
          registryRow({
            code: 'S009.CG1.O1',
            active: false,
          }),
        ],
        studentCode: 'S009',
        parentGoalCodes: ['S009.CG1'],
      });
    },
    'inactive objective blocks issuance'
  );

  /* ------------------------------------------------------------------------ */
  /* Wrong student                                                            */
  /* ------------------------------------------------------------------------ */

  await expectBlockingCode(
    BLOCKING_CODES.STUDENT_MISMATCH,
    async () => {
      validateObjectiveComponents({
        objective_components: [
          {
            code: 'S009.CG1.O1',
            max: 1,
            order: 1,
          },
        ],
        registryRows: [
          registryRow({
            code: 'S009.CG1.O1',
            student: 'S009',
          }),
        ],
        studentCode: 'S008',
        parentGoalCodes: ['S009.CG1'],
      });
    },
    'objective belonging to another student blocks issuance'
  );

  /* ------------------------------------------------------------------------ */
  /* Wrong parent                                                             */
  /* ------------------------------------------------------------------------ */

  await expectBlockingCode(
    BLOCKING_CODES.PARENT_MISMATCH,
    async () => {
      validateObjectiveComponents({
        objective_components: [
          {
            code: 'S009.CG1.O1',
            max: 1,
            order: 1,
          },
        ],
        registryRows: [
          registryRow({
            code: 'S009.CG1.O1',
            parent: 'S009.CG1',
          }),
        ],
        studentCode: 'S009',
        parentGoalCodes: ['S009.CG2'],
      });
    },
    'IO whose controlling parent is not in item IG blocks issuance'
  );

  /* ------------------------------------------------------------------------ */
  /* Multiple IOs on ordinary item                                            */
  /* ------------------------------------------------------------------------ */

  await expectBlockingCode(
    BLOCKING_CODES.AMBIGUOUS,
    async () => {
      validateObjectiveComponents({
        objective_components: [
          {
            code: 'S009.CG1.O1',
            max: 1,
            order: 1,
          },
          {
            code: 'S009.CG1.O2',
            max: 1,
            order: 2,
          },
        ],
        registryRows: [
          registryRow({
            code: 'S009.CG1.O1',
          }),
          registryRow({
            code: 'S009.CG1.O2',
          }),
        ],
        studentCode: 'S009',
        parentGoalCodes: ['S009.CG1'],
        allowMultiple: false,
      });
    },
    'multiple IOs on ordinary item require explicit component block'
  );

  /* ------------------------------------------------------------------------ */
  /* Invalid Objective Max                                                    */
  /* ------------------------------------------------------------------------ */

  await expectBlockingCode(
    BLOCKING_CODES.MAX_INVALID,
    async () => {
      normalizeObjectiveComponents([
        {
          code: 'S009.CG1.O1',
          max: 0,
          order: 1,
        },
      ]);
    },
    'Objective Max zero blocks issuance'
  );

  await expectBlockingCode(
    BLOCKING_CODES.MAX_INVALID,
    async () => {
      normalizeObjectiveComponents([
        {
          code: 'S009.CG1.O1',
          max: -2,
          order: 1,
        },
      ]);
    },
    'negative Objective Max blocks issuance'
  );

  /* ------------------------------------------------------------------------ */
  /* Unbound Objective Max                                                    */
  /* ------------------------------------------------------------------------ */

  await expectBlockingCode(
    BLOCKING_CODES.MAX_INVALID,
    async () => {
      await preflightObjectiveItemMappings({
        fetchFn: async () => {
          throw new Error(
            'registry must not be queried before unbound max fails'
          );
        },
        supabaseUrl: 'https://example.supabase.co',
        serviceRoleKey: 'test-key',
        studentCode: 'S008',
        items: [
          {
            item_ref: '1_1',
            goal_codes: ['S008.CG2'],
            meta: {
              objective_max_unbound: 3,
            },
          },
        ],
      });
    },
    'Objective Max without IO blocks issuance'
  );

  /* ------------------------------------------------------------------------ */
  /* Malformed Objective Max blocks before registry lookup                    */
  /* ------------------------------------------------------------------------ */

  {
    let fetchCalls = 0;

    await expectBlockingCode(
      BLOCKING_CODES.MAX_INVALID,
      async () => {
        await preflightObjectiveItemMappings({
          fetchFn: async () => {
            fetchCalls += 1;
            throw new Error(
              'registry must not be queried for malformed Objective Max'
            );
          },
          supabaseUrl:
            'https://example.supabase.co',
          serviceRoleKey:
            'test-key',
          studentCode:
            'S008',
          items: [
            {
              item_ref: '1_1',
              goal_codes: ['S008.CG2'],
              meta: {
                objective_components: [
                  {
                    code: 'S008.CG2.O1',
                    max: 1,
                    order: 1,
                  },
                ],
                objective_max_invalid_raw:
                  'banana',
              },
            },
          ],
        });
      },
      'malformed Objective Max blocks issuance'
    );

    assert.strictEqual(
      fetchCalls,
      0,
      'malformed Objective Max must block before goal_objectives lookup'
    );

    console.log(
      '✓ malformed Objective Max blocks before registry query'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Four-component explicit writing artifact                                 */
  /* ------------------------------------------------------------------------ */

  {
    const components = [
      {
        code: 'S053.CG2.O1',
        label: 'Compound sentence',
        max: 1,
        order: 1,
      },
      {
        code: 'S053.CG2.O2',
        label: 'Transition word',
        max: 1,
        order: 2,
      },
      {
        code: 'S053.CG2.O3',
        label: 'Conclusion sentence',
        max: 1,
        order: 3,
      },
      {
        code: 'S053.CG2.O4',
        label: 'Adjective use',
        max: 1,
        order: 4,
      },
    ];

    const rows =
      components.map(component =>
        registryRow({
          code: component.code,
          student: 'S053',
          parent: 'S053.CG2',
        })
      );

    const result =
      await preflightObjectiveItemMappings({
        fetchFn: async () =>
          makeResponse({
            json: rows,
          }),
        supabaseUrl: 'https://example.supabase.co',
        serviceRoleKey: 'test-key',
        studentCode: 'S053',
        items: [
          {
            item_ref: 'WP_4',
            points: 5,
            goal_codes: ['S053.CG2'],
            meta: {
              objective_components_explicit: true,
              objective_components: components,
            },
          },
        ],
      });

    assert.strictEqual(
      result.by_item_ref.WP_4.length,
      4
    );

    assert.deepStrictEqual(
      result.by_item_ref.WP_4.map(
        row => row.component_order
      ),
      [1, 2, 3, 4]
    );

    assert.deepStrictEqual(
      result.by_item_ref.WP_4.map(
        row => row.component_label
      ),
      [
        'Compound sentence',
        'Transition word',
        'Conclusion sentence',
        'Adjective use',
      ]
    );

    console.log(
      '✓ explicit writing block resolves four independent objective components'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Persistence: atomic replacement RPC                                      */
  /* ------------------------------------------------------------------------ */

  {
    const calls = [];

    const fetchFn =
      async (url, options = {}) => {
        calls.push({
          url,
          method: options.method,
          body: options.body || null,
        });

        return makeResponse({
          json: 1,
        });
      };

    const result =
      await replaceAssignmentItemObjectives({
        fetchFn,
        supabaseUrl:
          'https://example.supabase.co',
        serviceRoleKey:
          'test-key',
        itemId:
          'item-1',
        resolvedMappings: [
          {
            objective_id:
              'objective-1',
            component_label:
              'Key details',
            objective_max:
              3,
            component_order:
              1,
          },
        ],
      });

    assert.strictEqual(
      result.mapped,
      1
    );

    assert.strictEqual(
      calls.length,
      1,
      'mapping replacement must use one atomic RPC request'
    );

    assert.strictEqual(
      calls[0].method,
      'POST'
    );

    assert.match(
      calls[0].url,
      /\/rpc\/replace_assignment_item_objectives$/
    );

    const payload =
      JSON.parse(calls[0].body);

    assert.deepStrictEqual(
      payload,
      {
        p_item_id:
          'item-1',
        p_mappings: [
          {
            objective_id:
              'objective-1',
            component_label:
              'Key details',
            objective_max:
              3,
            component_order:
              1,
          },
        ],
      }
    );

    console.log(
      '✓ persistence replaces item-objective mappings through one atomic RPC'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Persistence: removing IO atomically clears stale rows                    */
  /* ------------------------------------------------------------------------ */

  {
    const calls = [];

    const result =
      await replaceAssignmentItemObjectives({
        fetchFn: async (url, options = {}) => {
          calls.push({
            url,
            method:
              options.method,
            body:
              options.body || null,
          });

          return makeResponse({
            json: 0,
          });
        },
        supabaseUrl:
          'https://example.supabase.co',
        serviceRoleKey:
          'test-key',
        itemId:
          'item-2',
        resolvedMappings:
          [],
      });

    assert.strictEqual(
      result.mapped,
      0
    );

    assert.strictEqual(
      calls.length,
      1
    );

    assert.strictEqual(
      calls[0].method,
      'POST'
    );

    assert.match(
      calls[0].url,
      /\/rpc\/replace_assignment_item_objectives$/
    );

    assert.deepStrictEqual(
      JSON.parse(calls[0].body),
      {
        p_item_id:
          'item-2',
        p_mappings: [],
      }
    );

    console.log(
      '✓ removing IO atomically clears stale normalized mappings'
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Assignment-wide cleanup does not query objective registry                 */
  /* ------------------------------------------------------------------------ */

  {
    const calls = [];

    const fetchFn =
      async (url, options = {}) => {
        calls.push({
          url,
          method: options.method,
        });

        if (
          url.includes('/assignment_items')
        ) {
          return makeResponse({
            json: [
              { id: 'item-a' },
              { id: 'item-b' },
            ],
          });
        }

        if (
          url.includes('/assignment_item_objectives')
        ) {
          return makeResponse();
        }

        throw new Error(
          `Unexpected cleanup URL: ${url}`
        );
      };

    const result =
      await clearAssignmentObjectiveMappings({
        fetchFn,
        supabaseUrl:
          'https://example.supabase.co',
        serviceRoleKey:
          'test-key',
        assignmentId:
          'assignment-1',
      });

    assert.strictEqual(
      result.cleared_items,
      2
    );

    assert.strictEqual(
      calls.length,
      2
    );

    assert.match(
      calls[0].url,
      /\/assignment_items\?select=id&assignment_id=eq\.assignment-1/
    );

    assert.strictEqual(
      calls[0].method,
      'GET'
    );

    assert.match(
      calls[1].url,
      /\/assignment_item_objectives\?item_id=in\.\(item-a,item-b\)/
    );

    assert.strictEqual(
      calls[1].method,
      'DELETE'
    );

    assert.strictEqual(
      calls.some(
        call =>
          call.url.includes(
            '/goal_objectives'
          )
      ),
      false,
      'cleanup-only path must never query goal_objectives'
    );

    console.log(
      '✓ assignment-wide stale cleanup avoids objective registry query'
    );
  }

  console.log('');
  console.log(
    'OBJECTIVE ITEM-MAPPING HELPER: PASS'
  );
})().catch(err => {
  console.error(err);
  process.exit(1);
});
