'use strict';

// Signed Teacher Center PAPER result/archive writer.
//
// Boundary:
//   signed teacher
//     -> canonical PAPER assignment
//     -> exact teacher-owned class
//     -> active student
//     -> active same-class enrollment
//     -> canonical assignment instance
//     -> canonical submission
//     -> canonical archive snapshot
//
// Teacher-entered PAPER evidence is terminal but does not run the
// interactive grading/finalization workflow:
//
//   assignment_instances.status = 'Reviewed'
//   submissions.review_status    = 'reviewed'
//
// Explicitly forbidden here:
//   - legacy submission-processing RPCs
//   - goal-evidence writes
//   - class-name/series authorization
//   - legacy teacher-helper authorization
//   - active-teacher fallback
//   - nullable archive provenance

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

const SESSION_SECRET =
  process.env.SESSION_SECRET;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_SUBMISSIONS = 20;

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function cleanStudentCode(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(trimmed)
  ) {
    return null;
  }

  return trimmed;
}

async function readRows(response, label) {
  if (!response || response.ok !== true) {
    const status =
      response && response.status
        ? response.status
        : 'unknown';

    throw new Error(
      `${label} failed (${status})`
    );
  }

  const data =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      `${label} returned non-array data`
    );
  }

  return data;
}

async function requireOk(response, label) {
  if (response && response.ok === true) {
    return;
  }

  const status =
    response && response.status
      ? response.status
      : 'unknown';

  throw new Error(
    `${label} failed (${status})`
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

function selectCanonicalSubmission(submissions) {
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

function computePaperScore(meta) {
  if (
    !meta ||
    typeof meta !== 'object' ||
    Array.isArray(meta) ||
    !Object.prototype.hasOwnProperty.call(
      meta,
      'score_earned'
    )
  ) {
    return {
      earned: null,
      percent: null,
    };
  }

  const earned =
    Number(meta.score_earned);

  const possible =
    Number(meta.total_possible);

  if (
    !Number.isFinite(earned) ||
    earned < 0 ||
    !Number.isFinite(possible) ||
    possible <= 0
  ) {
    return {
      earned: null,
      percent: null,
    };
  }

  return {
    earned,
    percent:
      Math.round(
        (earned / possible) * 100
      ),
  };
}

function deriveSubmittedAt(meta) {
  const value =
    meta &&
    typeof meta.date_completed === 'string'
      ? meta.date_completed.trim()
      : '';

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    const parsed =
      new Date(value);

    if (
      Number.isFinite(
        parsed.getTime()
      )
    ) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function response(
  event,
  statusCode,
  requestId,
  body
) {
  return jsonResponse(
    event,
    statusCode,
    body,
    {
      'Cache-Control': 'no-store',
    },
    requestId
  );
}

function fail(
  event,
  statusCode,
  requestId,
  error
) {
  return response(
    event,
    statusCode,
    requestId,
    {
      ok: false,
      error,
    }
  );
}

exports.handler =
  async function handler(event) {
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
        405,
        requestId,
        'Method Not Allowed'
      );
    }

    if (
      !SESSION_SECRET ||
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return fail(
        event,
        500,
        requestId,
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
        teacherAuth.statusCode || 401,
        requestId,
        'Unauthorized'
      );
    }

    const teacherId =
      teacherAuth.user &&
      teacherAuth.user.teacherId;

    if (!isUuid(teacherId)) {
      return fail(
        event,
        403,
        requestId,
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
        413,
        requestId,
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
        400,
        requestId,
        'Invalid JSON'
      );
    }

    const assignmentId =
      Number(body.assignmentId);

    const studentCode =
      cleanStudentCode(
        body.studentCode
      );

    if (
      !Number.isSafeInteger(
        assignmentId
      ) ||
      assignmentId <= 0
    ) {
      return fail(
        event,
        400,
        requestId,
        'Invalid assignmentId'
      );
    }

    if (!studentCode) {
      return fail(
        event,
        400,
        requestId,
        'Invalid studentCode'
      );
    }

    const schoolYear =
      getCurrentSchoolYear();

    try {
      // 1. Resolve exact canonical PAPER assignment.
      const assignments =
        await readRows(
          await rest(
            '/rest/v1/assignments' +
            '?select=id,title,type,series,page,meta,class_id,school_year' +
            `&id=eq.${encodeURIComponent(assignmentId)}` +
            '&limit=1'
          ),
          'Assignment query'
        );

      const assignment =
        assignments[0];

      const assignmentYear =
        assignment &&
        assignment.school_year !== null &&
        assignment.school_year !== undefined
          ? Number(
              assignment.school_year
            )
          : null;

      if (
        !assignment ||
        assignment.type !== 'paper' ||
        !isUuid(
          assignment.class_id
        ) ||
        (
          assignmentYear !== null &&
          assignmentYear !== schoolYear
        )
      ) {
        return fail(
          event,
          404,
          requestId,
          'Assignment not found'
        );
      }

      const classId =
        assignment.class_id;

      // Student code stored in PAPER metadata is provenance only.
      // When present, require it to agree with the requested student.
      const meta =
        assignment.meta &&
        typeof assignment.meta === 'object' &&
        !Array.isArray(
          assignment.meta
        )
          ? assignment.meta
          : {};

      const metaStudentCode =
        cleanStudentCode(
          meta.student_code
        );

      if (
        metaStudentCode &&
        metaStudentCode !== studentCode
      ) {
        return fail(
          event,
          404,
          requestId,
          'Student not found'
        );
      }

      // 2. Exact assignment class must belong to signed teacher.
      const ownedClasses =
        await readRows(
          await rest(
            '/rest/v1/classes' +
            '?select=id,name' +
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
          404,
          requestId,
          'Assignment not found'
        );
      }

      const ownedClass =
        ownedClasses[0];

      // 3. Resolve exact active student.
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
          404,
          requestId,
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
          404,
          requestId,
          'Student not found'
        );
      }

      // 5. Resolve canonical current-year assignment instance.
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
          409,
          requestId,
          'Multiple assignment instances found'
        );
      }

      let instance =
        instances[0] || null;

      let createdInstance =
        false;

      if (!instance) {
        const assignedAt =
          typeof meta.date_completed === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(
            meta.date_completed.trim()
          )
            ? meta.date_completed.trim()
            : undefined;

        const instanceBody = {
          assignment_id:
            assignmentId,
          student_id:
            student.id,
          status:
            'Reviewed',
          settings: {},
          school_year:
            schoolYear,
        };

        if (assignedAt) {
          instanceBody.assigned_at =
            assignedAt;
        }

        const createResponse =
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
                  instanceBody
                ),
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

          createdInstance =
            true;
        } else if (
          createResponse &&
          createResponse.status === 409
        ) {
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
          404,
          requestId,
          'Assignment instance not found'
        );
      }

      // Existing instances must become terminal teacher-entered evidence.
      if (
        !createdInstance ||
        instance.status !== 'Reviewed'
      ) {
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
                body:
                  JSON.stringify({
                    status:
                      'Reviewed',
                  }),
              }
            ),
            'Assignment instance review-state update'
          );

        instance =
          updatedInstances[0] || {
            ...instance,
            status: 'Reviewed',
          };
      }

      // 6. Resolve canonical submission.
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

      let createdSubmission =
        false;

      const paperScore =
        computePaperScore(meta);

      const feedback =
        typeof meta.notes === 'string' &&
        meta.notes.trim()
          ? meta.notes.trim()
          : null;

      if (submission) {
        const submissionPatch = {
          review_status:
            'reviewed',
        };

        if (
          paperScore.percent !== null
        ) {
          submissionPatch.score_manual =
            paperScore.earned;

          submissionPatch.score_total =
            paperScore.percent;
        }

        if (feedback !== null) {
          submissionPatch.feedback =
            feedback;
        }

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
                body:
                  JSON.stringify(
                    submissionPatch
                  ),
              }
            ),
            'Submission update'
          );

        submission =
          updated[0] || null;
      } else {
        const submissionBody = {
          instance_id:
            instance.id,
          answers: {},
          score_manual:
            paperScore.earned,
          score_total:
            paperScore.percent,
          feedback,
          submitted_at:
            deriveSubmittedAt(meta),
          review_status:
            'reviewed',
          school_year:
            schoolYear,
        };

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
                body:
                  JSON.stringify(
                    submissionBody
                  ),
              }
            ),
            'Submission create'
          );

        submission =
          created[0] || null;

        createdSubmission =
          true;
      }

      if (
        !submission ||
        !isUuid(submission.id)
      ) {
        throw new Error(
          'Submission save returned no canonical row'
        );
      }

      if (
        submission.review_status !== 'reviewed'
      ) {
        throw new Error(
          'Submission did not reach reviewed state'
        );
      }

      // 7. Reuse archive for this canonical submission when retrying.
      const archives =
        await readRows(
          await rest(
            '/rest/v1/submission_archives' +
            '?select=id,submission_id,student_id,assignment_id' +
            `&submission_id=eq.${encodeURIComponent(submission.id)}` +
            '&limit=2'
          ),
          'Submission archive query'
        );

      if (
        archives.length > 1
      ) {
        return fail(
          event,
          409,
          requestId,
          'Multiple submission archives found'
        );
      }

      let archive =
        archives[0] || null;

      let createdArchive =
        false;

      if (archive) {
        if (
          archive.student_id !==
            student.id ||
          String(
            archive.assignment_id
          ) !== String(
            assignmentId
          )
        ) {
          throw new Error(
            'Existing archive provenance mismatch'
          );
        }
      } else {
        const now =
          new Date().toISOString();

        const archiveRecord = {
          submission_id:
            submission.id,
          student_id:
            student.id,
          student_code:
            student.code,
          assignment_id:
            assignmentId,
          title:
            assignment.title,
          class_name:
            ownedClass.name ||
            assignment.series ||
            null,
          answers:
            submission.answers || {},
          score_auto:
            submission.score_auto ?? null,
          score_manual:
            submission.score_manual ?? null,
          score_total:
            submission.score_total ?? null,
          feedback:
            submission.feedback || null,
          submitted_at:
            submission.submitted_at,
          reviewed_at:
            now,
          archived_at:
            now,
          school_year:
            submission.school_year ??
            schoolYear,
        };

        const inserted =
          await readRows(
            await rest(
              '/rest/v1/submission_archives',
              {
                method: 'POST',
                headers: {
                  Prefer:
                    'return=representation',
                },
                body:
                  JSON.stringify(
                    archiveRecord
                  ),
              }
            ),
            'Submission archive create'
          );

        archive =
          inserted[0] || null;

        createdArchive =
          true;
      }

      if (
        !archive ||
        !isUuid(archive.id) ||
        !isUuid(
          archive.submission_id
        ) ||
        !isUuid(
          archive.student_id
        )
      ) {
        throw new Error(
          'Archive save returned incomplete provenance'
        );
      }

      return response(
        event,
        200,
        requestId,
        {
          ok: true,
          instance,
          submission,
          archive,
          created: {
            instance:
              createdInstance,
            submission:
              createdSubmission,
            archive:
              createdArchive,
          },
        }
      );
    } catch (error) {
      console.error(
        `[teacher-paper-result-save] [${requestId}]`,
        error
      );

      return fail(
        event,
        500,
        requestId,
        'Failed to save paper result'
      );
    }
  };
