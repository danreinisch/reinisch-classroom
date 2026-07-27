'use strict';

// Teacher-only read endpoint for student password status metadata.
// GET /.netlify/functions/teacher-student-password-statuses
//
// Returns whether each student account is still using its default password.
// Does not return password hashes or custom password values.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  requireTeacher,
} = require('./_lib/auth');

const {
  rpc,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = require('./_lib/supa');

const {
  SESSION_SECRET,
} = process.env;

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

  try {
    const rpcResponse =
      await rpc(
        'list_student_password_statuses',
        {}
      );

    if (!rpcResponse.ok) {
      throw new Error(
        `Password status query failed: ${rpcResponse.status}`
      );
    }

    const result =
      await rpcResponse.json();

    const statuses =
      Array.isArray(result)
        ? result
        : [];

    return jsonResponse(
      event,
      200,
      {
        ok: true,
        statuses,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  } catch (error) {
    console.error(
      `[teacher-student-password-statuses] [${requestId}] Error:`,
      error
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: 'Password status service error',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }
};
