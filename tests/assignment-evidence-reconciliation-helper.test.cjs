'use strict';

const assert = require('assert');

const {
  reconcileAssignmentGoalProgress,
  reconcileAssignmentGoalDataPoints,
} = require(
  '../netlify/functions/_lib/assignment-evidence-reconciliation'
);

const BASE = 'https://example.supabase.co';
const KEY = 'service-role-test';

function response(
  status,
  data,
) {
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

(async () => {
  console.log(
    'Running assignment evidence reconciliation helper tests...\n'
  );

  {
    const calls = [];

    const fetchImpl =
      async (
        url,
        options = {},
      ) => {
        calls.push({
          url,
          options,
        });

        if (
          options.method === 'PATCH'
        ) {
          return response(
            200,
            [{
              id: 'existing-1',
              value: 90,
            }],
          );
        }

        return response(
          200,
          [
            {
              id: 'old-2',
              created_at:
                '2026-04-02T12:00:00Z',
            },
            {
              id: 'old-1',
              created_at:
                '2026-04-01T12:00:00Z',
            },
          ],
        );
      };

    const result =
      await reconcileAssignmentGoalProgress({
        row: {
          goal_id: 'goal-1',
          student_id: 'student-1',
          assignment_instance_id:
            'instance-1',
          date: '2026-08-23',
          value: 90,
          source: 'assignment',
          collected_by: 'auto',
        },
        supabaseUrl: BASE,
        serviceRoleKey: KEY,
        fetchImpl,
      });

    assert.strictEqual(
      result.action,
      'updated',
    );

    assert.strictEqual(
      result.matched_count,
      2,
    );

    assert.strictEqual(
      calls.length,
      2,
    );

    assert.ok(
      calls[0].url.includes(
        'assignment_instance_id=eq.instance-1'
      )
    );

    assert.ok(
      calls[0].url.includes(
        'goal_id=eq.goal-1'
      )
    );

    assert.ok(
      calls[0].url.includes(
        'source=eq.assignment'
      )
    );

    assert.ok(
      decodeURIComponent(
        calls[0].url
      ).includes(
        'order=created_at.desc,id.desc'
      ),
      'identity lookup must request newest row first with deterministic id tie-break'
    );

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(
        calls[0].options.headers,
        'Prefer'
      ),
      false,
      'identity GET must not send a Prefer header'
    );

    assert.strictEqual(
      calls[1].options.method,
      'PATCH',
    );

    assert.ok(
      decodeURIComponent(
        calls[1].url
      ).includes(
        'id=eq.old-2'
      ),
      'PATCH must target only the newest canonical row'
    );

    assert.strictEqual(
      decodeURIComponent(
        calls[1].url
      ).includes(
        'id=eq.old-1'
      ),
      false,
      'older legacy duplicate must not be targeted'
    );

    assert.strictEqual(
      calls.some(
        call =>
          call.options.method ===
          'POST'
      ),
      false,
    );

    console.log(
      '✓ existing parent checkpoint updates only the canonical row while retaining legacy duplicates'
    );
  }

  {
    const calls = [];

    const fetchImpl =
      async (
        url,
        options = {},
      ) => {
        calls.push({
          url,
          options,
        });

        if (
          options.method === 'POST'
        ) {
          return response(
            201,
            [{
              id: 'new-1',
            }],
          );
        }

        return response(
          200,
          [],
        );
      };

    const result =
      await reconcileAssignmentGoalProgress({
        row: {
          goal_id: 'goal-2',
          student_id: 'student-1',
          assignment_instance_id:
            'instance-2',
          date: '2026-08-23',
          value: 75,
          source: 'assignment',
          collected_by: 'teacher',
        },
        supabaseUrl: BASE,
        serviceRoleKey: KEY,
        fetchImpl,
      });

    assert.strictEqual(
      result.action,
      'inserted',
    );

    assert.strictEqual(
      calls[1].options.method,
      'POST',
    );

    console.log(
      '✓ missing parent checkpoint identity is inserted once'
    );
  }

  {
    const calls = [];

    const fetchImpl =
      async (
        url,
        options = {},
      ) => {
        calls.push({
          url,
          options,
        });

        if (
          options.method === 'PATCH'
        ) {
          return response(
            200,
            [{
              id: 'dp-old',
            }],
          );
        }

        if (
          options.method === 'POST'
        ) {
          return response(
            201,
            [{
              id: 'dp-new',
            }],
          );
        }

        if (
          url.includes(
            'item_id=eq.11'
          )
        ) {
          return response(
            200,
            [{
              id: 'dp-old',
              created_at:
                '2026-05-01T12:00:00Z',
            }],
          );
        }

        return response(
          200,
          [],
        );
      };

    const results =
      await reconcileAssignmentGoalDataPoints({
        rows: [
          {
            goal_id: 'goal-3',
            student_id: 'student-1',
            assignment_instance_id:
              'instance-3',
            item_id: 11,
            date: '2026-08-23',
            source: 'assignment',
          },
          {
            goal_id: 'goal-3',
            student_id: 'student-1',
            assignment_instance_id:
              'instance-3',
            item_id: 12,
            date: '2026-08-23',
            source: 'assignment',
          },
        ],
        supabaseUrl: BASE,
        serviceRoleKey: KEY,
        fetchImpl,
      });

    assert.strictEqual(
      results[0].action,
      'updated',
    );

    assert.strictEqual(
      results[1].action,
      'inserted',
    );

    assert.ok(
      calls.some(
        call =>
          call.url.includes(
            'item_id=eq.11'
          )
      )
    );

    assert.ok(
      calls.some(
        call =>
          call.url.includes(
            'item_id=eq.12'
          )
      )
    );

    assert.strictEqual(
      calls.some(
        call =>
          call.options.method ===
          'DELETE'
      ),
      false,
    );

    console.log(
      '✓ item evidence reconciles by instance + item + parent goal without historical deletion'
    );
  }

  await assert.rejects(
    () =>
      reconcileAssignmentGoalProgress({
        row: {
          goal_id: 'goal-manual',
          assignment_instance_id:
            'instance-manual',
          source: 'manual',
        },
        supabaseUrl: BASE,
        serviceRoleKey: KEY,
        fetchImpl:
          async () =>
            response(200, []),
      }),
    /source === 'assignment'/
  );

  console.log(
    '✓ non-assignment evidence is rejected by assignment reconciler'
  );

  console.log('');
  console.log(
    'ASSIGNMENT EVIDENCE RECONCILIATION HELPER: PASS'
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
