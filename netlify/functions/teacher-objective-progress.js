'use strict';

/**
 * Slice 5C2 — Teacher Center objective-progress reader.
 *
 * GET /.netlify/functions/teacher-objective-progress
 *
 * Browser supplies:
 *   student_code
 *   quarter
 *   start
 *   end
 *
 * The browser supplies only the quarter calculation window produced by
 * Teacher Center quarter-utils.js. Parent progress fallback remains
 * authoritative server-side data.
 *
 * This endpoint does not calculate child-objective percentages itself.
 * Slice 5C1 remains the sole normalized objective progress/evidence reader.
 */

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  rest,
  jsonRes,
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  buildObjectiveRegistryPath,
  indexObjectiveRegistryRowsByParent,
  getBrowserObjectivesForParent,
} = require('./_lib/goal-objective-registry-reader');

const {
  readObjectiveProgress,
} = require('./_lib/objective-progress-reader');

const {
  SESSION_SECRET,
} = process.env;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const STUDENT_CODE_PATTERN =
  /^S\d{3}$/;

const QUARTERS =
  new Set([
    'Q1',
    'Q2',
    'Q3',
    'Q4',
  ]);

function normalizeStudentCode(value) {
  const normalized =
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : '';

  return STUDENT_CODE_PATTERN.test(normalized)
    ? normalized
    : null;
}

function normalizeQuarter(value) {
  const normalized =
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : '';

  return QUARTERS.has(normalized)
    ? normalized
    : null;
}

function normalizeDate(value) {
  const normalized =
    typeof value === 'string'
      ? value.trim()
      : '';

  return DATE_PATTERN.test(normalized)
    ? normalized
    : null;
}

async function readRows(
  path,
  label,
) {
  const response =
    await rest(
      path,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }
    );

  const result =
    await jsonRes(response);

  if (!result.ok) {
    throw new Error(
      `${label} failed with status ${result.status}`
    );
  }

  return Array.isArray(result.data)
    ? result.data
    : [];
}

function parentIdFilter(parents) {
  return parents
    .map(parent =>
      parent && parent.id
    )
    .filter(Boolean)
    .map(id =>
      encodeURIComponent(id)
    )
    .join(',');
}

async function filterInstructionalParentProgress(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const instanceIds = [
    ...new Set(
      safeRows
        .map(row =>
          row &&
          row.assignment_instance_id
        )
        .filter(Boolean)
    ),
  ];

  if (instanceIds.length === 0) {
    return safeRows;
  }

  const encodedIds =
    instanceIds
      .map(id =>
        encodeURIComponent(id)
      )
      .join(',');

  const instances =
    await readRows(
      '/rest/v1/assignment_instances' +
        '?select=id,settings' +
        `&id=in.(${encodedIds})`,
      'Assignment marker query'
    );

  const nonInstructionalIds =
    new Set(
      instances
        .filter(row =>
          row &&
          row.settings &&
          row.settings.non_instructional === true
        )
        .map(row =>
          row.id
        )
    );

  return safeRows.filter(row =>
    !row ||
    !row.assignment_instance_id ||
    !nonInstructionalIds.has(
      row.assignment_instance_id
    )
  );
}

function successfulEmptyResponse(
  event,
  requestId,
  quarter,
  start,
  end,
) {
  return jsonResponse(
    event,
    200,
    {
      ok: true,
      available: true,
      quarter,
      range: {
        start,
        end,
      },
      parents: [],
    },
    NO_STORE_HEADERS,
    requestId
  );
}

