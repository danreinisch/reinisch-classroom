'use strict';

// Teacher/admin action: reset one student's password.
// POST body:
//   { code: "S001" }
//     -> resets to default S001!
//
//   { code: "S001", password: "CustomPassword" }
//     -> sets teacher-specified password
//
// Requires authenticated teacher/admin HttpOnly session.

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateStringField,
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

exports.handler = async (event) => {
  const requestId = generateRequestId();

  console.log(
    `[student-reset-password] [${requestId}] ` +
    `Request received: ${event.httpMethod}`
  );

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(
      event,
      ['POST', 'OPTIONS'],
      ['Content-Type']
    );
  }

  if (event.httpMethod !== 'POST') {
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

  let body;

  try {
    body =
      JSON.parse(
        event.body ||
        '{}'
      );
  } catch {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: 'Invalid request body',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const {
    code,
    password,
  } = body;

  const codeValidation =
    validateStringField(
      code,
      'Student code',
      1,
      32
    );

  if (!codeValidation.valid) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: codeValidation.error,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const codeNorm =
    code.trim().toUpperCase();

  const nextPassword =
    typeof password === 'string' &&
    password.length > 0
      ? password
      : `${codeNorm}!`;

  const passwordValidation =
    validateStringField(
      nextPassword,
      'Password',
      1,
      128
    );

  if (!passwordValidation.valid) {
    return jsonResponse(
      event,
      400,
      {
        ok: false,
        error: passwordValidation.error,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  const headers = {
    apikey:
      SUPABASE_SERVICE_ROLE_KEY,
    Authorization:
      `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type':
      'application/json',
    Prefer:
      'return=representation',
  };

  try {
    let resetRes =
      await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/set_student_password`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            p_code: codeNorm,
            p_password: nextPassword,
          }),
        }
      );

    // Compatibility fallback for older RPC signature.
    if (!resetRes.ok) {
      console.warn(
        `[student-reset-password] [${requestId}] ` +
        `p_password signature failed (${resetRes.status}); ` +
        `trying legacy p_plain signature`
      );

      resetRes =
        await fetch(
          `${SUPABASE_URL}/rest/v1/rpc/set_student_password`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              p_code: codeNorm,
              p_plain: nextPassword,
            }),
          }
        );
    }

    if (!resetRes.ok) {
      const errorText =
        await resetRes
          .text()
          .catch(() => '');

      console.error(
        `[student-reset-password] [${requestId}] ` +
        `Password reset failed: ${resetRes.status} ` +
        errorText
      );

      return jsonResponse(
        event,
        500,
        {
          ok: false,
          error: 'Password reset failed',
        },
        {
          'Cache-Control': 'no-store',
        },
        requestId
      );
    }

    console.log(
      `[student-reset-password] [${requestId}] ` +
      `Password reset by authenticated teacher/admin ` +
      `for ${codeNorm}`
    );

    return jsonResponse(
      event,
      200,
      {
        ok: true,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  } catch (err) {
    console.error(
      `[student-reset-password] [${requestId}] Error:`,
      err.message
    );

    return jsonResponse(
      event,
      500,
      {
        ok: false,
        error: 'Password reset failed',
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }
};
