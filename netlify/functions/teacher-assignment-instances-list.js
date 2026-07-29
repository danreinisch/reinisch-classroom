'use strict';

// Signed Teacher Center shared assignment-instance reader.
//
// Security boundary:
//   signed teacherId
//     -> teacher-owned class
//     -> assignment in that class
//     -> assignment instance
//     -> active enrollment of that student in that SAME class
//
// This endpoint intentionally does not use legacy is_teacher_of(),
// lookupActiveTeacherId(), assignment.series, or fail-open ownership logic.
//
// It is separate from teacher-assignment-instances.js, which remains the
// existing assignment-specific Work endpoint and is not modified by T2.

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
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = require('./_lib/supa');

const {
  getCurrentSchoolYear,
} = require('./_lib/school-year');

const {
  SESSION_SECRET,
} = process.env;

const MAX_INSTANCES_QUERY_LIMIT = 5000;

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

async function readRows(response, label) {
  if (!response.ok) {
    const detail =
      await response
        .text()
        .catch(() => '');

    throw new Error(
      `${label} failed: ${response.status}` +
      (detail
        ? ` ${detail.slice(0, 160)}`
        : '')
    );
  }

  const body =
    await response.json();

  return Array.isArray(body)
    ? body
    : [];
}

function normalizeNested(value) {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function emptyResponse(event, requestId) {
  return jsonResponse(
    event,
    200,
    {
      ok: true,
      instances: [],
    },
    {
      'Cache-Control': 'no-store',
    },
    requestId
  );
}

exports.handler =
  async (event) => {
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
        {},
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
        {
          'Cache-Control': 'no-store',
        },
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
        {
          'Cache-Control': 'no-store',
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
        503,
        {
          ok: false,
          error: 'Service unavailable',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    const teacherId =
      teacherAuth.user &&
      teacherAuth.user.teacherId;

    if (!isUuid(teacherId)) {
      console.warn(
        `[teacher-assignment-instances-list] [${requestId}] ` +
        'Verified teacher session has no usable teacherId'
      );

      return jsonResponse(
        event,
        403,
        {
          ok: false,
          error: 'Teacher identity unavailable',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    try {
      const schoolYear =
        getCurrentSchoolYear();

      // 1. Resolve classes owned by this exact signed teacher.
      const classes =
        await readRows(
          await rest(
            '/rest/v1/classes' +
            '?select=id' +
            `&teacher_id=eq.${encodeURIComponent(teacherId)}`
          ),
          'Teacher classes query'
        );

      const classIds =
        [
          ...new Set(
            classes
              .map((row) =>
                row && row.id
              )
              .filter(isUuid)
          ),
        ];

      if (classIds.length === 0) {
        return emptyResponse(
          event,
          requestId
        );
      }

      const classIdSet =
        new Set(classIds);

      // 2. Resolve assignments attached to those canonical classes.
      const assignments =
        await readRows(
          await rest(
            '/rest/v1/assignments' +
            '?select=id,class_id' +
            `&class_id=in.(${classIds.map(encodeURIComponent).join(',')})`
          ),
          'Teacher assignments query'
        );

      const assignmentClassById =
        new Map();

      for (const row of assignments) {
        const assignmentId =
          row &&
          String(row.id || '').trim();

        const classId =
          row &&
          row.class_id;

        if (
          /^\d+$/.test(assignmentId) &&
          isUuid(classId) &&
          classIdSet.has(classId)
        ) {
          assignmentClassById.set(
            assignmentId,
            classId
          );
        }
      }

      if (
        assignmentClassById.size === 0
      ) {
        return emptyResponse(
          event,
          requestId
        );
      }

      // 3. Resolve active enrollments for those same classes.
      const enrollments =
        await readRows(
          await rest(
            '/rest/v1/class_enrollments' +
            '?select=class_id,student_id,active' +
            '&active=eq.true' +
            `&class_id=in.(${classIds.map(encodeURIComponent).join(',')})`
          ),
          'Teacher enrollments query'
        );

      const activeEnrollmentPairs =
        new Set();

      for (const row of enrollments) {
        if (
          !row ||
          row.active === false ||
          !isUuid(row.class_id) ||
          !isUuid(row.student_id)
        ) {
          continue;
        }

        if (
          classIdSet.has(row.class_id)
        ) {
          activeEnrollmentPairs.add(
            `${row.class_id}:${row.student_id}`
          );
        }
      }

      if (
        activeEnrollmentPairs.size === 0
      ) {
        return emptyResponse(
          event,
          requestId
        );
      }

      const assignmentIds =
        [...assignmentClassById.keys()];

      // 4. Read current-school-year instances for owned assignments.
      // Preserve the legacy shared-reader current-year/NULL contract.
      const rows =
        await readRows(
          await rest(
            '/rest/v1/assignment_instances' +
            '?select=id,assignment_id,student_id,assigned_at,due_at,status,settings,school_year,students!inner(code,name)' +
            `&assignment_id=in.(${assignmentIds.map(encodeURIComponent).join(',')})` +
            `&or=(school_year.eq.${schoolYear},school_year.is.null)` +
            `&limit=${MAX_INSTANCES_QUERY_LIMIT}`
          ),
          'Teacher assignment instances query'
        );

      const instances = [];

      for (const row of rows) {
        if (
          !row ||
          !isUuid(row.id) ||
          !isUuid(row.student_id)
        ) {
          continue;
        }

        const assignmentId =
          String(
            row.assignment_id || ''
          ).trim();

        const classId =
          assignmentClassById.get(
            assignmentId
          );

        if (!classId) {
          continue;
        }

        if (
          !activeEnrollmentPairs.has(
            `${classId}:${row.student_id}`
          )
        ) {
          continue;
        }

        const student =
          normalizeNested(
            row.students
          );

        if (
          !student ||
          !student.code
        ) {
          continue;
        }

        if (
          row.settings &&
          row.settings.non_instructional === true
        ) {
          continue;
        }

        instances.push({
          id:
            row.id,
          assignment_id:
            row.assignment_id,
          student_id:
            row.student_id,
          student_code:
            student.code,
          student_name:
            student.name,
          assigned_at:
            row.assigned_at,
          due_at:
            row.due_at,
          status:
            row.status,
          settings:
            row.settings,
          school_year:
            row.school_year,
        });
      }

      instances.sort(
        (a, b) =>
          (a.student_code || '')
            .localeCompare(
              b.student_code || ''
            )
      );

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          instances,
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    } catch (err) {
      console.error(
        `[teacher-assignment-instances-list] [${requestId}]`,
        err
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error: 'Failed to fetch teacher assignment instances',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }
  };
