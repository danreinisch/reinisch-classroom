'use strict';

const {
  sign,
  verify,
  teacherCookie,
  getCookie,
} = require('./auth');

const STUDENT_COOKIE_NAME = 'sc';
const STUDENT_SESSION_SECONDS = 60 * 60 * 8;

/**
 * Normalize a student code for authenticated-session comparisons.
 */
function normalizeStudentCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Create a signed HttpOnly student-session cookie.
 */
function createStudentSessionCookie(
  code,
  secret,
  {
    secure = true,
    maxAge = STUDENT_SESSION_SECONDS,
  } = {}
) {
  const normalizedCode = normalizeStudentCode(code);

  if (!normalizedCode) {
    throw new Error('Student code is required');
  }

  if (!secret) {
    throw new Error('SESSION_SECRET is required');
  }

  const token = sign(
    {
      role: 'student',
      code: normalizedCode,
    },
    secret,
    {
      expSec: maxAge,
    }
  );

  return teacherCookie(
    STUDENT_COOKIE_NAME,
    token,
    {
      secure,
      maxAge,
    }
  );
}

/**
 * Require a valid signed student session.
 *
 * Optional requestedCode enforces that the student may only access
 * their own records.
 */
function requireStudent(
  event,
  secret,
  requestedCode = null
) {
  if (!secret) {
    return {
      ok: false,
      statusCode: 500,
      error: 'Server not configured',
    };
  }

  const token =
    getCookie(event, STUDENT_COOKIE_NAME);

  const payload =
    token
      ? verify(token, secret)
      : null;

  if (
    !payload ||
    payload.role !== 'student' ||
    !payload.code
  ) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Unauthorized',
    };
  }

  const authenticatedCode =
    normalizeStudentCode(payload.code);

  if (requestedCode !== null) {
    const normalizedRequested =
      normalizeStudentCode(requestedCode);

    if (
      !normalizedRequested ||
      normalizedRequested !== authenticatedCode
    ) {
      return {
        ok: false,
        statusCode: 403,
        error: 'Forbidden',
      };
    }
  }

  return {
    ok: true,
    student: {
      code: authenticatedCode,
    },
  };
}


/**
 * Expire the signed HttpOnly student-session cookie.
 */
function clearStudentSessionCookie({
  secure = true,
} = {}) {
  return teacherCookie(
    STUDENT_COOKIE_NAME,
    '',
    {
      secure,
      maxAge: 0,
    }
  );
}

module.exports = {
  STUDENT_COOKIE_NAME,
  STUDENT_SESSION_SECONDS,
  normalizeStudentCode,
  createStudentSessionCookie,
  clearStudentSessionCookie,
  requireStudent,
};
