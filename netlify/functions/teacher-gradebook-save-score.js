'use strict';

// Signed Teacher Center Gradebook score writer.
//
// Scope:
//   Existing canonical assignments only.
//
// Security boundary:
//   signed teacherId
//     -> canonical numeric assignment
//     -> assignment.class_id
//     -> exact class.teacher_id == signed teacherId
//     -> active student
//     -> active enrollment in that SAME class
//     -> canonical assignment instance
//     -> canonical Gradebook submission
//
// No authorization is derived from assignment.series, class names,
// is_teacher_of(), browser instance IDs, or browser submission IDs.

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
  getOperationalSchoolYear,
} = require('./_lib/school-year');

const {
  SESSION_SECRET,
} = process.env;

const MAX_BODY_BYTES = 8192;
const MAX_SUBMISSIONS = 500;

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function normalizeAssignmentId(value) {
  const text =
    String(value ?? '').trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const number =
    Number(text);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}

function normalizeStudentCode(value) {
  const code =
    String(value ?? '')
      .trim()
      .toUpperCase();

  if (
    !code ||
    !/^[A-Z0-9_-]{1,64}$/.test(code)
  ) {
    return null;
  }

  return code;
}

function normalizeScore(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return null;
  }

  return value;
}

function normalizeOptionalScoreEarned(value) {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
}

