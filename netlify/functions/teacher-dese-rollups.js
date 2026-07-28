'use strict';

// Teacher-only DESE standards rollup endpoint.
//
// GET /.netlify/functions/teacher-dese-rollups
//   Returns rollups for active students enrolled in classes owned by the
//   authenticated teacher.
//
// GET /.netlify/functions/teacher-dese-rollups?student_code=S001
//   Returns rollups only when that student is actively enrolled in one of
//   the authenticated teacher's classes.
//
// School year is resolved server-side using getOperationalSchoolYear().
// The browser is not permitted to choose the school year.

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
  rpc,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = require('./_lib/supa');

const {
  getOperationalSchoolYear,
} = require('./_lib/school-year');

const {
  SESSION_SECRET,
} = process.env;

const MAX_RPC_CONCURRENCY = 6;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

function normalizeStudentCode(value) {
  const code = String(value || '').trim();

  if (!code) return '';

  if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) {
    return null;
  }

  return code;
}

async function readJson(response, label) {
  if (!response || response.ok !== true) {
    const status =
      response && Number.isInteger(response.status)
        ? response.status
        : 0;

    let detail = '';

    if (response && typeof response.text === 'function') {
      detail = await response
        .text()
        .catch(() => '');
    }

    throw new Error(
      `${label} failed: ${status}` +
      (detail ? ` ${detail.slice(0, 160)}` : '')
    );
  }

  const body = await response.json();

  return Array.isArray(body)
    ? body
    : [];
}

async function fetchOwnedStudents(teacherId) {
  const classesResponse =
    await rest(
      '/rest/v1/classes' +
      '?select=id' +
      `&teacher_id=eq.${encodeURIComponent(teacherId)}`
    );

  const classes =
    await readJson(
      classesResponse,
      'Teacher classes query'
    );

  const classIds =
    [
      ...new Set(
        classes
          .map((row) => row && row.id)
          .filter(isUuid)
      ),
    ];

  if (classIds.length === 0) {
    return [];
  }

  const enrollmentResponse =
    await rest(
      '/rest/v1/class_enrollments' +
      '?select=student_id,active,students!inner(id,code,active)' +
      '&active=eq.true' +
      `&class_id=in.(${classIds.map(encodeURIComponent).join(',')})`
    );

  const enrollments =
    await readJson(
      enrollmentResponse,
      'Teacher enrollments query'
    );

  const studentsById =
    new Map();

  for (const enrollment of enrollments) {
    if (!enrollment || enrollment.active === false) {
      continue;
    }

    const nested =
      Array.isArray(enrollment.students)
        ? enrollment.students[0]
        : enrollment.students;

    if (
      !nested ||
      !isUuid(nested.id) ||
      !nested.code ||
      nested.active === false
    ) {
      continue;
    }

    if (!studentsById.has(nested.id)) {
      studentsById.set(
        nested.id,
        {
          id: nested.id,
          code: String(nested.code),
        }
      );
    }
  }

  return [...studentsById.values()];
}

async function fetchStudentRollups(
  student,
  schoolYear
) {
  const response =
    await rpc(
      'student_dese_rollups',
      {
        p_student_id: student.id,
        p_school_year: schoolYear,
      }
    );

  const rows =
    await readJson(
      response,
      'Student DESE rollup query'
    );

  return rows.map((row) => ({
    student_id: student.id,
    student_code: student.code,
    dese_code: row.dese_code,
    percent_correct: row.percent_correct,
    total_earned: row.total_earned,
    total_possible: row.total_possible,
    item_count: row.item_count,
  }));
}

async function mapWithConcurrency(
  items,
  limit,
  worker
) {
  if (items.length === 0) {
    return [];
  }

  const results =
    new Array(items.length);

  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] =
        await worker(
          items[index],
          index
        );
    }
  }

  const workerCount =
    Math.min(
      limit,
      items.length
    );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => runWorker()
    )
  );

  return results;
}

exports.handler = async (event) => {
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
      {
        'Cache-Control': 'no-store',
      },
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
      `[teacher-dese-rollups] [${requestId}] ` +
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

  const studentCode =
    normalizeStudentCode(
      params.student_code
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

  try {
    const schoolYear =
      getOperationalSchoolYear();

    const ownedStudents =
      await fetchOwnedStudents(
        teacherId
      );

    if (studentCode) {
      const student =
        ownedStudents.find(
          (candidate) =>
            candidate.code === studentCode
        );

      if (!student) {
        return jsonResponse(
          event,
          404,
          {
            ok: false,
            error: 'Student not available',
          },
          {
            'Cache-Control': 'no-store',
          },
          requestId
        );
      }

      const rows =
        await fetchStudentRollups(
          student,
          schoolYear
        );

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          school_year: schoolYear,
          rows,
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    const groupedRows =
      await mapWithConcurrency(
        ownedStudents,
        MAX_RPC_CONCURRENCY,
        (student) =>
          fetchStudentRollups(
            student,
            schoolYear
          )
      );

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        school_year: schoolYear,
        rows: groupedRows.flat(),
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  } catch (error) {
    console.error(
      `[teacher-dese-rollups] [${requestId}] Error:`,
      error
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: 'Unable to load DESE rollups',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }
};
