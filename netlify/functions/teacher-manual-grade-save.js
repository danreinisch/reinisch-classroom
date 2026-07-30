'use strict';

// Signed Teacher Center boundary for Gradebook "Add Manual Assignment".
//
// One request creates:
//   one canonical teacher-owned assignment
//   one canonical assignment instance per selected student
//   one reviewed grade submission per selected student
//
// MANUAL grades are teacher-entered results, not digital student work.
//
// Explicitly forbidden:
//   - browser-supplied assignment IDs
//   - MANUAL_* pseudo IDs
//   - process_submission
//   - goal_progress writes
//   - class-name authorization outside the signed teacher
//   - inactive students or cross-class students

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

const MAX_BODY_BYTES = 65536;
const MAX_TITLE_LENGTH = 500;
const MAX_CLASS_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 5000;
const MAX_STUDENT_CODES = 100;

const CATEGORIES = new Set([
  'assignment',
  'homework',
  'classwork',
  'quiz',
  'test',
  'project',
  'participation',
]);

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function cleanText(value, maxLength, required = false) {
  if (value === undefined || value === null) {
    return required ? null : '';
  }

  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();

  if (
    (required && !text) ||
    text.length > maxLength
  ) {
    return null;
  }

  return text;
}

function cleanStudentCodes(value) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_STUDENT_CODES
  ) {
    return null;
  }

  const unique = [];
  const seen = new Set();

  for (const raw of value) {
    if (typeof raw !== 'string') {
      return null;
    }

    const code = raw.trim().toUpperCase();

    if (
      !code ||
      code.length > 64 ||
      !/^[A-Z0-9_-]+$/.test(code)
    ) {
      return null;
    }

    if (!seen.has(code)) {
      seen.add(code);
      unique.push(code);
    }
  }

  return unique.length > 0
    ? unique
    : null;
}

function cleanPositiveNumber(value) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number > 0
  )
    ? number
    : null;
}

function cleanNonNegativeNumber(value) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number >= 0
  )
    ? number
    : null;
}

function cleanDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return null;
  }

  const parsed =
    Date.parse(`${value}T12:00:00.000Z`);

  return Number.isFinite(parsed)
    ? value
    : null;
}

function recordedAt(date) {
  return `${date}T12:00:00.000Z`;
}

function fail(
  event,
  requestId,
  statusCode,
  error
) {
  return jsonResponse(
    event,
    statusCode,
    {
      ok: false,
      error,
    },
    {
      'Cache-Control': 'no-store',
    },
    requestId
  );
}

async function readRows(
  restResponse,
  label
) {
  if (
    !restResponse ||
    restResponse.ok !== true
  ) {
    const status =
      restResponse &&
      Number.isInteger(restResponse.status)
        ? restResponse.status
        : 0;

    const detail =
      restResponse &&
      typeof restResponse.text === 'function'
        ? await restResponse
            .text()
            .catch(() => '')
        : '';

    throw new Error(
      `${label} failed: ${status}` +
      (
        detail
          ? ` ${detail.slice(0, 160)}`
          : ''
      )
    );
  }

  const body =
    await restResponse
      .json()
      .catch(() => []);

  return Array.isArray(body)
    ? body
    : [];
}

async function cleanupNewAssignment(
  assignmentId
) {
  if (
    assignmentId === null ||
    assignmentId === undefined
  ) {
    return;
  }

  const cleanup =
    await rest(
      '/rest/v1/assignments' +
      `?id=eq.${encodeURIComponent(assignmentId)}`,
      {
        method: 'DELETE',
      }
    );

  if (
    !cleanup ||
    cleanup.ok !== true
  ) {
    console.error(
      '[teacher-manual-grade-save] rollback cleanup failed for newly-created assignment'
    );
  }
}

