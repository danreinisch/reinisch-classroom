'use strict';

// Signed Teacher Center submission reader.
//
// Security boundary:
//   signed teacherId
//     -> teacher-owned class
//     -> assignment in that class
//     -> assignment instance
//     -> active enrollment of that student in that SAME class
//     -> submission
//
// This endpoint intentionally does not use legacy is_teacher_of(),
// lookupActiveTeacherId(), assignment.series, or fail-open ownership logic.

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

const MAX_SUBMISSIONS_QUERY_LIMIT = 5000;

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function normalizeStudentCode(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return '';
  }

  const normalized =
    String(value)
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z0-9_-]{1,64}$/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function normalizeExcludeFinalized(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return false;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    normalized === 'true' ||
    normalized === '1'
  ) {
    return true;
  }

  if (
    normalized === 'false' ||
    normalized === '0'
  ) {
    return false;
  }

  return null;
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

function isManualGradeAssignment(row) {
  const meta =
    row &&
    row.meta &&
    typeof row.meta === 'object' &&
    !Array.isArray(row.meta)
      ? row.meta
      : {};

  return meta.manual === true;
}

function emptyResponse(event, requestId) {
  return jsonResponse(
    event,
    200,
    {
      ok: true,
      submissions: [],
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
        `[teacher-submissions] [${requestId}] ` +
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

    const params =
      event.queryStringParameters || {};

    // Support both spellings during migration because existing
    // Teacher Center consumers currently use both.
    const rawStudentCode =
      params.student_code !== undefined
        ? params.student_code
        : params.studentCode;

    const studentCode =
      normalizeStudentCode(
        rawStudentCode
      );

    if (studentCode === null) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Invalid student_code',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    const instanceId =
      params.instance_id
        ? String(params.instance_id).trim()
        : '';

    if (
      instanceId &&
      !isUuid(instanceId)
    ) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Invalid instance_id',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    const excludeFinalized =
      normalizeExcludeFinalized(
        params.exclude_finalized
      );

    if (excludeFinalized === null) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'Invalid exclude_finalized',
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

      // 1. Classes owned by this exact signed teacher.
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

      // 2. Assignments attached to those owned classes.
      const assignments =
        await readRows(
          await rest(
            '/rest/v1/assignments' +
            '?select=id,class_id,meta' +
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
          classIdSet.has(classId) &&
          !isManualGradeAssignment(row)
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

      // 3. Active enrollments in those same classes.
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

      // 4. Candidate instances for owned assignments in the same
      // school-year contract used by the legacy browser reader.
      const instances =
        await readRows(
          await rest(
            '/rest/v1/assignment_instances' +
            '?select=id,assignment_id,student_id,settings,students!inner(code,active)' +
            `&assignment_id=in.(${assignmentIds.map(encodeURIComponent).join(',')})` +
            `&or=(school_year.eq.${schoolYear},school_year.is.null)`
          ),
          'Teacher assignment instances query'
        );

      const authorizedInstances =
        new Map();

      for (const row of instances) {
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
          !student.code ||
          student.active === false
        ) {
          continue;
        }

        if (
          row.settings &&
          row.settings.non_instructional === true
        ) {
          continue;
        }

        const code =
          String(student.code)
            .trim()
            .toUpperCase();

        if (
          studentCode &&
          code !== studentCode
        ) {
          continue;
        }

        if (
          instanceId &&
          row.id !== instanceId
        ) {
          continue;
        }

        authorizedInstances.set(
          row.id,
          {
            id: row.id,
            assignment_id:
              row.assignment_id,
            student_id:
              row.student_id,
            settings:
              row.settings || {},
            students: {
              code:
                String(student.code),
            },
          }
        );
      }

      if (
        authorizedInstances.size === 0
      ) {
        return emptyResponse(
          event,
          requestId
        );
      }

      const instanceIds =
        [...authorizedInstances.keys()];

      let submissionsPath =
        '/rest/v1/submissions' +
        '?select=*' +
        `&instance_id=in.(${instanceIds.map(encodeURIComponent).join(',')})` +
        `&or=(school_year.eq.${schoolYear},school_year.is.null)` +
        '&order=submitted_at.desc' +
        `&limit=${MAX_SUBMISSIONS_QUERY_LIMIT}`;

      if (excludeFinalized) {
        submissionsPath +=
          '&review_status=neq.finalized';
      }

      const submissionRows =
        await readRows(
          await rest(
            submissionsPath
          ),
          'Teacher submissions query'
        );

      // Defense in depth: never trust the query filter alone.
      const submissions =
        submissionRows
          .filter((submission) =>
            submission &&
            authorizedInstances.has(
              submission.instance_id
            )
          )
          .map((submission) => ({
            ...submission,
            assignment_instances:
              authorizedInstances.get(
                submission.instance_id
              ),
          }));

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          submissions,
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    } catch (err) {
      console.error(
        `[teacher-submissions] [${requestId}]`,
        err
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error: 'Failed to fetch teacher submissions',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }
  };
