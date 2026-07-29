'use strict';

// Teacher Work assignment-specific instance reader.
//
// Security boundary:
//   signed teacherId
//     -> requested assignment.class_id
//     -> class owned by that exact teacher
//     -> active enrollment in that same class
//     -> assignment instance
//
// Response shape is intentionally preserved for tc-work.js.

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
  SESSION_SECRET,
} = process.env;

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

    console.log(
      `[teacher-assignment-instances] [${requestId}] ` +
      `Request received: ${event.httpMethod}`
    );

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

    const authResult =
      requireTeacher(
        event,
        SESSION_SECRET
      );

    if (!authResult.ok) {
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
      authResult.user &&
      authResult.user.teacherId;

    if (!isUuid(teacherId)) {
      console.warn(
        `[teacher-assignment-instances] [${requestId}] ` +
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

    const assignmentIdStr =
      String(
        params.assignment_id || ''
      ).trim();

    if (!assignmentIdStr) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'assignment_id query parameter is required',
        },
        {},
        requestId
      );
    }

    // Preserve the legacy assignment-id acceptance contract.
    if (!/^\d+$/.test(assignmentIdStr)) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error: 'assignment_id must be a positive integer',
        },
        {},
        requestId
      );
    }

    try {
      // 1. Resolve the requested assignment through canonical class_id.
      const assignmentRows =
        await readRows(
          await rest(
            '/rest/v1/assignments' +
            '?select=id,class_id' +
            `&id=eq.${encodeURIComponent(assignmentIdStr)}` +
            '&limit=1'
          ),
          'Assignment authorization query'
        );

      if (assignmentRows.length === 0) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: `Assignment ${assignmentIdStr} not found`,
          },
          {
            'Cache-Control': 'no-store',
          },
          requestId
        );
      }

      const assignment =
        assignmentRows[0];

      const classId =
        assignment &&
        assignment.class_id;

      if (!isUuid(classId)) {
        return jsonResponse(
          event,
          403,
          {
            ok: false,
            error: 'Assignment does not belong to your class',
          },
          {
            'Cache-Control': 'no-store',
          },
          requestId
        );
      }

      // 2. The canonical class must belong to this exact signed teacher.
      const classRows =
        await readRows(
          await rest(
            '/rest/v1/classes' +
            '?select=id' +
            `&id=eq.${encodeURIComponent(classId)}` +
            `&teacher_id=eq.${encodeURIComponent(teacherId)}` +
            '&limit=1'
          ),
          'Class ownership authorization query'
        );

      if (classRows.length === 0) {
        return jsonResponse(
          event,
          403,
          {
            ok: false,
            error: 'Assignment does not belong to your class',
          },
          {
            'Cache-Control': 'no-store',
          },
          requestId
        );
      }

      // 3. Resolve active students in that SAME class.
      const enrollmentRows =
        await readRows(
          await rest(
            '/rest/v1/class_enrollments' +
            '?select=student_id,active' +
            `&class_id=eq.${encodeURIComponent(classId)}` +
            '&active=eq.true'
          ),
          'Class enrollment authorization query'
        );

      const activeStudentIds =
        new Set(
          enrollmentRows
            .filter(
              (row) =>
                row &&
                row.active !== false &&
                isUuid(row.student_id)
            )
            .map(
              (row) =>
                row.student_id
            )
        );

      if (activeStudentIds.size === 0) {
        return emptyResponse(
          event,
          requestId
        );
      }

      // 4. Read the requested assignment's instances.
      // Final filtering below enforces active same-class enrollment.
      const instanceRows =
        await readRows(
          await rest(
            '/rest/v1/assignment_instances' +
            '?select=id,student_id,status,assigned_at,students(code,name)' +
            `&assignment_id=eq.${encodeURIComponent(assignmentIdStr)}` +
            '&order=students(code).asc'
          ),
          'Assignment instances query'
        );

      const instances =
        [];

      for (const row of instanceRows) {
        if (
          !row ||
          !activeStudentIds.has(
            row.student_id
          )
        ) {
          continue;
        }

        const student =
          normalizeNested(
            row.students
          );

        // Preserve the Work modal's established response/fallback contract.
        instances.push({
          instance_id:
            row.id,
          student_id:
            row.student_id,
          student_code:
            (student && student.code) || '',
          student_name:
            (student && student.name) ||
            (student && student.code) ||
            '',
          status:
            row.status || 'Assigned',
          assigned_at:
            row.assigned_at || null,
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
        `[teacher-assignment-instances] [${requestId}]`,
        err
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            err.message ||
            'Failed to fetch assignment instances',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }
  };
