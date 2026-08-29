'use strict';

/**
 * Slice 5C3A — Student Goal Explanation endpoint.
 *
 * GET only.
 *
 * One Student-authenticated request returns the quarter-scoped explanation
 * model for all active goals belonging to that student.
 *
 * The browser supplies the authorized quarter window already produced by
 * quarter-utils.js:
 *
 *   code
 *   quarter
 *   start
 *   end
 *
 * This endpoint never writes progress/evidence and never mutates or
 * activates the objective registry.
 */

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  requireStudent,
} = require('./_lib/student-auth');

const {
  buildObjectiveRegistryPath,
  indexObjectiveRegistryRowsByParent,
  getBrowserObjectivesForParent,
} = require(
  './_lib/goal-objective-registry-reader'
);

const {
  readObjectiveProgress,
} = require(
  './_lib/objective-progress-reader'
);

const {
  buildStudentGoalExplanationBundle,
} = require(
  './_lib/student-goal-explanation'
);

const {
  url: SUPABASE_URL,
  key:
    SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const {
  SESSION_SECRET,
} = process.env;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function serviceHeaders() {
  return {
    apikey:
      SUPABASE_SERVICE_ROLE_KEY,
    Authorization:
      `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type':
      'application/json',
  };
}

function normalizeRange(params) {
  const quarter =
    String(
      params?.quarter || ''
    ).trim();

  const start =
    String(
      params?.start || ''
    ).trim();

  const end =
    String(
      params?.end || ''
    ).trim();

  if (
    !/^Q[1-4]$/.test(quarter) ||
    !DATE_PATTERN.test(start) ||
    !DATE_PATTERN.test(end) ||
    start > end
  ) {
    return null;
  }

  return {
    quarter,
    start,
    end,
  };
}

async function readJson(
  url,
) {
  const response =
    await fetch(
      url,
      {
        method: 'GET',
        headers:
          serviceHeaders(),
      }
    );

  if (!response.ok) {
    const body =
      await response
        .text()
        .catch(() => '');

    throw new Error(
      `GET failed ${response.status}: ${body}`
    );
  }

  const data =
    await response.json();

  return Array.isArray(data)
    ? data
    : [];
}

function uniqueInstanceIds(
  rows,
) {
  return [
    ...new Set(
      (
        Array.isArray(rows)
          ? rows
          : []
      )
        .map(
          row =>
            row
              ?.assignment_instance_id
        )
        .filter(Boolean)
        .map(String)
    ),
  ];
}

function instanceMapFrom(
  rows,
) {
  return new Map(
    (
      Array.isArray(rows)
        ? rows
        : []
    )
      .filter(
        row => row?.id
      )
      .map(
        row => [
          String(row.id),
          row,
        ]
      )
  );
}

function isReleased(
  instance,
) {
  const status =
    String(
      instance?.status || ''
    ).trim();

  return (
    status === 'Graded' ||
    status === 'Reviewed'
  );
}

function transformObjectiveEvidence(
  rows,
  instances,
) {
  return (
    Array.isArray(rows)
      ? rows
      : []
  )
    .filter(row => {
      if (
        !row
          ?.assignment_instance_id
      ) {
        return true;
      }

      const instance =
        instances.get(
          String(
            row
              .assignment_instance_id
          )
        );

      return (
        instance
          ?.settings
          ?.non_instructional !==
        true
      );
    })
    .map(row => {
      if (
        !row
          ?.assignment_instance_id
      ) {
        return {
          ...row,
          answer_review_available:
            false,
          correct_answer: null,
          is_correct: null,
        };
      }

      const instance =
        instances.get(
          String(
            row
              .assignment_instance_id
          )
        );

      const released =
        isReleased(instance);

      return {
        ...row,
        answer_review_available:
          released,
        correct_answer:
          released
            ? (
                row.correct_answer ??
                null
              )
            : null,
        is_correct:
          released &&
          typeof row
            .is_correct ===
            'boolean'
            ? row.is_correct
            : null,
      };
    });
}

exports.handler =
  async event => {
    const requestId =
      generateRequestId();

    if (
      event.httpMethod ===
      'OPTIONS'
    ) {
      return handleCorsPreFlight(
        event,
        ['GET', 'OPTIONS'],
        ['Content-Type']
      );
    }

    if (
      event.httpMethod !== 'GET'
    ) {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error:
            'Method Not Allowed',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(
        event,
        200,
        {
          ok: true,
          available: false,
          reason:
            'supabase_not_configured',
          goals: [],
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    const params =
      event
        .queryStringParameters ||
      {};

    const codeNorm =
      String(
        params.code || ''
      )
        .trim()
        .toUpperCase();

    if (
      !/^S\d{3}$/.test(
        codeNorm
      )
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Valid student code is required',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    const range =
      normalizeRange(params);

    if (!range) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Valid quarter, start, and end are required',
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    const studentAuth =
      requireStudent(
        event,
        SESSION_SECRET,
        codeNorm
      );

    if (!studentAuth.ok) {
      return jsonResponse(
        event,
        studentAuth.statusCode,
        {
          ok: false,
          error:
            studentAuth.error,
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }

    try {
      const studentUrl =
        `${SUPABASE_URL}/rest/v1/students` +
        `?select=id` +
        `&code=eq.${encodeURIComponent(codeNorm)}` +
        '&limit=1';

      const students =
        await readJson(
          studentUrl
        );

      if (
        students.length === 0
      ) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error:
              'Student not found',
          },
          {
            'Cache-Control':
              'no-store',
          },
          requestId
        );
      }

      const studentId =
        students[0].id;

      /*
       * Active goal authority stays server-side.
       */
      const goalsUrl =
        `${SUPABASE_URL}/rest/v1/goals` +
        '?select=id,student_id,code,measurement_type,baseline,mastery,target,goal_area,desc,criterion_conflict,class_context' +
        `&student_id=eq.${encodeURIComponent(studentId)}` +
        '&active=eq.true' +
        '&or=(status.is.null,status.not.in.(closed,archived,Closed,Archived))' +
        '&order=code';

      const goalRows =
        await readJson(
          goalsUrl
        );

      /*
       * The pure explanation helper uses goal.objectives to decide
       * whether a parent takes the objective-aware explanation path.
       * Therefore that visibility identity must come from the same
       * active production goal_objectives registry as every other
       * live objective reader.
       */
      const objectiveRegistryRows =
        await readJson(
          `${SUPABASE_URL}${
            buildObjectiveRegistryPath({
              studentId,
            })
          }`
        );

      const objectiveIndex =
        indexObjectiveRegistryRowsByParent(
          objectiveRegistryRows,
          {
            studentCode:
              codeNorm,
          }
        );

      const goals =
        goalRows.map(goal => {
          const objectives =
            getBrowserObjectivesForParent(
              objectiveIndex,
              goal.code,
              codeNorm
            );

          return {
            ...goal,
            student_id:
              studentId,
            student_code:
              codeNorm,
            ...(objectives.length > 0
              ? {
                  objectives,
                }
              : {}),
          };
        });

      /*
       * Parent checkpoints are scoped to the exact authorized quarter.
       *
       * Keep the literal date=gte/date=lte contract visible in this source:
       *   date=gte.${range.start}
       *   date=lte.${range.end}
       */
      const progressUrl =
        `${SUPABASE_URL}/rest/v1/goal_progress` +
        `?student_id=eq.${encodeURIComponent(studentId)}` +
        `&date=gte.${range.start}` +
        `&date=lte.${range.end}` +
        '&order=date.desc,created_at.desc';

      /*
       * Question-level parent evidence uses the identical quarter window.
       *
       *   date=gte.${range.start}
       *   date=lte.${range.end}
       */
      const dataPointsUrl =
        `${SUPABASE_URL}/rest/v1/goal_data_points` +
        `?student_id=eq.${encodeURIComponent(studentId)}` +
        `&date=gte.${range.start}` +
        `&date=lte.${range.end}` +
        '&order=date.desc,created_at.desc';

      const [
        parentProgressRows,
        parentDataPointRows,
      ] =
        await Promise.all([
          readJson(
            progressUrl
          ),
          readJson(
            dataPointsUrl
          ),
        ]);

      /*
       * Assignment-instance state controls two things:
       *
       * 1. non_instructional=true evidence never participates;
       * 2. correct-answer/scoring review is released only for Graded/Reviewed.
       *
       * Fail closed if an assignment-linked evidence row points at an instance
       * that the server cannot resolve.
       */
      const instanceCache =
        new Map();

      async function ensureInstances(
        rows,
      ) {
        const requested =
          uniqueInstanceIds(rows)
            .filter(
              id =>
                !instanceCache
                  .has(id)
            );

        if (
          requested.length === 0
        ) {
          return instanceCache;
        }

        const instanceUrl =
          `${SUPABASE_URL}/rest/v1/assignment_instances` +
          '?select=id,status,settings' +
          '&id=in.(' +
          requested
            .map(
              encodeURIComponent
            )
            .join(',') +
          ')';

        const fetched =
          await readJson(
            instanceUrl
          );

        const fetchedMap =
          instanceMapFrom(
            fetched
          );

        for (
          const id of requested
        ) {
          if (
            !fetchedMap.has(id)
          ) {
            throw new Error(
              'Assignment-instance marker lookup returned an incomplete result'
            );
          }
        }

        for (
          const [
            id,
            instance,
          ] of fetchedMap
        ) {
          instanceCache.set(
            id,
            instance
          );
        }

        return instanceCache;
      }

      await ensureInstances([
        ...parentProgressRows,
        ...parentDataPointRows,
      ]);

      const parentInstructional =
        parentProgressRows.filter(
          row =>
            !row
              ?.assignment_instance_id ||
            instanceCache
              .get(
                String(
                  row
                    .assignment_instance_id
                )
              )
              ?.settings
              ?.non_instructional !==
              true
        );

      const objectiveProgress =
        await readObjectiveProgress({
          parentGoals:
            goals,
          parentProgressRows:
            parentInstructional,
          quarterRange:
            range,

          /*
           * Crucial 5C3 safety boundary:
           * this runs BEFORE 5C1 removes assignment-instance provenance.
           */
          evidenceRowsTransform:
            async rows => {
              await ensureInstances(
                rows
              );

              return transformObjectiveEvidence(
                rows,
                instanceCache
              );
            },

          fetchImpl:
            global.fetch,
          supabaseUrl:
            SUPABASE_URL,
          serviceRoleKey:
            SUPABASE_SERVICE_ROLE_KEY,
        });

      const bundle =
        buildStudentGoalExplanationBundle({
          quarterRange:
            range,
          goals,
          parentProgressRows,
          parentDataPointRows,
          assignmentInstances:
            Array.from(
              instanceCache.values()
            ),
          objectiveProgress,
        });

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          ...bundle,
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    } catch (error) {
      console.error(
        `[student-goal-explanations] [${requestId}]`,
        error
      );

      /*
       * 5C3B will treat unavailable as progressive enhancement failure:
       * existing Student Portal goals remain usable.
       */
      return jsonResponse(
        event,
        200,
        {
          ok: true,
          available: false,
          reason:
            'query_failed',
          goals: [],
        },
        {
          'Cache-Control':
            'no-store',
        },
        requestId
      );
    }
  };