async function readRows(
  response,
  label
) {
  if (
    !response ||
    response.ok !== true
  ) {
    const status =
      response &&
      Number.isInteger(response.status)
        ? response.status
        : 0;

    let detail = '';

    if (
      response &&
      typeof response.text === 'function'
    ) {
      detail =
        await response
          .text()
          .catch(() => '');
    }

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
    await response
      .json()
      .catch(() => []);

  return Array.isArray(body)
    ? body
    : [];
}

async function requireOk(
  response,
  label
) {
  if (
    response &&
    response.ok === true
  ) {
    return;
  }

  const status =
    response &&
    Number.isInteger(response.status)
      ? response.status
      : 0;

  let detail = '';

  if (
    response &&
    typeof response.text === 'function'
  ) {
    detail =
      await response
        .text()
        .catch(() => '');
  }

  throw new Error(
    `${label} failed: ${status}` +
    (
      detail
        ? ` ${detail.slice(0, 160)}`
        : ''
    )
  );
}

function hasAnswers(submission) {
  return Boolean(
    submission &&
    submission.answers &&
    typeof submission.answers === 'object' &&
    !Array.isArray(submission.answers) &&
    Object.keys(submission.answers).length > 0
  );
}

function submissionTime(submission) {
  const value =
    Date.parse(
      submission &&
      submission.submitted_at
        ? submission.submitted_at
        : ''
    );

  return Number.isFinite(value)
    ? value
    : 0;
}

// Match the canonical browser deduplication rule:
// prefer answered work over empty shells; otherwise prefer newest.
function selectCanonicalSubmission(
  submissions
) {
  let winner = null;

  for (const submission of submissions) {
    if (
      !submission ||
      !isUuid(submission.id)
    ) {
      continue;
    }

    if (!winner) {
      winner = submission;
      continue;
    }

    const candidateHasAnswers =
      hasAnswers(submission);

    const winnerHasAnswers =
      hasAnswers(winner);

    if (
      candidateHasAnswers &&
      !winnerHasAnswers
    ) {
      winner = submission;
      continue;
    }

    if (
      !candidateHasAnswers &&
      winnerHasAnswers
    ) {
      continue;
    }

    if (
      submissionTime(submission) >
      submissionTime(winner)
    ) {
      winner = submission;
    }
  }

  return winner;
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
  };
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
    noStoreHeaders(),
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

    if (!SESSION_SECRET) {
      return fail(
        event,
        requestId,
        500,
        'Server not configured'
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
        401,
        'Unauthorized'
      );
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return fail(
        event,
        requestId,
        503,
        'Service unavailable'
      );
    }

    const teacherId =
      teacherAuth.user &&
      teacherAuth.user.teacherId;

    if (!isUuid(teacherId)) {
      return fail(
        event,
        requestId,
        403,
        'Teacher identity unavailable'
      );
    }

    const rawBody =
      event.body || '';

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

    const assignmentId =
      normalizeAssignmentId(
        body.assignmentId
      );

    const studentCode =
      normalizeStudentCode(
        body.studentCode
      );

    const score =
      normalizeScore(
        body.score
      );

    const scoreEarned =
      normalizeOptionalScoreEarned(
        body.scoreEarned
      );

    if (assignmentId === null) {
      return fail(
        event,
        requestId,
        400,
        'Invalid assignmentId'
      );
    }

    if (studentCode === null) {
      return fail(
        event,
        requestId,
        400,
        'Invalid studentCode'
      );
    }

    if (score === null) {
      return fail(
        event,
        requestId,
        400,
        'Invalid score'
      );
    }

    if (scoreEarned === null) {
      return fail(
        event,
        requestId,
        400,
        'Invalid scoreEarned'
      );
    }

    const schoolYear =
      getOperationalSchoolYear();

    try {
      // 1. Resolve the exact canonical assignment.
      const assignments =
        await readRows(
          await rest(
            '/rest/v1/assignments' +
            '?select=id,class_id,type,meta,school_year' +
            `&id=eq.${encodeURIComponent(assignmentId)}` +
            '&limit=1'
          ),
          'Assignment query'
        );

      const assignment =
        assignments[0];

      const assignmentSchoolYear =
        assignment &&
        assignment.school_year !== null &&
        assignment.school_year !== undefined
          ? Number(
              assignment.school_year
            )
          : null;

      if (
        !assignment ||
        !isUuid(
          assignment.class_id
        ) ||
        (
          assignmentSchoolYear !== null &&
          assignmentSchoolYear !== schoolYear
        )
      ) {
        return fail(
          event,
          requestId,
          404,
          'Assignment not found'
        );
      }

      const assignmentMeta =
        assignment.meta &&
        typeof assignment.meta === 'object' &&
        !Array.isArray(assignment.meta)
          ? assignment.meta
          : {};

      const isManualAssignment =
        assignmentMeta.manual === true;

      if (isManualAssignment) {
        const totalPossible =
          Number(
            assignmentMeta.total_possible
          );

        const expectedScore =
          Number.isFinite(totalPossible) &&
          totalPossible > 0 &&
          scoreEarned !== undefined
            ? Math.round(
                (
                  scoreEarned /
                  totalPossible
                ) * 100
              )
            : null;

        if (
          scoreEarned === undefined ||
          !Number.isFinite(totalPossible) ||
          totalPossible < 1 ||
          scoreEarned > totalPossible ||
          score !== expectedScore
        ) {
          return fail(
            event,
            requestId,
            400,
            'Invalid manual score'
          );
        }
      }

      const submissionScoreFields =
        isManualAssignment
          ? {
              score_total:
                score,
              score_manual:
                scoreEarned,
              review_status:
                'reviewed',
            }
          : {
              score_total:
                score,
            };

      const finalInstanceStatus =
        isManualAssignment
          ? 'Graded'
          : 'Submitted';

      const classId =
        assignment.class_id;

      // 2. The exact class must belong to the signed teacher.
      const ownedClasses =
        await readRows(
          await rest(
            '/rest/v1/classes' +
            '?select=id' +
            `&id=eq.${encodeURIComponent(classId)}` +
            `&teacher_id=eq.${encodeURIComponent(teacherId)}` +
            '&limit=1'
          ),
          'Class ownership query'
        );

      if (
        ownedClasses.length !== 1
      ) {
        return fail(
          event,
          requestId,
          404,
          'Assignment not found'
        );
      }

      // 3. Resolve one exact active student by pseudonymous code.
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

      // 4. Same-class active enrollment is mandatory.
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
          'Enrollment query'
        );

      if (
        enrollments.length !== 1
      ) {
        return fail(
          event,
          requestId,
          404,
          'Student not found'
        );
      }

      // 5. Find the canonical current-year assignment instance.
      const instanceQueryPath =
        '/rest/v1/assignment_instances' +
        '?select=id,assignment_id,student_id,status,settings,school_year' +
        `&assignment_id=eq.${encodeURIComponent(assignmentId)}` +
        `&student_id=eq.${encodeURIComponent(student.id)}` +
        `&or=(school_year.eq.${schoolYear},school_year.is.null)` +
        '&limit=2';

      let instances =
        await readRows(
          await rest(
            instanceQueryPath
          ),
          'Assignment instance query'
        );

      if (
        instances.length > 1
      ) {
        return fail(
          event,
          requestId,
          409,
          'Multiple assignment instances found'
        );
      }

      let instance =
        instances[0] || null;

      let createdInstance = false;

      if (!instance) {
        const createResponse =
          await rest(
            '/rest/v1/assignment_instances',
            {
              method: 'POST',
              headers: {
                Prefer:
                  'return=representation',
              },
              body: JSON.stringify({
                assignment_id:
                  assignmentId,
                student_id:
                  student.id,
                status:
                  'Assigned',
                settings: {},
                school_year:
                  schoolYear,
              }),
            }
          );

        if (
          createResponse &&
          createResponse.ok === true
        ) {
          instances =
            await readRows(
              createResponse,
              'Assignment instance create'
            );

          instance =
            instances[0] || null;

          createdInstance = true;
        } else if (
          createResponse &&
          createResponse.status === 409
        ) {
          // Preserve the old atomic-upsert behavior under a race:
          // another request may have created the unique
          // (assignment_id, student_id) instance after our initial read.
          instances =
            await readRows(
              await rest(
                instanceQueryPath
              ),
              'Assignment instance conflict reread'
            );

          if (
            instances.length !== 1
          ) {
            throw new Error(
              'Assignment instance conflict could not be resolved'
            );
          }

          instance =
            instances[0];
        } else {
          await requireOk(
            createResponse,
            'Assignment instance create'
          );
        }
      }

      if (
        !instance ||
        !isUuid(instance.id)
      ) {
        throw new Error(
          'Assignment instance resolution returned no canonical row'
        );
      }

      if (
        instance.settings &&
        instance.settings.non_instructional === true
      ) {
        return fail(
          event,
          requestId,
          404,
          'Assignment instance not found'
        );
      }

      // 6. Select the same logical submission the Gradebook reader uses.
      const submissions =
        await readRows(
          await rest(
            '/rest/v1/submissions' +
            '?select=*' +
            `&instance_id=eq.${encodeURIComponent(instance.id)}` +
            `&or=(school_year.eq.${schoolYear},school_year.is.null)` +
            '&order=submitted_at.desc' +
            `&limit=${MAX_SUBMISSIONS}`
          ),
          'Submissions query'
        );

      let submission =
        selectCanonicalSubmission(
          submissions
        );

      let createdSubmission = false;

      if (submission) {
        // Grade edits change the grade only.
        // submitted_at remains the student's submission timestamp.
        const updated =
          await readRows(
            await rest(
              '/rest/v1/submissions' +
              `?id=eq.${encodeURIComponent(submission.id)}`,
              {
                method: 'PATCH',
                headers: {
                  Prefer:
                    'return=representation',
                },
                body: JSON.stringify(
                  submissionScoreFields
                ),
              }
            ),
            'Submission score update'
          );

        submission =
          updated[0] || null;
      } else {
        const created =
          await readRows(
            await rest(
              '/rest/v1/submissions',
              {
                method: 'POST',
                headers: {
                  Prefer:
                    'return=representation',
                },
                body: JSON.stringify({
                  instance_id:
                    instance.id,
                  answers: {},
                  ...submissionScoreFields,
                  school_year:
                    schoolYear,
                }),
              }
            ),
            'Submission create'
          );

        submission =
          created[0] || null;

        createdSubmission = true;
      }

      if (
        !submission ||
        !isUuid(submission.id)
      ) {
        throw new Error(
          'Submission save returned no row'
        );
      }

      // 7. Preserve digital lifecycle; MANUAL entries finish Graded.
      const updatedInstances =
        await readRows(
          await rest(
            '/rest/v1/assignment_instances' +
            `?id=eq.${encodeURIComponent(instance.id)}`,
            {
              method: 'PATCH',
              headers: {
                Prefer:
                  'return=representation',
              },
              body: JSON.stringify({
                status:
                  finalInstanceStatus,
              }),
            }
          ),
          'Assignment instance status update'
        );

      const updatedInstance =
        updatedInstances[0] || {
          ...instance,
          status:
            finalInstanceStatus,
        };

      return jsonResponse(
        event,
        200,
        {
          ok: true,
          created_instance:
            createdInstance,
          created_submission:
            createdSubmission,
          instance: {
            ...updatedInstance,
            student_code:
              studentCode,
          },
          submission,
        },
        noStoreHeaders(),
        requestId
      );
    } catch (error) {
      console.error(
        `[teacher-gradebook-save-score] [${requestId}]`,
        error
      );

      return fail(
        event,
        requestId,
        500,
        'Failed to save Gradebook score'
      );
    }
  };
