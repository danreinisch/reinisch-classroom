'use strict';

// Signed Teacher Student onboarding / repair boundary.
//
// POST /.netlify/functions/teacher-student-onboard
//
// Body:
// {
//   code: "S069",
//   primary_case_manager?: "...",
//   class_names?: ["Language Arts 1 SC"]
// }
//
// Supported states:
//
//   missing student + missing login
//     -> create student
//     -> create login
//     -> create/reactivate requested class_enrollments
//
//   active student + missing login
//     -> reuse student
//     -> create login
//     -> create/reactivate requested class_enrollments
//
//   active student + existing valid login
//     -> reuse student
//     -> preserve login/password
//     -> create/reactivate requested class_enrollments
//
// Fail closed:
//
//   inactive/archived student
//   orphan login without student
//   wrong-role login
//   non-canonical login username
//   login linked to a different student
//
// No password is accepted from the browser.
// A newly provisioned account receives the established default
// through the existing database password-hashing primitive.
//
// Existing password hashes are never updated by onboarding.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  url: SUPABASE_URL,
  key: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseConfig();

const {
  SESSION_SECRET,
} = process.env;

const NO_STORE = {
  'Cache-Control': 'no-store',
};

const CODE_PATTERN =
  /^[A-Z0-9_-]{1,32}$/;

const MAX_CLASSES = 16;

class OnboardError extends Error {
  constructor(
    statusCode,
    message
  ) {
    super(message);
    this.name =
      'OnboardError';
    this.statusCode =
      statusCode;
  }
}

function normalizeOnboardRequest(
  body
) {
  if (
    body == null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new OnboardError(
      400,
      'Request body must be an object'
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      'password'
    ) ||
    Object.prototype.hasOwnProperty.call(
      body,
      'password_hash'
    )
  ) {
    throw new OnboardError(
      400,
      'Password is not accepted during onboarding'
    );
  }

  const code =
    String(body.code || '')
      .trim()
      .toUpperCase();

  if (
    !code ||
    !CODE_PATTERN.test(code)
  ) {
    throw new OnboardError(
      400,
      'Student code is invalid'
    );
  }

  let primaryCaseManager = null;

  if (
    body.primary_case_manager != null &&
    String(
      body.primary_case_manager
    ).trim() !== ''
  ) {
    primaryCaseManager =
      String(
        body.primary_case_manager
      ).trim();

    if (
      primaryCaseManager.length > 128
    ) {
      throw new OnboardError(
        400,
        'Primary case manager is too long'
      );
    }
  }

  const suppliedClasses =
    body.class_names == null
      ? []
      : body.class_names;

  if (
    !Array.isArray(
      suppliedClasses
    )
  ) {
    throw new OnboardError(
      400,
      'class_names must be an array'
    );
  }

  if (
    suppliedClasses.length >
    MAX_CLASSES
  ) {
    throw new OnboardError(
      400,
      `At most ${MAX_CLASSES} classes may be selected`
    );
  }

  const classNames = [];

  for (
    const rawName
    of suppliedClasses
  ) {
    if (
      typeof rawName !== 'string'
    ) {
      throw new OnboardError(
        400,
        'Each class name must be a string'
      );
    }

    const name =
      rawName.trim();

    if (
      !name ||
      name.length > 128
    ) {
      throw new OnboardError(
        400,
        'Class name is invalid'
      );
    }

    if (
      !classNames.includes(name)
    ) {
      classNames.push(name);
    }
  }

  return {
    code,
    primary_case_manager:
      primaryCaseManager,
    class_names:
      classNames,
  };
}