exports.handler =
  async function handler(event) {
    const requestId =
      generateRequestId();

    if (event.httpMethod === 'OPTIONS') {
      return handleCorsPreFlight(
        event,
        ['GET', 'OPTIONS'],
        ['Content-Type']
      );
    }

    if (event.httpMethod !== 'GET') {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error: 'Method Not Allowed',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    if (!SESSION_SECRET) {
      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error: 'Server not configured',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    const teacherAuth =
      requireTeacher(
        event,
        SESSION_SECRET
      );

    if (!teacherAuth.ok) {
      return jsonResponse(
        event,
        401,
        {
          ok: false,
          error: 'Unauthorized',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    const {
      url: supabaseUrl,
      key: serviceRoleKey,
    } = getSupabaseConfig();

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error: 'Service unavailable',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    const params =
      event.queryStringParameters || {};

    const student_code =
      normalizeStudentCode(
        params.student_code
      );

    const quarter =
      normalizeQuarter(
        params.quarter
      );

    const start =
      normalizeDate(
        params.start
      );

    const end =
      normalizeDate(
        params.end
      );

    if (
      !student_code ||
      !quarter ||
      !start ||
      !end ||
      start > end
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Invalid objective-progress request',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }

    try {
      /*
       * Preserve the existing Teacher Center signed-roster access model:
       * a valid Teacher Center session may read the active student/goal
       * records already visible through teacher-roster-context.
       */
      const students =
        await readRows(
          '/rest/v1/students' +
            '?select=id,code,active,archived_at' +
            `&code=eq.${encodeURIComponent(student_code)}` +
            '&active=eq.true' +
            '&archived_at=is.null' +
            '&limit=1',
          'Student query'
        );

      if (students.length === 0) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: 'Student not found',
          },
          NO_STORE_HEADERS,
          requestId
        );
      }

      const student =
        students[0];

      const goals =
        await readRows(
          '/rest/v1/goals' +
            '?select=id,student_id,code,status' +
            `&student_id=eq.${encodeURIComponent(student.id)}` +
            '&active=eq.true' +
            '&or=(status.is.null,' +
              'status.not.in.(closed,archived,Closed,Archived))' +
            '&order=code.asc',
          'Goal query'
        );

      /*
       * Candidate parent identity comes from the same active
       * production goal_objectives registry used by the shared
       * objective-progress reader. This prevents newly imported
       * objectives from being hidden by the retired 35-row catalog.
       */
      const objectiveRegistryRows =
        await readRows(
          buildObjectiveRegistryPath({
            studentId:
              student.id,
          }),
          'Objective registry candidate query'
        );

      const objectiveIndex =
        indexObjectiveRegistryRowsByParent(
          objectiveRegistryRows,
          {
            studentCode:
              student_code,
          }
        );

      const candidateParents =
        goals
          .filter(goal => {
            const objectives =
              getBrowserObjectivesForParent(
                objectiveIndex,
                goal.code,
                student_code
              );

            return objectives.length > 0;
          })
          .map(goal => ({
            id: goal.id,
            student_id:
              goal.student_id,
            student_code,
            code:
              goal.code,
          }));

      /*
       * Live-registry no-objective student:
       * no parent fallback or objective-evidence fanout is needed.
       */
      if (candidateParents.length === 0) {
        return successfulEmptyResponse(
          event,
          requestId,
          quarter,
          start,
          end
        );
      }

      const parentIds =
        parentIdFilter(
          candidateParents
        );

      const parentRowsRaw =
        await readRows(
          '/rest/v1/goal_progress' +
            '?select=id,goal_id,student_id,' +
              'assignment_instance_id,date,value,created_at' +
            `&student_id=eq.${encodeURIComponent(student.id)}` +
            `&goal_id=in.(${parentIds})` +
            `&date=gte.${encodeURIComponent(start)}` +
            `&date=lte.${encodeURIComponent(end)}` +
            '&order=date.desc,created_at.desc',
          'Parent progress query'
        );

      const parentProgressRows =
        await filterInstructionalParentProgress(
          parentRowsRaw
        );

      const result =
        await readObjectiveProgress({
          parentGoals:
            candidateParents,
          parentProgressRows,
          quarterRange: {
            quarter,
            start,
            end,
          },
          fetchImpl:
            global.fetch,
          supabaseUrl,
          serviceRoleKey,
        });

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          quarter,
          range: {
            start,
            end,
          },
          ...result,
        },
        NO_STORE_HEADERS,
        requestId
      );
    } catch (error) {
      console.error(
        `[teacher-objective-progress] [${requestId}]`,
        error
      );

      return jsonResponse(
        event,
        503,
        {
          ok: false,
          error: 'Objective progress unavailable',
        },
        NO_STORE_HEADERS,
        requestId
      );
    }
  };