exports.handler = async (event) => {
  const requestId =
    generateRequestId();

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['POST', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (event.httpMethod !== 'POST') {
    return fail(
      event,
      requestId,
      405,
      'Method Not Allowed'
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SESSION_SECRET
  ) {
    return fail(
      event,
      requestId,
      503,
      'Service unavailable'
    );
  }

  const teacherAuth =
    requireTeacher(
      event,
      SESSION_SECRET
    );

  if (!teacherAuth.ok) {
    return fail(
      event,
      requestId,
      teacherAuth.statusCode || 401,
      teacherAuth.error || 'Unauthorized'
    );
  }

  const teacherId =
    teacherAuth.user &&
    teacherAuth.user.teacherId;

  if (!isUuid(teacherId)) {
    return fail(
      event,
      requestId,
      401,
      'Unauthorized'
    );
  }

  const rawBody =
    typeof event.body === 'string'
      ? event.body
      : '';

  if (
    Buffer.byteLength(
      rawBody,
      'utf8'
    ) > MAX_BODY_BYTES
  ) {
    return fail(
      event,
      requestId,
      413,
      'Request body too large'
    );
  }

  let body;

  try {
    body =
      JSON.parse(
        rawBody || '{}'
      );
  } catch {
    return fail(
      event,
      requestId,
      400,
      'Invalid JSON'
    );
  }

  const title =
    cleanText(
      body.title,
      MAX_TITLE_LENGTH,
      true
    );

  const className =
    cleanText(
      body.className,
      MAX_CLASS_NAME_LENGTH,
      true
    );

  const studentCodes =
    cleanStudentCodes(
      body.studentCodes
    );

  const totalPossible =
    cleanPositiveNumber(
      body.totalPossible
    );

  const scoreEarned =
    cleanNonNegativeNumber(
      body.scoreEarned
    );

  const date =
    cleanDate(
      body.date
    );

  const category =
    typeof body.category === 'string'
      ? body.category.trim().toLowerCase()
      : 'assignment';

  const notes =
    cleanText(
      body.notes,
      MAX_NOTES_LENGTH,
      false
    );

  if (!title) {
    return fail(
      event,
      requestId,
      400,
      'Invalid title'
    );
  }

  if (!className) {
    return fail(
      event,
      requestId,
      400,
      'Invalid className'
    );
  }

  if (!studentCodes) {
    return fail(
      event,
      requestId,
      400,
      'Invalid studentCodes'
    );
  }

  if (totalPossible === null) {
    return fail(
      event,
      requestId,
      400,
      'Invalid totalPossible'
    );
  }

  if (
    scoreEarned === null ||
    scoreEarned > totalPossible
  ) {
    return fail(
      event,
      requestId,
      400,
      'Invalid scoreEarned'
    );
  }

  if (!date) {
    return fail(
      event,
      requestId,
      400,
      'Invalid date'
    );
  }

  if (!CATEGORIES.has(category)) {
    return fail(
      event,
      requestId,
      400,
      'Invalid category'
    );
  }

  if (notes === null) {
    return fail(
      event,
      requestId,
      400,
      'Invalid notes'
    );
  }

  const schoolYear =
    getCurrentSchoolYear();

  const scorePercent =
    Math.round(
      (scoreEarned / totalPossible) * 100
    );

  let createdAssignmentId = null;

  try {
    // 1. Resolve exactly one class owned by the signed teacher.
    const ownedClasses =
      await readRows(
        await rest(
          '/rest/v1/classes' +
          '?select=id,name,teacher_id' +
          `&name=eq.${encodeURIComponent(className)}` +
          `&teacher_id=eq.${encodeURIComponent(teacherId)}` +
          '&limit=2'
        ),
        'Owned class query'
      );

    if (
      ownedClasses.length !== 1 ||
      !isUuid(
        ownedClasses[0].id
      )
    ) {
      return fail(
        event,
        requestId,
        404,
        'Class not found'
      );
    }

    const classId =
      ownedClasses[0].id;

    // 2. Validate EVERY requested student before performing any writes.
    const validatedStudents = [];

    for (const studentCode of studentCodes) {
      const students =
        await readRows(
          await rest(
            '/rest/v1/students' +
            '?select=id,code,active' +
            `&code=eq.${encodeURIComponent(studentCode)}` +
            '&active=eq.true' +
            '&limit=2'
          ),
          'Student query'
        );

      if (
        students.length !== 1 ||
        !isUuid(
          students[0].id
        )
      ) {
        return fail(
          event,
          requestId,
          404,
          'Student not found'
        );
      }

      const student =
        students[0];

      const enrollments =
        await readRows(
          await rest(
            '/rest/v1/class_enrollments' +
            '?select=class_id,student_id,active' +
            `&class_id=eq.${encodeURIComponent(classId)}` +
            `&student_id=eq.${encodeURIComponent(student.id)}` +
            '&active=eq.true' +
            '&limit=1'
          ),
          'Class enrollment query'
        );

      if (enrollments.length !== 1) {
        return fail(
          event,
          requestId,
          404,
          'Student not found'
        );
      }

      validatedStudents.push({
        id: student.id,
        code: studentCode,
      });
    }

    // 3. Create ONE canonical MANUAL assignment.
    const assignmentRows =
      await readRows(
        await rest(
          '/rest/v1/assignments',
          {
            method: 'POST',
            headers: {
              Prefer:
                'return=representation',
            },
            body: JSON.stringify({
              title,
              type: 'html',
              series: className,
              page: null,
              class_id: classId,
              school_year: schoolYear,
              created_by: teacherId,
              meta: {
                manual: true,
                category,
                total_possible:
                  totalPossible,
                recorded_date:
                  date,
                notes:
                  notes || null,
              },
            }),
          }
        ),
        'Assignment create'
      );

    const assignment =
      assignmentRows[0];

    if (
      !assignment ||
      !Number.isSafeInteger(
        Number(assignment.id)
      ) ||
      Number(assignment.id) <= 0
    ) {
      throw new Error(
        'Assignment create returned no canonical row'
      );
    }

    createdAssignmentId =
      Number(assignment.id);

    const submittedAt =
      recordedAt(date);

    // 4. Create one canonical Graded instance per validated student.
    const instancePayloads =
      validatedStudents.map(
        (student) => ({
          assignment_id:
            createdAssignmentId,
          student_id:
            student.id,
          assigned_at:
            submittedAt,
          status:
            'Graded',
          settings: {},
          school_year:
            schoolYear,
        })
      );

    const instances =
      await readRows(
        await rest(
          '/rest/v1/assignment_instances',
          {
            method: 'POST',
            headers: {
              Prefer:
                'return=representation',
            },
            body:
              JSON.stringify(
                instancePayloads
              ),
          }
        ),
        'Assignment instances create'
      );

    if (
      instances.length !==
      validatedStudents.length
    ) {
      throw new Error(
        'Assignment instance create count mismatch'
      );
    }

    const instanceByStudent =
      new Map();

    for (const instance of instances) {
      if (
        !isUuid(instance.id) ||
        !isUuid(instance.student_id)
      ) {
        throw new Error(
          'Assignment instance create returned invalid row'
        );
      }

      instanceByStudent.set(
        instance.student_id,
        instance
      );
    }

    // 5. Create reviewed teacher-entered result rows.
    const submissionPayloads =
      validatedStudents.map(
        (student) => {
          const instance =
            instanceByStudent.get(
              student.id
            );

          if (!instance) {
            throw new Error(
              'Missing canonical assignment instance'
            );
          }

          return {
            instance_id:
              instance.id,
            answers: {},
            score_manual:
              scoreEarned,
            score_total:
              scorePercent,
            notes:
              notes || null,
            submitted_at:
              submittedAt,
            review_status:
              'reviewed',
            school_year:
              schoolYear,
          };
        }
      );

    const submissions =
      await readRows(
        await rest(
          '/rest/v1/submissions',
          {
            method: 'POST',
            headers: {
              Prefer:
                'return=representation',
            },
            body:
              JSON.stringify(
                submissionPayloads
              ),
          }
        ),
        'Submissions create'
      );

    if (
      submissions.length !==
      validatedStudents.length
    ) {
      throw new Error(
        'Submission create count mismatch'
      );
    }

    for (const submission of submissions) {
      if (
        !isUuid(submission.id) ||
        !isUuid(submission.instance_id) ||
        submission.review_status !==
          'reviewed'
      ) {
        throw new Error(
          'Submission create returned invalid row'
        );
      }
    }

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        assignment,
        saved_count:
          validatedStudents.length,
        score_percent:
          scorePercent,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  } catch (error) {
    if (createdAssignmentId !== null) {
      await cleanupNewAssignment(
        createdAssignmentId
      ).catch(() => {});
    }

    console.error(
      `[teacher-manual-grade-save] [${requestId}]`,
      error
    );

    return fail(
      event,
      requestId,
      500,
      'Failed to save manual grade'
    );
  }
};