function serviceHeaders(
  prefer = null
) {
  const headers = {
    apikey:
      SUPABASE_SERVICE_ROLE_KEY,
    Authorization:
      `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type':
      'application/json',
  };

  if (prefer) {
    headers.Prefer =
      prefer;
  }

  return headers;
}

async function rest(
  path,
  options = {}
) {
  const {
    prefer = null,
    headers = {},
    ...requestOptions
  } = options;

  return fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...requestOptions,
      headers: {
        ...serviceHeaders(prefer),
        ...headers,
      },
    }
  );
}

async function readJson(
  response
) {
  return response
    .json()
    .catch(() => null);
}

function firstRow(
  value
) {
  if (
    Array.isArray(value)
  ) {
    return value[0] || null;
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    return value;
  }

  return null;
}

async function queryRows(
  path,
  label
) {
  const response =
    await rest(
      path,
      {
        method:
          'GET',
      }
    );

  if (!response.ok) {
    throw new Error(
      `${label} query failed with status ${response.status}`
    );
  }

  const body =
    await readJson(
      response
    );

  return Array.isArray(body)
    ? body
    : [];
}

async function deleteQuietly(
  path,
  requestId,
  label
) {
  try {
    const response =
      await rest(
        path,
        {
          method:
            'DELETE',
          prefer:
            'return=minimal',
        }
      );

    if (!response.ok) {
      console.warn(
        `[teacher-student-onboard] [${requestId}] ` +
        `Rollback failed for ${label}: ${response.status}`
      );
    }
  } catch (error) {
    console.warn(
      `[teacher-student-onboard] [${requestId}] ` +
      `Rollback error for ${label}: ${error.message}`
    );
  }
}

async function rollbackCreatedState({
  requestId,
  studentId,
  appUserId,
  studentCreated,
  loginCreated,
}) {
  if (
    loginCreated &&
    appUserId
  ) {
    await deleteQuietly(
      '/rest/v1/app_users' +
      `?id=eq.${encodeURIComponent(appUserId)}`,
      requestId,
      'new app_users row'
    );
  }

  if (
    studentCreated &&
    studentId
  ) {
    await deleteQuietly(
      '/rest/v1/students' +
      `?id=eq.${encodeURIComponent(studentId)}`,
      requestId,
      'new student row'
    );
  }
}

async function findStudent(
  code
) {
  const rows =
    await queryRows(
      '/rest/v1/students' +
      '?select=id,code,active,archived_at' +
      `&code=eq.${encodeURIComponent(code)}` +
      '&limit=2',
      'Student preflight'
    );

  if (
    rows.length > 1
  ) {
    throw new Error(
      'Student code resolved to multiple records'
    );
  }

  return rows[0] || null;
}

async function findLogin(
  code
) {
  const rows =
    await queryRows(
      '/rest/v1/app_users' +
      '?select=id,username,role,student_id' +
      `&username=ilike.${encodeURIComponent(code)}` +
      '&limit=2',
      'Student login preflight'
    );

  if (
    rows.length > 1
  ) {
    throw new OnboardError(
      409,
      'Multiple login accounts exist for this student code.'
    );
  }

  return rows[0] || null;
}

function validateReusableStudent(
  student
) {
  if (!student) {
    return;
  }

  if (
    student.active === false ||
    student.archived_at
  ) {
    throw new OnboardError(
      409,
      'Student is inactive or archived. Reactivate the existing student first.'
    );
  }
}

function validateReusableLogin({
  login,
  student,
  code,
}) {
  if (!login) {
    return;
  }

  if (!student) {
    throw new OnboardError(
      409,
      'A login account already exists for this code, but no student record exists.'
    );
  }

  if (
    login.role !== 'student'
  ) {
    throw new OnboardError(
      409,
      'The existing login account is not a student account.'
    );
  }

  if (
    login.username !== code
  ) {
    throw new OnboardError(
      409,
      'The existing student login uses a non-canonical username and requires authentication repair.'
    );
  }

  if (
    login.student_id &&
    login.student_id !== student.id
  ) {
    throw new OnboardError(
      409,
      'The existing student login is linked to a different student record.'
    );
  }
}

async function resolveTeacherId(
  username
) {
  const rows =
    await queryRows(
      '/rest/v1/teacher' +
      '?select=id,username' +
      `&username=eq.${encodeURIComponent(username)}` +
      '&limit=2',
      'Teacher identity'
    );

  if (
    rows.length !== 1
  ) {
    throw new Error(
      'Teacher ownership identity could not be resolved'
    );
  }

  return rows[0].id;
}

async function resolveOwnedClasses({
  teacherId,
  classNames,
}) {
  if (
    classNames.length === 0
  ) {
    return [];
  }

  const rows =
    await queryRows(
      '/rest/v1/classes' +
      '?select=id,code,name,teacher_id' +
      `&teacher_id=eq.${encodeURIComponent(teacherId)}`,
      'Teacher classes'
    );

  const byName =
    new Map();

  for (
    const row
    of rows
  ) {
    if (
      row &&
      row.name
    ) {
      byName.set(
        String(row.name),
        row
      );
    }
  }

  const resolved = [];

  for (
    const className
    of classNames
  ) {
    const row =
      byName.get(
        className
      );

    if (!row) {
      throw new OnboardError(
        400,
        `Class is unavailable for this teacher: ${className}`
      );
    }

    resolved.push(row);
  }

  return resolved;
}

async function createStudent(
  request
) {
  const payload = {
    code:
      request.code,
    name:
      request.code,
    active:
      true,
    archived_at:
      null,
  };

  if (
    request.primary_case_manager
  ) {
    payload.primary_case_manager =
      request.primary_case_manager;
  }

  const response =
    await rest(
      '/rest/v1/students',
      {
        method:
          'POST',
        prefer:
          'return=representation',
        body:
          JSON.stringify(payload),
      }
    );

  if (!response.ok) {
    throw new Error(
      `Student creation failed with status ${response.status}`
    );
  }

  const student =
    firstRow(
      await readJson(response)
    );

  if (
    !student ||
    !student.id
  ) {
    throw new Error(
      'Student creation returned no student identity'
    );
  }

  return student;
}

async function createStudentLogin({
  code,
  studentId,
}) {
  const defaultPassword =
    `${code}!`;

  const rpcResponse =
    await rest(
      '/rest/v1/rpc/set_user_password',
      {
        method:
          'POST',
        prefer:
          'return=representation',
        body:
          JSON.stringify({
            p_username:
              code,
            p_password:
              defaultPassword,
            p_role:
              'student',
            p_student_id:
              studentId,
          }),
      }
    );

  if (!rpcResponse.ok) {
    throw new Error(
      `Student login provisioning failed with status ${rpcResponse.status}`
    );
  }

  let user =
    firstRow(
      await readJson(
        rpcResponse
      )
    );

  if (
    !user ||
    !user.id
  ) {
    const rows =
      await queryRows(
        '/rest/v1/app_users' +
        '?select=id,username,role,student_id' +
        `&student_id=eq.${encodeURIComponent(studentId)}` +
        '&role=eq.student' +
        '&limit=2',
        'Provisioned login identity'
      );

    if (
      rows.length !== 1
    ) {
      throw new Error(
        'Provisioned student login could not be resolved'
      );
    }

    user =
      rows[0];
  }

  // The legacy set_user_password RPC lowercases usernames.
  // The preflight proved there was no existing case-insensitive
  // account before this new login was created. Normalize only
  // this newly created account back to the canonical uppercase
  // student code. No password field/hash is included here.
  const patchResponse =
    await rest(
      '/rest/v1/app_users' +
      `?id=eq.${encodeURIComponent(user.id)}`,
      {
        method:
          'PATCH',
        prefer:
          'return=representation',
        body:
          JSON.stringify({
            username:
              code,
            role:
              'student',
            student_id:
              studentId,
          }),
      }
    );

  if (!patchResponse.ok) {
    const error =
      new Error(
        `Student login normalization failed with status ${patchResponse.status}`
      );

    error.appUserId =
      user.id;

    throw error;
  }

  const patched =
    firstRow(
      await readJson(
        patchResponse
      )
    );

  if (
    patched &&
    patched.username !== code
  ) {
    const error =
      new Error(
        'Student login username was not normalized'
      );

    error.appUserId =
      user.id;

    throw error;
  }

  return {
    id:
      user.id,
  };
}

async function createEnrollments({
  studentId,
  classes,
}) {
  if (
    classes.length === 0
  ) {
    return [];
  }

  const rows =
    classes.map(
      classRow => ({
        class_id:
          classRow.id,
        student_id:
          studentId,
        active:
          true,
      })
    );

  const response =
    await rest(
      '/rest/v1/class_enrollments' +
      '?on_conflict=class_id,student_id',
      {
        method:
          'POST',
        prefer:
          'resolution=merge-duplicates,return=representation',
        body:
          JSON.stringify(rows),
      }
    );

  if (!response.ok) {
    throw new Error(
      `Class enrollment creation failed with status ${response.status}`
    );
  }

  const body =
    await readJson(
      response
    );

  return Array.isArray(body)
    ? body
    : rows;
}

exports.normalizeOnboardRequest =
  normalizeOnboardRequest;

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
        [
          'POST',
          'OPTIONS',
        ],
        [
          'Content-Type',
        ]
      );
    }

    if (
      event.httpMethod !==
      'POST'
    ) {
      return jsonResponse(
        event,
        405,
        {
          ok: false,
          error:
            'Method Not Allowed',
        },
        NO_STORE,
        requestId
      );
    }

    const bodySize =
      validateBodySize(
        event.body,
        32
      );

    if (!bodySize.valid) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Request body too large',
        },
        NO_STORE,
        requestId
      );
    }

    if (!SESSION_SECRET) {
      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error:
            'Server not configured',
        },
        NO_STORE,
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
          error:
            'Service unavailable',
        },
        NO_STORE,
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
          error:
            'Unauthorized',
        },
        NO_STORE,
        requestId
      );
    }

    const parseResult =
      safeJsonParse(
        event.body
      );

    if (!parseResult.ok) {
      return jsonResponse(
        event,
        400,
        {
          ok: false,
          error:
            'Invalid JSON in request body',
        },
        NO_STORE,
        requestId
      );
    }

    let request;

    try {
      request =
        normalizeOnboardRequest(
          parseResult.data
        );
    } catch (error) {
      return jsonResponse(
        event,
        error.statusCode || 400,
        {
          ok: false,
          error:
            error.message,
        },
        NO_STORE,
        requestId
      );
    }

    let student = null;
    let login = null;

    let studentCreated =
      false;

    let loginCreated =
      false;

    let studentId =
      null;

    let appUserId =
      null;

    try {
      // Student and login identity preflight.
      [
        student,
        login,
      ] =
        await Promise.all([
          findStudent(
            request.code
          ),
          findLogin(
            request.code
          ),
        ]);

      validateReusableStudent(
        student
      );

      validateReusableLogin({
        login,
        student,
        code:
          request.code,
      });

      const teacherUsername =
        String(
          teacherAuth.user
            ?.username || ''
        ).trim();

      if (!teacherUsername) {
        throw new Error(
          'Teacher username is unavailable'
        );
      }

      // Resolve every requested class before the first write.
      const teacherId =
        await resolveTeacherId(
          teacherUsername
        );

      const ownedClasses =
        await resolveOwnedClasses({
          teacherId,
          classNames:
            request.class_names,
        });

      if (!student) {
        student =
          await createStudent(
            request
          );

        studentCreated =
          true;
      }

      studentId =
        student.id;

      if (!login) {
        const createdLogin =
          await createStudentLogin({
            code:
              request.code,
            studentId,
          });

        loginCreated =
          true;

        appUserId =
          createdLogin.id;
      } else {
        appUserId =
          login.id;
      }

      const enrollments =
        await createEnrollments({
          studentId,
          classes:
            ownedClasses,
        });

      console.log(
        `[teacher-student-onboard] [${requestId}] ` +
        `${request.code}: ` +
        `student_created=${studentCreated}, ` +
        `login_created=${loginCreated}, ` +
        `enrollments=${enrollments.length}`
      );

      return jsonResponse(
        event,
        200,
        {
          ok:
            true,

          student: {
            id:
              student.id,
            code:
              request.code,
          },

          student_created:
            studentCreated,

          login_created:
            loginCreated,

          enrollment_count:
            enrollments.length,
        },
        NO_STORE,
        requestId
      );
    } catch (error) {
      console.error(
        `[teacher-student-onboard] [${requestId}] ` +
        error.message
      );

      if (
        error.appUserId &&
        !appUserId
      ) {
        appUserId =
          error.appUserId;

        loginCreated =
          true;
      }

      if (
        studentCreated ||
        loginCreated
      ) {
        await rollbackCreatedState({
          requestId,
          studentId,
          appUserId,
          studentCreated,
          loginCreated,
        });
      }

      if (
        error instanceof
        OnboardError
      ) {
        return jsonResponse(
          event,
          error.statusCode,
          {
            ok: false,
            error:
              error.message,
          },
          NO_STORE,
          requestId
        );
      }

      return jsonResponse(
        event,
        502,
        {
          ok: false,
          error:
            'Student onboarding failed',
        },
        NO_STORE,
        requestId
      );
    }
  };
